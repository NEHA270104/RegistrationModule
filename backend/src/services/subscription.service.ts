import { supabase } from '../config/supabase.js';
import { getRazorpay } from '../config/razorpay.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { tenantService } from './tenant.service.js';

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_name: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  status: string;
  razorpay_subscription_id: string | null;
  razorpay_plan_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageStatus {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
}

// Plan limits fallback
export const FALLBACK_PLAN_LIMITS: Record<string, number> = {
  trial: 0,
  basic: 3,
  starter: 3,
  standard: 10,
  pro: 10,
  premium: 50,
  enterprise: 50,
};

// Plan pricing fallback (monthly price in INR - Live Testing Values: Basic ₹1, Standard ₹5, Premium ₹10)
export const FALLBACK_PLAN_PRICING: Record<string, number> = {
  trial: 0,
  basic: 1,
  starter: 1,
  standard: 5,
  pro: 5,
  premium: 10,
  enterprise: 10,
};

export class SubscriptionService {
  async getPlanFromDb(planName: string): Promise<{ price_monthly: number; guest_limit: number }> {
    const planLower = planName.toLowerCase();
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('name', planLower)
        .single();
      
      if (error || !data) {
        return {
          price_monthly: FALLBACK_PLAN_PRICING[planLower] !== undefined ? FALLBACK_PLAN_PRICING[planLower] : 0,
          guest_limit: FALLBACK_PLAN_LIMITS[planLower] !== undefined ? FALLBACK_PLAN_LIMITS[planLower] : 50,
        };
      }
      return data;
    } catch {
      return {
        price_monthly: FALLBACK_PLAN_PRICING[planLower] !== undefined ? FALLBACK_PLAN_PRICING[planLower] : 0,
        guest_limit: FALLBACK_PLAN_LIMITS[planLower] !== undefined ? FALLBACK_PLAN_LIMITS[planLower] : 50,
      };
    }
  }

  /**
   * Create a subscription for a tenant
   */
  async createSubscription(tenantId: string, planName: string, billingCycle: string): Promise<{
    subscription: Subscription;
    checkout_url?: string;
  }> {
    try {
      const planInfo = await this.getPlanFromDb(planName);
      let price = planInfo.price_monthly;
      if (billingCycle === 'yearly') {
        price = Math.round(price * 12 * 0.9); // 10% discount
      }
      const amount = price * 100; // in paise

      const tenant = await tenantService.getById(tenantId);
      if (!tenant) {
        throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
      }

      // Create Razorpay subscription (if Razorpay subscription plans are configured)
      let razorpaySubscriptionId: string | null = null;
      try {
        const rzpSub = await (getRazorpay() as any).subscriptions.create({
          plan_id: `plan_${planName}_${billingCycle}`, // Pre-created plan IDs
          total_count: billingCycle === 'yearly' ? 12 : 120,
          quantity: 1,
          notes: {
            tenant_id: tenantId,
            tenant_slug: tenant.slug,
          },
        });
        razorpaySubscriptionId = rzpSub.id;
      } catch (rzpError) {
        logger.warn('Razorpay subscription creation skipped', {
          error: rzpError instanceof Error ? rzpError.message : 'Unknown',
        });
      }

      // Store subscription record
      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .insert({
          tenant_id: tenantId,
          plan_name: planName,
          billing_cycle: billingCycle,
          amount,
          currency: 'INR',
          status: 'created',
          razorpay_subscription_id: razorpaySubscriptionId,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating subscription', { error: error.message });
        throw new AppError('Failed to create subscription', 500, 'SUBSCRIPTION_CREATE_ERROR');
      }

      // Update tenant subscription info
      await supabase
        .from('tenants')
        .update({
          subscription_plan: planName,
          subscription_status: 'trialing',
          selected_plan: planName,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      logger.info('Subscription created', { tenantId, planName, billingCycle });

      return { subscription: subscription as Subscription };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get current subscription for a tenant
   */
  async getByTenantId(tenantId: string): Promise<Subscription | null> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        return null;
      }

      return data as Subscription;
    } catch {
      return null;
    }
  }

  /**
   * Check registration usage against plan limit
   */
  async checkUsage(tenantId: string): Promise<UsageStatus> {
    try {
      const tenant = await tenantService.getById(tenantId);
      const plan = tenant?.subscription_plan || 'trial';
      const planInfo = await this.getPlanFromDb(plan);
      const limit = planInfo.guest_limit;

      // Count confirmed registrations this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'confirmed')
        .gte('created_at', startOfMonth.toISOString());

      const used = count || 0;

      return {
        allowed: used < limit,
        used,
        limit,
        plan,
      };
    } catch {
      return { allowed: true, used: 0, limit: 50, plan: 'trial' };
    }
  }

  /**
   * Handle Razorpay subscription webhook
   */
  async handleWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
    const subscription = payload.subscription as { id?: string; status?: string } | undefined;
    if (!subscription?.id) return;

    const razorpaySubId = subscription.id;

    // Find our subscription record
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('razorpay_subscription_id', razorpaySubId)
      .single();

    if (!sub) {
      logger.warn('Subscription not found for webhook', { razorpaySubId, event });
      return;
    }

    const statusMap: Record<string, string> = {
      'subscription.activated': 'active',
      'subscription.charged': 'active',
      'subscription.pending': 'past_due',
      'subscription.halted': 'halted',
      'subscription.cancelled': 'cancelled',
    };

    const newStatus = statusMap[event];
    if (!newStatus) return;

    // Update subscription status
    await supabase
      .from('subscriptions')
      .update({
        status: newStatus,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        ...(newStatus === 'cancelled' && { cancelled_at: new Date().toISOString() }),
      })
      .eq('id', sub.id);

    // Update tenant status
    const tenantStatusMap: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      halted: 'cancelled',
      cancelled: 'cancelled',
    };

    const statusValue = tenantStatusMap[newStatus] || newStatus;
    await supabase
      .from('tenants')
      .update({
        subscription_status: statusValue,
        status: statusValue === 'active' ? 'active' : 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.tenant_id);

    logger.info('Subscription webhook processed', { event, tenantId: sub.tenant_id, newStatus });
  }

  /**
   * Cancel a subscription
   */
  async cancel(tenantId: string): Promise<void> {
    const sub = await this.getByTenantId(tenantId);
    if (!sub) {
      throw new AppError('No active subscription found', 404, 'NO_SUBSCRIPTION');
    }

    // Cancel in Razorpay
    if (sub.razorpay_subscription_id) {
      try {
        await (getRazorpay() as any).subscriptions.cancel(sub.razorpay_subscription_id);
      } catch (rzpError) {
        logger.warn('Razorpay cancel failed', {
          error: rzpError instanceof Error ? rzpError.message : 'Unknown',
        });
      }
    }

    // Update local records
    await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    await supabase
      .from('tenants')
      .update({
        subscription_status: 'cancelled',
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    logger.info('Subscription cancelled', { tenantId });
  }

  /**
   * Upgrade/change plan
   */
  async changePlan(tenantId: string, newPlan: string, billingCycle: string): Promise<Subscription> {
    // Cancel existing
    try {
      await this.cancel(tenantId);
    } catch {
      // OK if no existing subscription
    }

    // Create new
    const { subscription } = await this.createSubscription(tenantId, newPlan, billingCycle);
    return subscription;
  }

  /**
   * List all subscriptions (super admin)
   */
  async listAll(filters?: { status?: string; page?: number; limit?: number }): Promise<{
    subscriptions: Subscription[];
    total: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('subscriptions')
      .select('*', { count: 'exact' });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count } = await query;

    return { subscriptions: (data || []) as Subscription[], total: count || 0 };
  }
}

export const subscriptionService = new SubscriptionService();
