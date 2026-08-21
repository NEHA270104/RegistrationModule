import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type {
  Registration,
  TierType,
  PaymentStatus,
  CreateOrderRequest,
  AdminRegistrationFilters,
} from '../types/index.js';
import { AppError } from '../types/index.js';
import { config } from '../config/index.js';

export class RegistrationService {
  /**
   * Sanitize IP address for PostgreSQL INET column.
   * Returns null if the value is not a valid IP address.
   */
  private sanitizeIpAddress(ip: string | undefined | null): string | null {
    if (!ip) return null;
    // Take only the first IP if comma-separated (multiple proxies)
    let cleaned = ip.split(',')[0].trim();
    // Remove IPv6-mapped IPv4 prefix (e.g., "::ffff:192.168.1.1" → "192.168.1.1")
    cleaned = cleaned.replace(/^::ffff:/, '');
    // Strip port from IPv4 only (e.g., "1.2.3.4:8080" → "1.2.3.4")
    // Must NOT strip from IPv6 like "::1"
    if (cleaned.includes('.') && cleaned.includes(':')) {
      cleaned = cleaned.replace(/:\d+$/, '');
    }
    // Validate IPv4
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    // Validate IPv6 (e.g., "::1", "fe80::1", "2001:db8::1")
    const ipv6 = /^[0-9a-fA-F:]{2,}$/;
    if (ipv4.test(cleaned) || ipv6.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  /**
   * Create a new registration (pending payment)
   */
  async createRegistration(
    data: CreateOrderRequest,
    razorpayOrderId: string,
    amount: number,
    metadata?: { ip_address?: string; user_agent?: string; referrer?: string }
  ): Promise<Registration> {
    try {
      const registrationData = {
        name: data.name || '',
        email: (data.email || '').toLowerCase(),
        phone: data.phone || '',
        business_name: data.business_name || null,
        industry: data.industry || null,
        revenue_range: data.revenue_range || null,
        employee_count: data.employee_count || null,
        tier: data.tier,
        amount_paid: amount,
        payment_status: 'pending' as PaymentStatus,
        registration_status: 'pending',
        razorpay_order_id: razorpayOrderId,
        payment_initiated_at: new Date().toISOString(),
        ip_address: this.sanitizeIpAddress(metadata?.ip_address),
        user_agent: metadata?.user_agent || null,
        referrer: metadata?.referrer || null,
        utm_source: data.utm_source || null,
        utm_medium: data.utm_medium || null,
        utm_campaign: data.utm_campaign || null,
      };

      const { data: registration, error } = await supabase
        .from('registrations')
        .insert(registrationData)
        .select()
        .single();

      if (error) {
        logger.error('Error creating registration', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          registrationData: {
            email: registrationData.email,
            phone: registrationData.phone,
            tier: registrationData.tier,
            amount_paid: registrationData.amount_paid,
            ip_address: registrationData.ip_address,
          },
        });
        throw new AppError('Failed to create registration', 500, 'REGISTRATION_CREATE_ERROR');
      }

      logger.info('Registration created', {
        registrationId: registration.id,
        bookingId: registration.booking_id,
        tier: data.tier,
      });

      return registration as Registration;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in createRegistration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update registration with payment confirmation
   */
  async confirmPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ): Promise<Registration> {
    try {
      const { data: registration, error } = await supabase
        .from('registrations')
        .update({
          payment_status: 'confirmed',
          registration_status: 'confirmed',
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: razorpaySignature,
          payment_confirmed_at: new Date().toISOString(),
        })
        .eq('razorpay_order_id', razorpayOrderId)
        .eq('payment_status', 'pending')
        .select()
        .single();

      if (error) {
        logger.error('Error confirming payment', {
          orderId: razorpayOrderId,
          error: error.message,
        });
        throw new AppError('Failed to confirm payment', 500, 'PAYMENT_CONFIRM_ERROR');
      }

      if (!registration) {
        throw new AppError('Registration not found or already processed', 404, 'REGISTRATION_NOT_FOUND');
      }

      logger.info('Payment confirmed', {
        bookingId: registration.booking_id,
        paymentId: razorpayPaymentId,
      });

      return registration as Registration;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(razorpayOrderId: string, errorMessage?: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('registrations')
        .update({
          payment_status: 'failed',
          registration_status: 'cancelled',
        })
        .eq('razorpay_order_id', razorpayOrderId)
        .eq('payment_status', 'pending');

      if (error) {
        logger.error('Error marking payment as failed', { orderId: razorpayOrderId, error: error.message });
      }

      logger.info('Payment marked as failed', { orderId: razorpayOrderId, reason: errorMessage });
    } catch (error) {
      logger.error('Unexpected error in markPaymentFailed', {
        orderId: razorpayOrderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get registration by booking ID
   */
  async getByBookingId(bookingId: string): Promise<Registration | null> {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('booking_id', bookingId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Error fetching registration by booking ID', { bookingId, error: error.message });
        throw new AppError('Failed to fetch registration', 500, 'FETCH_ERROR');
      }

      return data as Registration;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get registration by UUID ID
   */
  async getById(id: string): Promise<Registration | null> {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Error fetching registration by ID', { id, error: error.message });
        throw new AppError('Failed to fetch registration', 500, 'FETCH_ERROR');
      }

      return data as Registration;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get registration by Razorpay order ID
   */
  async getByRazorpayOrderId(orderId: string): Promise<Registration | null> {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Error fetching registration by order ID', { orderId, error: error.message });
        return null;
      }

      return data as Registration;
    } catch (error) {
      logger.error('Unexpected error in getByRazorpayOrderId', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get registration by email
   */
  async getByEmail(email: string): Promise<Registration[]> {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('email', email.toLowerCase())
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching registrations by email', { error: error.message });
        return [];
      }

      return data as Registration[];
    } catch (error) {
      logger.error('Unexpected error in getByEmail', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Check if email is already registered
   */
  async isEmailRegistered(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('payment_status', 'confirmed')
        .limit(1);

      if (error) {
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if phone is already registered
   */
  async isPhoneRegistered(phone: string): Promise<boolean> {
    try {
      // Normalize phone number (remove any non-digits)
      const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

      const { data, error } = await supabase
        .from('registrations')
        .select('id')
        .eq('phone', normalizedPhone)
        .eq('payment_status', 'confirmed')
        .limit(1);

      if (error) {
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if same person (name + phone combination) is already registered
   */
  async isPersonRegistered(name: string, phone: string): Promise<boolean> {
    try {
      const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
      const normalizedName = name.trim().toLowerCase();

      const { data, error } = await supabase
        .from('registrations')
        .select('id, name')
        .eq('phone', normalizedPhone)
        .eq('payment_status', 'confirmed');

      if (error || !data || data.length === 0) {
        return false;
      }

      // Check if any registration has a similar name (fuzzy match)
      return data.some(reg => {
        const regName = reg.name.trim().toLowerCase();
        // Exact match or one name contains the other
        return regName === normalizedName ||
               regName.includes(normalizedName) ||
               normalizedName.includes(regName);
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if email has a pending or failed registration
   */
  async hasPendingRegistration(email: string): Promise<{
    hasPending: boolean;
    registration?: {
      id: string;
      email: string;
      phone: string;
      payment_status: string;
      created_at: string;
    };
  }> {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('id, email, phone, payment_status, created_at')
        .eq('email', email.toLowerCase())
        .in('payment_status', ['pending', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Error checking pending registration', { error: error.message });
        return { hasPending: false };
      }

      if (data) {
        return {
          hasPending: true,
          registration: data as {
            id: string;
            email: string;
            phone: string;
            payment_status: string;
            created_at: string;
          },
        };
      }

      return { hasPending: false };
    } catch (error) {
      logger.error('Error in hasPendingRegistration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { hasPending: false };
    }
  }

  /**
   * Check for all duplicate conditions and return specific error
   */
  async checkDuplicateRegistration(
    email: string,
    phone: string,
    name: string
  ): Promise<{ isDuplicate: boolean; reason?: string; code?: string; registrationId?: string }> {
    try {
      // First, check for pending/failed registrations with same email
      const pendingCheck = await this.hasPendingRegistration(email);
      if (pendingCheck.hasPending && pendingCheck.registration) {
        const reg = pendingCheck.registration;
        const status = reg.payment_status === 'pending' ? 'incomplete' : 'failed';

        return {
          isDuplicate: true,
          reason: `You have an ${status} registration. Please check your email (${email}) for a payment link to complete your registration. If you need assistance, please contact support.`,
          code: 'PENDING_REGISTRATION_EXISTS',
          registrationId: reg.id,
        };
      }

      // Check for confirmed email registration
      if (await this.isEmailRegistered(email)) {
        return {
          isDuplicate: true,
          reason: 'This email address is already registered for the summit.',
          code: 'EMAIL_ALREADY_REGISTERED',
        };
      }

      // Check phone number (confirmed only)
      if (await this.isPhoneRegistered(phone)) {
        return {
          isDuplicate: true,
          reason: 'This phone number is already registered for the summit.',
          code: 'PHONE_ALREADY_REGISTERED',
        };
      }

      // Check name + phone combination (same person with different email, confirmed only)
      if (await this.isPersonRegistered(name, phone)) {
        return {
          isDuplicate: true,
          reason: 'A registration with this name and phone number already exists.',
          code: 'PERSON_ALREADY_REGISTERED',
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      logger.error('Error checking duplicate registration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { isDuplicate: false };
    }
  }

  /**
   * Reset a failed/cancelled registration for recovery payment.
   * Updates the Razorpay order ID and resets status back to pending.
   */
  async updateForRecovery(registrationId: string, newRazorpayOrderId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('registrations')
        .update({
          razorpay_order_id: newRazorpayOrderId,
          payment_status: 'pending' as PaymentStatus,
          registration_status: 'pending',
          payment_initiated_at: new Date().toISOString(),
          utm_source: 'recovery',
          utm_medium: 'email',
          utm_campaign: 'abandonment_recovery',
        })
        .eq('id', registrationId);

      if (error) {
        logger.error('Error updating registration for recovery', {
          registrationId,
          newOrderId: newRazorpayOrderId,
          error: error.message,
        });
        throw new AppError('Failed to update registration for recovery', 500, 'RECOVERY_UPDATE_ERROR');
      }

      logger.info('Registration updated for recovery', {
        registrationId,
        newOrderId: newRazorpayOrderId,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update confirmation email sent status
   */
  async markEmailSent(bookingId: string): Promise<void> {
    try {
      await supabase
        .from('registrations')
        .update({ confirmation_email_sent: true })
        .eq('booking_id', bookingId);
    } catch (error) {
      logger.error('Error marking email sent', { bookingId });
    }
  }

  /**
   * Update WhatsApp sent status
   */
  async markWhatsAppSent(bookingId: string): Promise<void> {
    try {
      await supabase
        .from('registrations')
        .update({ confirmation_whatsapp_sent: true })
        .eq('booking_id', bookingId);
    } catch (error) {
      logger.error('Error marking WhatsApp sent', { bookingId });
    }
  }

  /**
   * Delete a registration by booking ID (Admin)
   */
  async deleteRegistration(bookingId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('booking_id', bookingId);

      if (error) {
        logger.error('Error deleting registration', { bookingId, error: error.message });
        throw new AppError('Failed to delete registration', 500, 'DELETE_ERROR');
      }

      logger.info('Registration deleted', { bookingId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Create a manual registration (Admin bypass)
   */
  async createManualRegistration(data: {
    name: string;
    email: string;
    phone: string;
    business_name?: string;
    industry?: string;
    tier: TierType;
    amount_paid: number;
    payment_status: PaymentStatus;
  }): Promise<Registration> {
    try {
      const registrationData = {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        business_name: data.business_name || null,
        industry: data.industry || null,
        tier: data.tier,
        amount_paid: data.amount_paid,
        payment_status: data.payment_status,
        registration_status: data.payment_status === 'confirmed' ? 'confirmed' : 'pending',
        payment_confirmed_at: data.payment_status === 'confirmed' ? new Date().toISOString() : null,
      };

      const { data: registration, error } = await supabase
        .from('registrations')
        .insert(registrationData)
        .select()
        .single();

      if (error) {
        logger.error('Error creating manual registration', { error: error.message });
        throw new AppError('Failed to create registration', 500, 'CREATE_ERROR');
      }

      logger.info('Manual registration created', {
        bookingId: registration.booking_id,
        tier: data.tier,
      });

      return registration as Registration;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get all registrations with filters (Admin)
   */
  async getAll(filters: AdminRegistrationFilters): Promise<{
    registrations: Registration[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('registrations')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.tier) {
        query = query.eq('tier', filters.tier);
      }
      if (filters.payment_status) {
        query = query.eq('payment_status', filters.payment_status);
      }
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,booking_id.ilike.%${filters.search}%`
        );
      }
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      // Apply sorting
      const sortBy = filters.sort_by || 'created_at';
      const sortOrder = filters.sort_order === 'asc' ? true : false;
      query = query.order(sortBy, { ascending: sortOrder });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error fetching registrations', { error: error.message });
        throw new AppError('Failed to fetch registrations', 500, 'FETCH_ERROR');
      }

      return {
        registrations: data as Registration[],
        total: count || 0,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get registration statistics (Admin)
   */
  async getStats(): Promise<{
    totalRegistrations: number;
    confirmedRegistrations: number;
    pendingPayments: number;
    totalRevenue: number;
    seatsByTier: { tier: TierType; total: number; sold: number; available: number }[];
    todayRegistrations: number;
  }> {
    try {
      // Get registration counts
      const { data: registrations, error: regError } = await supabase
        .from('registrations')
        .select('tier, payment_status, amount_paid, created_at');

      if (regError) {
        throw new AppError('Failed to fetch stats', 500, 'STATS_ERROR');
      }

      // Get seat inventory
      const { data: seats, error: seatError } = await supabase
        .from('seat_inventory')
        .select('*')
        .neq('tier_name', 'waitlist');

      if (seatError) {
        throw new AppError('Failed to fetch seat stats', 500, 'STATS_ERROR');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = {
        totalRegistrations: registrations?.length || 0,
        confirmedRegistrations: registrations?.filter((r) => r.payment_status === 'confirmed').length || 0,
        pendingPayments: registrations?.filter((r) => r.payment_status === 'pending').length || 0,
        totalRevenue:
          registrations
            ?.filter((r) => r.payment_status === 'confirmed')
            .reduce((sum, r) => sum + r.amount_paid, 0) || 0,
        seatsByTier: seats?.map((s) => ({
          tier: s.tier_name as TierType,
          total: s.total_seats,
          sold: s.sold_seats,
          available: s.total_seats - s.sold_seats - s.held_seats,
        })) || [],
        todayRegistrations:
          registrations?.filter((r) => new Date(r.created_at) >= today).length || 0,
      };

      return stats;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Export registrations as CSV
   */
  async exportAsCSV(filters?: AdminRegistrationFilters): Promise<string> {
    try {
      const { registrations } = await this.getAll({
        ...filters,
        limit: 10000, // Max export limit
      });

      const headers = [
        'Booking ID',
        'Name',
        'Email',
        'Phone',
        'Business Name',
        'Industry',
        'Revenue Range',
        'Tier',
        'Amount (INR)',
        'Payment Status',
        'Registration Status',
        'Created At',
        'Payment Confirmed At',
      ];

      const rows = registrations.map((r) => [
        r.booking_id,
        r.name,
        r.email,
        r.phone,
        r.business_name || '',
        r.industry || '',
        r.revenue_range || '',
        r.tier,
        r.amount_paid.toFixed(2), // Amount stored in RUPEES (INR)
        r.payment_status,
        r.registration_status,
        new Date(r.created_at).toISOString(),
        r.payment_confirmed_at ? new Date(r.payment_confirmed_at).toISOString() : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      return csvContent;
    } catch (error) {
      throw new AppError('Failed to export registrations', 500, 'EXPORT_ERROR');
    }
  }
}

export const registrationService = new RegistrationService();
