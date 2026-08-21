import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import type {
  PaymentAbandonment,
  CreateAbandonmentRequest,
  AbandonmentFilters,
  AbandonmentStats,
  TierType,
  FollowupStatus,
} from '../types/index.js';
import { AppError } from '../types/index.js';
import { emailService } from './email.service.js';
import crypto from 'crypto';

export class AbandonmentService {
  /**
   * Get pending registrations that haven't completed payment
   * These are potential abandonments (held seats without payment)
   */
  async getPendingRegistrations(): Promise<{
    registrations: Array<{
      id: string;
      name: string;
      email: string;
      phone: string;
      business_name: string | null;
      tier: TierType;
      amount: number;
      created_at: string;
      razorpay_order_id: string;
      time_remaining_minutes: number;
      is_expired: boolean;
    }>;
    total: number;
  }> {
    try {
      // Get registrations with pending payment status
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching pending registrations', { error: error.message });
        return { registrations: [], total: 0 };
      }

      const now = new Date();
      const SEAT_HOLD_DURATION_MS = 60 * 60 * 1000; // 1 hour

      const registrations = (data || []).map((reg) => {
        const createdAt = new Date(reg.created_at);
        const expiresAt = new Date(createdAt.getTime() + SEAT_HOLD_DURATION_MS);
        const timeRemainingMs = expiresAt.getTime() - now.getTime();

        return {
          id: reg.id,
          name: reg.name,
          email: reg.email,
          phone: reg.phone,
          business_name: reg.business_name,
          tier: reg.tier as TierType,
          amount: reg.amount_paid,
          created_at: reg.created_at,
          razorpay_order_id: reg.razorpay_order_id,
          time_remaining_minutes: Math.max(0, Math.floor(timeRemainingMs / 60000)),
          is_expired: timeRemainingMs <= 0,
        };
      });

      return {
        registrations,
        total: registrations.length,
      };
    } catch (error) {
      logger.error('Error in getPendingRegistrations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { registrations: [], total: 0 };
    }
  }

