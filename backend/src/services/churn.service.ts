import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { subscriptionService } from './subscription.service.js';
import { tenantService } from './tenant.service.js';
import { auditService } from './audit.service.js';

export interface ChurnOffer {
  id: string;
  tenant_id: string;
  offer_type: string;
  offer_details: Record<string, unknown>;
  status: string;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
}

export class ChurnService {
  /**
   * Initiate cancellation — sets 30-day grace period and creates retention offer
   */
  async initiateCancellation(
    tenantId: string,
    reason: string,
    feedback: string
  ): Promise<{ effective_at: string; offer: ChurnOffer | null }> {
    const tenant = await tenantService.getById(tenantId);
    if (!tenant) {
      throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
    }

    if (tenant.cancellation_requested_at) {
      throw new AppError('Cancellation already in progress', 400, 'CANCELLATION_IN_PROGRESS');
    }

    const now = new Date();
    const effectiveAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const deletionAt = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // +120 days

    // Update tenant with cancellation info
    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update({
        cancellation_requested_at: now.toISOString(),
        cancellation_effective_at: effectiveAt.toISOString(),
        data_deletion_scheduled_at: deletionAt.toISOString(),
        churn_reason: reason,
        churn_feedback: feedback || null,
        subscription_status: 'cancelling',
        updated_at: now.toISOString(),
      })
      .eq('id', tenantId);

    if (updateError) {
      logger.error('Error initiating cancellation', { error: updateError.message });
      throw new AppError('Failed to initiate cancellation', 500, 'CANCELLATION_ERROR');
    }

    // Create retention offer
    const offer = await this.createRetentionOffer(tenantId);

    // Audit log
    auditService.log({
      tenant_id: tenantId,
      actor_role: 'tenant_admin',
      action: 'cancel',
      resource_type: 'subscription',
      metadata: { reason, effective_at: effectiveAt.toISOString() },
    });

    logger.info('Cancellation initiated', { tenantId, reason, effectiveAt: effectiveAt.toISOString() });

    return { effective_at: effectiveAt.toISOString(), offer };
  }

