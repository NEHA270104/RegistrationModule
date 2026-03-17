import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { rebrandService } from './rebrand.service.js';

export interface Referral {
  id: string;
  referrer_tenant_id: string;
  referred_tenant_id: string;
  referral_code: string;
  commission_percent: number;
  total_commission_earned: number;
  total_commission_paid: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionEntry {
  id: string;
  referral_id: string;
  referrer_tenant_id: string;
  subscription_payment_id: string | null;
  payment_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
  payout_reference: string | null;
  created_at: string;
}

export interface ReferralDashboard {
  referral_code: string;
  referral_link: string;
  total_referrals: number;
  active_referrals: number;
  churned_referrals: number;
  total_clicks: number;
  total_earned: number;
  total_paid: number;
  pending_payout: number;
  current_tier: { percent: number; tier: string };
  recent_referrals: Record<string, unknown>[];
}

function getCommissionTier(totalReferrals: number): { percent: number; tier: string } {
  if (totalReferrals >= 16) return { percent: 15, tier: 'Platinum' };
  if (totalReferrals >= 6) return { percent: 12, tier: 'Gold' };
  return { percent: 10, tier: 'Silver' };
}

export class ReferralService {
  async generateReferralCode(tenantId: string): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await supabaseAdmin
      .from('tenants')
      .update({ referral_code: code, updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    logger.info('Referral code generated', { tenantId, code });
    return code;
  }

  async trackClick(referralCode: string, ip: string, userAgent: string): Promise<void> {
    // Find referrer tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('referral_code', referralCode)
      .eq('is_active', true)
      .single();

    if (!tenant) return;

    await supabaseAdmin.from('referral_clicks').insert({
      referral_code: referralCode,
      referrer_tenant_id: tenant.id,
      ip_address: ip || null,
      user_agent: userAgent || null,
    });
  }

  async processReferral(referralCode: string, newTenantId: string): Promise<void> {
    // Find referrer
    const { data: referrer } = await supabase
      .from('tenants')
      .select('id')
      .eq('referral_code', referralCode)
      .eq('is_active', true)
      .single();

    if (!referrer) {
      logger.warn('Referral code not found', { referralCode });
      return;
    }

    // Don't self-refer
    if (referrer.id === newTenantId) return;

    // Check if already referred
    const { data: existing } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referrer_tenant_id', referrer.id)
      .eq('referred_tenant_id', newTenantId)
      .limit(1);

    if (existing && existing.length > 0) return;

    // Count total referrals for tier
    const { count: totalReferrals } = await supabaseAdmin
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_tenant_id', referrer.id);

    const tier = getCommissionTier((totalReferrals || 0) + 1);

    await supabaseAdmin.from('referrals').insert({
      referrer_tenant_id: referrer.id,
      referred_tenant_id: newTenantId,
      referral_code: referralCode,
      commission_percent: tier.percent,
    });

    // Mark click as converted
    await supabaseAdmin
      .from('referral_clicks')
      .update({ converted: true })
      .eq('referral_code', referralCode)
      .eq('converted', false);

    // Update referrer's referred_by on the new tenant
    await supabaseAdmin
      .from('tenants')
      .update({ referred_by_tenant_id: referrer.id })
      .eq('id', newTenantId);

    // Notify referrer
    await rebrandService.createNotification(
      'referral_signup',
      'New Referral Signup',
      `A new tenant signed up using your referral code`,
      referrer.id
    );

    logger.info('Referral processed', {
      referrer: referrer.id,
      referred: newTenantId,
      tier: tier.tier,
    });
  }

  async recordCommission(
    referredTenantId: string,
    paymentAmount: number,
    subscriptionPaymentId?: string
  ): Promise<void> {
    // Find active referral
    const { data: referral } = await supabaseAdmin
      .from('referrals')
      .select('*')
      .eq('referred_tenant_id', referredTenantId)
      .eq('status', 'active')
      .single();

    if (!referral) return;

    const commissionAmount = Math.floor(paymentAmount * (referral.commission_percent / 100));

    // Insert ledger entry
    await supabaseAdmin.from('commission_ledger').insert({
      referral_id: referral.id,
      referrer_tenant_id: referral.referrer_tenant_id,
      subscription_payment_id: subscriptionPaymentId || null,
      payment_amount: paymentAmount,
      commission_percent: referral.commission_percent,
      commission_amount: commissionAmount,
    });

    // Update referral totals
    await supabaseAdmin
      .from('referrals')
      .update({
        total_commission_earned: (referral.total_commission_earned || 0) + commissionAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', referral.id);

    logger.info('Commission recorded', {
      referralId: referral.id,
      paymentAmount,
      commissionAmount,
    });
  }

  async getReferralStats(tenantId: string): Promise<ReferralDashboard> {
    // Get tenant referral code
    const { data: tenant } = await supabase
      .from('tenants')
      .select('referral_code, slug')
      .eq('id', tenantId)
      .single();

    const referralCode = tenant?.referral_code || '';

    // Get referrals
    const { data: referrals } = await supabase
      .from('referrals')
      .select('*, tenants!referrals_referred_tenant_id_fkey(name, slug, subscription_plan)')
      .eq('referrer_tenant_id', tenantId)
      .order('created_at', { ascending: false });

    const allReferrals = referrals || [];
    const activeRefs = allReferrals.filter((r) => r.status === 'active');
    const churnedRefs = allReferrals.filter((r) => r.status === 'churned');

    // Get click count
    const { count: clickCount } = await supabase
      .from('referral_clicks')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_tenant_id', tenantId);

    // Calculate totals
    const totalEarned = allReferrals.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0);
    const totalPaid = allReferrals.reduce((sum, r) => sum + (r.total_commission_paid || 0), 0);

    const tier = getCommissionTier(allReferrals.length);

    return {
      referral_code: referralCode,
      referral_link: `${process.env.FRONTEND_URL || ''}/onboarding?ref=${referralCode}`,
      total_referrals: allReferrals.length,
      active_referrals: activeRefs.length,
      churned_referrals: churnedRefs.length,
      total_clicks: clickCount || 0,
      total_earned: totalEarned,
      total_paid: totalPaid,
      pending_payout: totalEarned - totalPaid,
      current_tier: tier,
      recent_referrals: allReferrals.slice(0, 10).map((r) => ({
        id: r.id,
        referred_name: (r.tenants as Record<string, unknown>)?.name || 'Unknown',
        referred_slug: (r.tenants as Record<string, unknown>)?.slug || '',
        plan: (r.tenants as Record<string, unknown>)?.subscription_plan || 'trial',
        commission_percent: r.commission_percent,
        earned: r.total_commission_earned || 0,
        status: r.status,
        created_at: r.created_at,
      })),
    };
  }

  async requestPayout(tenantId: string, amount: number): Promise<void> {
    // Verify pending balance
    const stats = await this.getReferralStats(tenantId);
    if (amount > stats.pending_payout) {
      throw new AppError('Requested amount exceeds pending balance', 400, 'INSUFFICIENT_BALANCE');
    }

    // Create notification for super admin
    await rebrandService.createNotification(
      'payout_request',
      'Payout Request',
      `Tenant requested payout of INR ${(amount / 100).toLocaleString('en-IN')}`,
      tenantId
    );

    logger.info('Payout requested', { tenantId, amount });
  }

  async processPayout(
    referrerId: string,
    amount: number,
    reference: string
  ): Promise<void> {
    // Update pending commission entries as paid
    const { data: pendingEntries } = await supabaseAdmin
      .from('commission_ledger')
      .select('id, commission_amount')
      .eq('referrer_tenant_id', referrerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (!pendingEntries || pendingEntries.length === 0) {
      throw new AppError('No pending commissions to pay', 400, 'NO_PENDING_COMMISSIONS');
    }

    let remaining = amount;
    const idsToUpdate: string[] = [];

    for (const entry of pendingEntries) {
      if (remaining <= 0) break;
      idsToUpdate.push(entry.id);
      remaining -= entry.commission_amount;
    }

    await supabaseAdmin
      .from('commission_ledger')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payout_reference: reference,
      })
      .in('id', idsToUpdate);

    // Update referral totals
    const { data: referrals } = await supabaseAdmin
      .from('referrals')
      .select('id, total_commission_paid')
      .eq('referrer_tenant_id', referrerId)
      .eq('status', 'active');

    if (referrals && referrals.length > 0) {
      // Distribute paid amount across referrals proportionally
      const perReferral = Math.floor(amount / referrals.length);
      for (const ref of referrals) {
        await supabaseAdmin
          .from('referrals')
          .update({
            total_commission_paid: (ref.total_commission_paid || 0) + perReferral,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);
      }
    }

    // Notify referrer
    await rebrandService.createNotification(
      'payout_processed',
      'Payout Processed',
      `INR ${(amount / 100).toLocaleString('en-IN')} has been paid out. Reference: ${reference}`,
      referrerId
    );

    logger.info('Payout processed', { referrerId, amount, reference });
  }

  // Super admin: list all referrals
  async listAll(filters?: { page?: number; limit?: number }): Promise<{
    referrals: Record<string, unknown>[];
    total: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    const { data, count } = await supabaseAdmin
      .from('referrals')
      .select(
        '*, referrer:tenants!referrals_referrer_tenant_id_fkey(name, slug), referred:tenants!referrals_referred_tenant_id_fkey(name, slug)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return { referrals: data || [], total: count || 0 };
  }

  // Super admin: list pending payouts
  async listPendingPayouts(): Promise<Record<string, unknown>[]> {
    const { data } = await supabaseAdmin
      .from('commission_ledger')
      .select('referrer_tenant_id, commission_amount, tenants!commission_ledger_referrer_tenant_id_fkey(name, slug)')
      .eq('status', 'pending');

    // Aggregate by referrer
    const aggregated: Record<string, { tenant_name: string; tenant_slug: string; amount: number; count: number }> = {};
    for (const entry of data || []) {
      const id = entry.referrer_tenant_id as string;
      if (!aggregated[id]) {
        const t = entry.tenants as unknown as { name?: string; slug?: string } | null;
        aggregated[id] = {
          tenant_name: t?.name || '',
          tenant_slug: t?.slug || '',
          amount: 0,
          count: 0,
        };
      }
      aggregated[id].amount += (entry as unknown as { commission_amount: number }).commission_amount || 0;
      aggregated[id].count += 1;
    }

    return Object.entries(aggregated).map(([tenantId, info]) => ({
      referrer_tenant_id: tenantId,
      ...info,
    }));
  }
}

export const referralService = new ReferralService();