  /**
   * Release expired pending registrations and record abandonments
   * Returns the number of seats released
   */
  async releaseExpiredRegistrations(): Promise<{
    released: number;
    releasedRegistrations: Array<{ id: string; email: string; tier: TierType }>;
  }> {
    try {
      const { registrations } = await this.getPendingRegistrations();
      const expiredRegistrations = registrations.filter((r) => r.is_expired);

      const releasedRegistrations: Array<{ id: string; email: string; tier: TierType }> = [];

      for (const reg of expiredRegistrations) {
        try {
          // Record abandonment
          await this.recordAbandonment(
            {
              registration_id: reg.id,
              razorpay_order_id: reg.razorpay_order_id,
              name: reg.name,
              email: reg.email,
              phone: reg.phone,
              business_name: reg.business_name || undefined,
              tier: reg.tier,
              amount: reg.amount,
              abandonment_type: 'timeout',
              abandonment_reason: 'Payment not completed within 1 hour - seat automatically released',
            },
            {}
          );

          // Release the held seat
          const { data: inventory } = await supabase
            .from('seat_inventory')
            .select('held_seats')
            .eq('tier_name', reg.tier)
            .single();

          if (inventory && inventory.held_seats > 0) {
            await supabase
              .from('seat_inventory')
              .update({ held_seats: inventory.held_seats - 1 })
              .eq('tier_name', reg.tier);
          }

          // Update registration status to cancelled
          await supabase
            .from('registrations')
            .update({
              payment_status: 'failed',
              registration_status: 'cancelled',
            })
            .eq('id', reg.id);

          // Update pending order status
          if (reg.razorpay_order_id) {
            await supabase
              .from('pending_orders')
              .update({ status: 'expired' })
              .eq('razorpay_order_id', reg.razorpay_order_id);
          }

          releasedRegistrations.push({ id: reg.id, email: reg.email, tier: reg.tier });
          logger.info('Released expired registration', { id: reg.id, email: reg.email, tier: reg.tier });
        } catch (err) {
          logger.error('Error releasing expired registration', {
            id: reg.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return {
        released: releasedRegistrations.length,
        releasedRegistrations,
      };
    } catch (error) {
      logger.error('Error in releaseExpiredRegistrations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { released: 0, releasedRegistrations: [] };
    }
  }

  /**
   * Release the oldest held seat (FIFO) to make room for a new booking
   * This is called when all seats are held but none are sold
   */
  async releaseOldestHeldSeat(tier: TierType): Promise<{
    success: boolean;
    releasedRegistration?: { id: string; email: string; name: string };
  }> {
    try {
      // Get the oldest pending registration for this tier
      const { data: oldestPending, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('tier', tier)
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error || !oldestPending) {
        return { success: false };
      }

      // Record abandonment for the released registration
      await this.recordAbandonment(
        {
          registration_id: oldestPending.id,
          razorpay_order_id: oldestPending.razorpay_order_id,
          name: oldestPending.name,
          email: oldestPending.email,
          phone: oldestPending.phone,
          business_name: oldestPending.business_name || undefined,
          tier: oldestPending.tier,
          amount: oldestPending.amount_paid,
          abandonment_type: 'timeout',
          abandonment_reason: 'Seat released for new booking (FIFO)',
        },
        {}
      );

      // Release the held seat
      const { data: inventory } = await supabase
        .from('seat_inventory')
        .select('held_seats')
        .eq('tier_name', tier)
        .single();

      if (inventory && inventory.held_seats > 0) {
        await supabase
          .from('seat_inventory')
          .update({ held_seats: inventory.held_seats - 1 })
          .eq('tier_name', tier);
      }

      // Update registration status
      await supabase
        .from('registrations')
        .update({
          payment_status: 'failed',
          registration_status: 'cancelled',
        })
        .eq('id', oldestPending.id);

      // Update pending order status
      if (oldestPending.razorpay_order_id) {
        await supabase
          .from('pending_orders')
          .update({ status: 'expired' })
          .eq('razorpay_order_id', oldestPending.razorpay_order_id);
      }

      logger.info('Released oldest held seat (FIFO)', {
        tier,
        releasedId: oldestPending.id,
        releasedEmail: oldestPending.email,
      });

      return {
        success: true,
        releasedRegistration: {
          id: oldestPending.id,
          email: oldestPending.email,
          name: oldestPending.name,
        },
      };
    } catch (error) {
      logger.error('Error in releaseOldestHeldSeat', {
        tier,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false };
    }
  }

  /**
   * Record a new payment abandonment
   */
  async recordAbandonment(
    data: CreateAbandonmentRequest,
    metadata?: { ip_address?: string; user_agent?: string }
  ): Promise<PaymentAbandonment> {
    try {
      // Check if an abandonment already exists for this order
      if (data.razorpay_order_id) {
        const { data: existing } = await supabase
          .from('payment_abandonments')
          .select('id')
          .eq('razorpay_order_id', data.razorpay_order_id)
          .single();

        if (existing) {
          logger.info('Abandonment already recorded for this order', {
            orderId: data.razorpay_order_id,
          });
          // Return the existing record
          const { data: existingRecord } = await supabase
            .from('payment_abandonments')
            .select('*')
            .eq('id', existing.id)
            .single();
          return existingRecord as PaymentAbandonment;
        }
      }

      const abandonmentData = {
        registration_id: data.registration_id || null,
        razorpay_order_id: data.razorpay_order_id || null,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        business_name: data.business_name || null,
        tier: data.tier,
        amount: data.amount,
        abandonment_type: data.abandonment_type,
        abandonment_reason: data.abandonment_reason || null,
        followup_status: 'pending' as FollowupStatus,
        ip_address: metadata?.ip_address || data.ip_address || null,
        user_agent: metadata?.user_agent || data.user_agent || null,
        utm_source: data.utm_source || null,
        utm_campaign: data.utm_campaign || null,
        abandoned_at: new Date().toISOString(),
      };

      const { data: abandonment, error } = await supabase
        .from('payment_abandonments')
        .insert(abandonmentData)
        .select()
        .single();

      if (error) {
        logger.error('Error recording abandonment', { error: error.message });
        throw new AppError('Failed to record abandonment', 500, 'ABANDONMENT_CREATE_ERROR');
      }

      logger.info('Payment abandonment recorded', {
        id: abandonment.id,
        email: data.email,
        tier: data.tier,
        type: data.abandonment_type,
      });

      // Automatically send recovery email (async, don't block)
      // Only send for cancelled/failed payments, not for FIFO releases
      if (data.abandonment_type !== 'timeout' || !data.abandonment_reason?.includes('FIFO')) {
        this.sendFollowupEmail(abandonment.id).catch((err) => {
          logger.error('Failed to send automatic recovery email', {
            abandonmentId: abandonment.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }

      return abandonment as PaymentAbandonment;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in recordAbandonment', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get all abandonments with filters for admin
   */
  async getAll(filters: AbandonmentFilters): Promise<{ abandonments: PaymentAbandonment[]; total: number }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;

      let query = supabase.from('payment_abandonments').select('*', { count: 'exact' });

      // Apply filters
      if (filters.abandonment_type) {
        query = query.eq('abandonment_type', filters.abandonment_type);
      }
      if (filters.followup_status) {
        query = query.eq('followup_status', filters.followup_status);
      }
      if (filters.tier) {
        query = query.eq('tier', filters.tier);
      }
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        query = query.or(
          `name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm},business_name.ilike.${searchTerm}`
        );
      }
      if (filters.date_from) {
        query = query.gte('abandoned_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('abandoned_at', filters.date_to);
      }

      // Apply sorting
      const sortBy = filters.sort_by || 'abandoned_at';
      const sortOrder = filters.sort_order === 'asc' ? true : false;
      query = query.order(sortBy, { ascending: sortOrder });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error fetching abandonments', { error: error.message });
        throw new AppError('Failed to fetch abandonments', 500, 'ABANDONMENT_FETCH_ERROR');
      }

      return {
        abandonments: data as PaymentAbandonment[],
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get abandonment by ID
   */
  async getById(id: string): Promise<PaymentAbandonment | null> {
    try {
      const { data, error } = await supabase
        .from('payment_abandonments')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Error fetching abandonment', { id, error: error.message });
        throw new AppError('Failed to fetch abandonment', 500, 'ABANDONMENT_FETCH_ERROR');
      }

      return data as PaymentAbandonment | null;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Delete abandonment by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('payment_abandonments')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Error deleting abandonment', { id, error: error.message });
        throw new AppError('Failed to delete abandonment', 500, 'ABANDONMENT_DELETE_ERROR');
      }

      logger.info('Abandonment deleted', { id });
      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get abandonment by Razorpay order ID
   */
  async getByOrderId(orderId: string): Promise<PaymentAbandonment | null> {
    try {
      const { data, error } = await supabase
        .from('payment_abandonments')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .single();

      if (error && error.code !== 'PGRST116') {
        return null;
      }

      return data as PaymentAbandonment | null;
    } catch {
      return null;
    }
  }

  /**
   * Get abandonment by registration ID
   */
  async getByRegistrationId(registrationId: string): Promise<PaymentAbandonment | null> {
    try {
      const { data, error } = await supabase
        .from('payment_abandonments')
        .select('*')
        .eq('registration_id', registrationId)
        .order('abandoned_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Error fetching abandonment by registration ID', { registrationId, error: error.message });
        return null;
      }

      return data as PaymentAbandonment | null;
    } catch {
      return null;
    }
  }

  /**
   * Update follow-up status
   */
  async updateFollowupStatus(
    id: string,
    status: FollowupStatus,
    notes?: string,
    assignedTo?: string
  ): Promise<PaymentAbandonment> {
    try {
      const updateData: Record<string, unknown> = {
        followup_status: status,
        last_followup_at: new Date().toISOString(),
      };

      if (notes !== undefined) {
        // Get current notes and append
        const { data: current } = await supabase
          .from('payment_abandonments')
          .select('admin_notes, followup_attempts')
          .eq('id', id)
          .single();

        const timestamp = new Date().toISOString();
        const newNote = `[${timestamp}] Status: ${status}${notes ? ` - ${notes}` : ''}`;
        updateData.admin_notes = current?.admin_notes
          ? `${current.admin_notes}\n${newNote}`
          : newNote;
        updateData.followup_attempts = (current?.followup_attempts || 0) + 1;
      }

      if (assignedTo !== undefined) {
        updateData.assigned_to = assignedTo;
      }

      if (status === 'converted') {
        updateData.converted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('payment_abandonments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating followup status', { id, error: error.message });
        throw new AppError('Failed to update followup status', 500, 'FOLLOWUP_UPDATE_ERROR');
      }

      logger.info('Followup status updated', { id, status });
      return data as PaymentAbandonment;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Generate recovery token and link
   */
  async generateRecoveryLink(id: string): Promise<{
    token: string;
    link: string;
    qrCodeDataUrl: string;
    expiresAt: string;
  }> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

      const { error } = await supabase
        .from('payment_abandonments')
        .update({
          recovery_token: token,
          recovery_link_expires_at: expiresAt,
          recovery_link_used: false,
        })
        .eq('id', id);

      if (error) {
        logger.error('Error generating recovery link', { id, error: error.message });
        throw new AppError('Failed to generate recovery link', 500, 'RECOVERY_LINK_ERROR');
      }

      const link = `${config.frontendUrl}/recover/${token}`;
      // Use a hosted URL for the QR code image (email clients block base64 data URLs)
      const qrCodeUrl = `${config.apiBaseUrl}/api/qr/${token}`;

      logger.info('Recovery link generated', { id, expiresAt });

      return {
        token,
        link,
        qrCodeDataUrl: qrCodeUrl,
        expiresAt,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Validate recovery token
   */
  async validateRecoveryToken(token: string): Promise<PaymentAbandonment | null> {
    try {
      const { data, error } = await supabase
        .from('payment_abandonments')
        .select('*')
        .eq('recovery_token', token)
        .eq('recovery_link_used', false)
        .gte('recovery_link_expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        return null;
      }

      return data as PaymentAbandonment;
    } catch {
      return null;
    }
  }

  /**
   * Get abandonment by recovery token (without checking expiry/used status)
   * Used after payment succeeds to find the abandonment record for conversion tracking
   */
  async getByRecoveryToken(token: string): Promise<PaymentAbandonment | null> {
    try {
      const { data, error } = await supabase
        .from('payment_abandonments')
        .select('*')
        .eq('recovery_token', token)
        .single();

      if (error || !data) {
        return null;
      }

      return data as PaymentAbandonment;
    } catch {
      return null;
    }
  }

  /**
   * Mark recovery link as used
   */
  async markRecoveryLinkUsed(token: string): Promise<void> {
    const { error } = await supabase
      .from('payment_abandonments')
      .update({ recovery_link_used: true })
      .eq('recovery_token', token);

    if (error) {
      logger.error('Error marking recovery link as used', { error: error.message });
    }
  }

  /**
   * Mark abandonment as converted
   */
  async markConverted(id: string, registrationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('payment_abandonments')
        .update({
          abandonment_type: 'converted',
          followup_status: 'converted',
          converted_at: new Date().toISOString(),
          converted_registration_id: registrationId,
        })
        .eq('id', id);

      if (error) {
        logger.error('Supabase error marking abandonment as converted', {
          id,
          registrationId,
          error: error.message,
          code: error.code,
        });
        return;
      }

      logger.info('Abandonment marked as converted', { id, registrationId });
    } catch (error) {
      logger.error('Error marking abandonment as converted', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get stats for dashboard
   */
  async getStats(): Promise<AbandonmentStats> {
    try {
      const { data, error } = await supabase.from('payment_abandonments').select('followup_status, amount');

      if (error) {
        throw new AppError('Failed to fetch abandonment stats', 500, 'STATS_FETCH_ERROR');
      }

      const stats: AbandonmentStats = {
        total_abandonments: data.length,
        pending_followup: data.filter((d) => d.followup_status === 'pending').length,
        email_sent: data.filter((d) => d.followup_status === 'email_sent').length,
        contacted: data.filter((d) => d.followup_status === 'contacted').length,
        converted: data.filter((d) => d.followup_status === 'converted').length,
        declined: data.filter((d) => d.followup_status === 'declined').length,
        unresponsive: data.filter((d) => d.followup_status === 'unresponsive').length,
        total_lost_revenue: data
          .filter((d) => d.followup_status !== 'converted')
          .reduce((sum, d) => sum + (d.amount || 0), 0),
        conversion_rate:
          data.length > 0
            ? Math.round(
                (data.filter((d) => d.followup_status === 'converted').length / data.length) * 100 * 100
              ) / 100
            : 0,
      };

      return stats;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Send follow-up email with recovery link and QR code
   */
  async sendFollowupEmail(id: string): Promise<boolean> {
    try {
      const abandonment = await this.getById(id);
      if (!abandonment) {
        throw new AppError('Abandonment not found', 404, 'ABANDONMENT_NOT_FOUND');
      }

      // Generate recovery link
      const recovery = await this.generateRecoveryLink(id);

      // Get tier display name
      const tierNames: Record<TierType, string> = {
        vip: 'VIP Pass',
        standard: 'Standard Pass',
        basic: 'Basic Pass',
        waitlist: 'Waitlist - Live Stream',
        starter: 'Starter Plan',
        pro: 'Pro Plan',
        enterprise: 'Enterprise Plan',
      };

      // Send recovery email
      const emailSent = await emailService.sendRecoveryEmail(
        abandonment.email,
        abandonment.name,
        tierNames[abandonment.tier],
        abandonment.amount,
        recovery.link,
        recovery.qrCodeDataUrl
      );

      if (emailSent) {
        // Update status to email_sent
        await this.updateFollowupStatus(id, 'email_sent', 'Recovery email sent with QR code');
      }

      return emailSent;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error sending followup email', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Failed to send followup email', 500, 'EMAIL_SEND_ERROR');
    }
  }

  /**
   * Export abandonments to CSV format
   */
  async exportToCsv(filters?: AbandonmentFilters): Promise<string> {
    const { abandonments } = await this.getAll({ ...filters, limit: 10000 });

    const headers = [
      'Name',
      'Email',
      'Phone',
      'Business Name',
      'Tier',
      'Amount',
      'Type',
      'Reason',
      'Follow-up Status',
      'Abandoned At',
      'Last Follow-up',
      'Assigned To',
    ];

    const rows = abandonments.map((a) => [
      a.name,
      a.email,
      a.phone,
      a.business_name || '',
      a.tier,
      a.amount.toFixed(2), // Amount stored in rupees
      a.abandonment_type,
      a.abandonment_reason || '',
      a.followup_status,
      new Date(a.abandoned_at).toISOString(),
      a.last_followup_at ? new Date(a.last_followup_at).toISOString() : '',
      a.assigned_to || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}

export const abandonmentService = new AbandonmentService();