  /**
   * Create a retention offer based on tenant tenure
   */
  async createRetentionOffer(tenantId: string): Promise<ChurnOffer | null> {
    try {
      const tenant = await tenantService.getById(tenantId);
      if (!tenant) return null;

      const createdAt = new Date(tenant.created_at);
      const now = new Date();
      const tenureMonths = Math.floor((now.getTime() - createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000));

      let offerType: string;
      let offerDetails: Record<string, unknown>;

      if (tenureMonths >= 12) {
        offerType = 'discount';
        offerDetails = { discount_percent: 50, months: 3, message: '50% off for the next 3 months' };
      } else if (tenureMonths >= 6) {
        offerType = 'discount';
        offerDetails = { discount_percent: 30, months: 2, message: '30% off for the next 2 months' };
      } else {
        offerType = 'pause';
        offerDetails = { free_months: 1, message: '1 month free pause — come back when you\'re ready' };
      }

      const { data, error } = await supabaseAdmin
        .from('churn_offers')
        .insert({
          tenant_id: tenantId,
          offer_type: offerType,
          offer_details: offerDetails,
          status: 'pending',
          expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating retention offer', { error: error.message });
        return null;
      }

      return data as ChurnOffer;
    } catch (err) {
      logger.error('Failed to create retention offer', { error: (err as Error).message });
      return null;
    }
  }

  /**
   * Tenant accepts a retention offer — cancels the cancellation
   */
  async acceptRetentionOffer(tenantId: string, offerId: string): Promise<void> {
    // Verify offer belongs to tenant and is pending
    const { data: offer, error: fetchError } = await supabaseAdmin
      .from('churn_offers')
      .select('*')
      .eq('id', offerId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !offer) {
      throw new AppError('Offer not found or already responded', 404, 'OFFER_NOT_FOUND');
    }

    // Check if offer has expired
    if (new Date(offer.expires_at) < new Date()) {
      await supabaseAdmin
        .from('churn_offers')
        .update({ status: 'expired' })
        .eq('id', offerId);
      throw new AppError('This offer has expired', 400, 'OFFER_EXPIRED');
    }

    // Mark offer as accepted
    await supabaseAdmin
      .from('churn_offers')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', offerId);

    // Clear cancellation — tenant stays active
    await supabaseAdmin
      .from('tenants')
      .update({
        cancellation_requested_at: null,
        cancellation_effective_at: null,
        data_deletion_scheduled_at: null,
        churn_reason: null,
        churn_feedback: null,
        subscription_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    auditService.log({
      tenant_id: tenantId,
      actor_role: 'tenant_admin',
      action: 'update',
      resource_type: 'churn_offer',
      resource_id: offerId,
      metadata: { accepted: true, offer_type: offer.offer_type },
    });

    logger.info('Retention offer accepted', { tenantId, offerId, offerType: offer.offer_type });
  }

  /**
   * Get active/pending churn offers for a tenant
   */
  async getOffers(tenantId: string): Promise<ChurnOffer[]> {
    const { data, error } = await supabaseAdmin
      .from('churn_offers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching churn offers', { error: error.message });
      return [];
    }

    return (data || []) as ChurnOffer[];
  }

  /**
   * Cron job: Process scheduled cancellations (tenants past their 30-day grace period)
   */
  async processScheduledCancellations(): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, email')
      .lte('cancellation_effective_at', new Date().toISOString())
      .eq('subscription_status', 'cancelling');

    if (error || !data || data.length === 0) return 0;

    let processed = 0;
    for (const tenant of data) {
      try {
        await this.deactivateTenant(tenant.id);
        processed++;
      } catch (err) {
        logger.error('Error deactivating tenant', { tenantId: tenant.id, error: (err as Error).message });
      }
    }

    return processed;
  }

  /**
   * Deactivate a tenant after grace period
   */
  async deactivateTenant(tenantId: string): Promise<void> {
    // Cancel Razorpay subscription
    try {
      await subscriptionService.cancel(tenantId);
    } catch {
      // May already be cancelled
    }

    const deletionDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await supabaseAdmin
      .from('tenants')
      .update({
        subscription_status: 'cancelled',
        is_active: false,
        data_deletion_scheduled_at: deletionDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    auditService.log({
      tenant_id: tenantId,
      actor_role: 'system',
      action: 'deactivate',
      resource_type: 'tenant',
      resource_id: tenantId,
      metadata: { data_deletion_at: deletionDate.toISOString() },
    });

    logger.info('Tenant deactivated', { tenantId });
  }

  /**
   * Cron job: Process scheduled data deletions (90 days after deactivation)
   */
  async processScheduledDeletions(): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .lte('data_deletion_scheduled_at', new Date().toISOString())
      .eq('is_active', false);

    if (error || !data || data.length === 0) return 0;

    let processed = 0;
    for (const tenant of data) {
      try {
        await this.anonymizeTenantData(tenant.id);
        processed++;
      } catch (err) {
        logger.error('Error anonymizing tenant data', { tenantId: tenant.id, error: (err as Error).message });
      }
    }

    return processed;
  }

  /**
   * GDPR-compliant data anonymization — replace PII, keep aggregate stats
   */
  async anonymizeTenantData(tenantId: string): Promise<void> {
    // Anonymize registrations
    try {
      await supabaseAdmin.rpc('anonymize_tenant_registrations', { p_tenant_id: tenantId });
    } catch {
      // If RPC doesn't exist, do manual update
      await supabaseAdmin
        .from('registrations')
        .update({
          name: 'ANONYMIZED',
          email: 'anonymized@deleted.local',
          phone: null,
          company_name: null,
        })
        .eq('tenant_id', tenantId);
    }

    // Anonymize payment abandonments
    await supabaseAdmin
      .from('payment_abandonments')
      .update({
        customer_name: 'ANONYMIZED',
        customer_email: 'anonymized@deleted.local',
        customer_phone: null,
      })
      .eq('tenant_id', tenantId);

    // Clear deletion schedule and mark as anonymized
    await supabaseAdmin
      .from('tenants')
      .update({
        data_deletion_scheduled_at: null,
        email: `deleted-${tenantId.slice(0, 8)}@anonymized.local`,
        phone: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    auditService.log({
      tenant_id: tenantId,
      actor_role: 'system',
      action: 'delete',
      resource_type: 'tenant_data',
      resource_id: tenantId,
      metadata: { type: 'anonymization' },
    });

    logger.info('Tenant data anonymized', { tenantId });
  }

  /**
   * Send churn reminder emails (called by daily cron)
   */
  async sendChurnReminders(): Promise<void> {
    const { data: cancellingTenants } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, email, cancellation_requested_at, cancellation_effective_at')
      .eq('subscription_status', 'cancelling')
      .not('cancellation_effective_at', 'is', null);

    if (!cancellingTenants || cancellingTenants.length === 0) return;

    const now = new Date();

    for (const tenant of cancellingTenants) {
      const requestedAt = new Date(tenant.cancellation_requested_at);
      const daysSinceRequest = Math.floor((now.getTime() - requestedAt.getTime()) / (24 * 60 * 60 * 1000));

      // Send reminders at day 7, 14, and 21
      if ([7, 14, 21].includes(daysSinceRequest)) {
        const daysLeft = 30 - daysSinceRequest;
        logger.info('Churn reminder due', {
          tenantId: tenant.id,
          slug: tenant.slug,
          daysSinceRequest,
          daysLeft,
        });
        // Future: integrate with email service to send reminder
      }
    }
  }
}

export const churnService = new ChurnService();
