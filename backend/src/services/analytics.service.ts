import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

export interface TenantAnalytics {
  registrations: {
    total: number;
    confirmed: number;
    this_month: number;
    trend: { date: string; count: number; revenue: number }[];
  };
  revenue: {
    total: number;
    this_month: number;
  };
  conversion: {
    orders_created: number;
    payments_confirmed: number;
    rate: number;
  };
  recovery: {
    abandoned: number;
    recovered: number;
    recovery_rate: number;
  };
  usage: {
    used: number;
    limit: number;
    percent: number;
  };
  event: {
    name: string;
    date: string;
    venue: string;
  } | null;
}

export interface GlobalAnalytics {
  mrr: number;
  arr: number;
  tenant_counts: {
    total: number;
    active: number;
    trialing: number;
    cancelled: number;
  };
  signup_trend: { month: string; count: number }[];
  plan_distribution: { plan: string; count: number }[];
  top_tenants: { id: string; name: string; slug: string; registrations: number }[];
  referral_stats: {
    total_referrals: number;
    total_commission: number;
  };
  churn_rate: number;
}

// Plan registration limits fallback
const FALLBACK_PLAN_LIMITS: Record<string, number> = {
  trial: 50,
  basic: 500,
  pro: 2500,
  enterprise: 10000,
};

export class AnalyticsService {
  /**
   * Get analytics for a specific tenant
   */
  async getTenantAnalytics(tenantId: string, period?: string): Promise<TenantAnalytics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Run all queries in parallel
    const [
      totalRegs,
      confirmedRegs,
      monthRegs,
      trendData,
      abandonmentData,
      recoveryData,
      tenantData,
      settingsData,
    ] = await Promise.all([
      // Total registrations
      supabaseAdmin
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Confirmed registrations
      supabaseAdmin
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'confirmed'),

      // This month registrations
      supabaseAdmin
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'confirmed')
        .gte('created_at', startOfMonth),

      // Daily trend (last 30 days)
      supabaseAdmin
        .from('registrations')
        .select('created_at, amount_paid')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'confirmed')
        .gte('created_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true }),

      // Abandonments
      supabaseAdmin
        .from('payment_abandonments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Recovered abandonments
      supabaseAdmin
        .from('payment_abandonments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'recovered'),

      // Tenant info for plan limits
      supabaseAdmin
        .from('tenants')
        .select('subscription_plan')
        .eq('id', tenantId)
        .single(),

      // Event details from site_settings
      supabaseAdmin
        .from('site_settings')
        .select('setting_key, setting_value')
        .eq('tenant_id', tenantId),
    ]);

    // Calculate daily trend
    const trendMap = new Map<string, { count: number; revenue: number }>();
    if (trendData.data) {
      for (const reg of trendData.data) {
        const date = new Date(reg.created_at).toISOString().split('T')[0];
        const current = trendMap.get(date) || { count: 0, revenue: 0 };
        current.count++;
        current.revenue += reg.amount_paid || 0;
        trendMap.set(date, current);
      }
    }
    const trend = Array.from(trendMap.entries()).map(([date, val]) => ({
      date,
      count: val.count,
      revenue: val.revenue,
    }));

    // Revenue calculation (sum of confirmed registration amounts)
    const { data: revenueData } = await supabaseAdmin
      .from('registrations')
      .select('amount_paid')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'confirmed');

    const totalRevenue = (revenueData || []).reduce((sum: number, r: any) => sum + (r.amount_paid || 0), 0);

    const { data: monthRevenueData } = await supabaseAdmin
      .from('registrations')
      .select('amount_paid')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'confirmed')
      .gte('created_at', startOfMonth);

    const monthRevenue = (monthRevenueData || []).reduce((sum: number, r: any) => sum + (r.amount_paid || 0), 0);

    const totalCount = totalRegs.count || 0;
    const confirmedCount = confirmedRegs.count || 0;
    const abandonedCount = abandonmentData.count || 0;
    const recoveredCount = recoveryData.count || 0;

    const plan = tenantData.data?.subscription_plan || 'trial';
    
    // Dynamic plan limit query
    let limit = 50;
    try {
      const { data: planInfo } = await supabaseAdmin
        .from('plans')
        .select('guest_limit')
        .eq('name', plan.toLowerCase())
        .single();
      if (planInfo) {
        limit = planInfo.guest_limit;
      } else {
        limit = FALLBACK_PLAN_LIMITS[plan.toLowerCase()] || 50;
      }
    } catch {
      limit = FALLBACK_PLAN_LIMITS[plan.toLowerCase()] || 50;
    }

    const used = monthRegs.count || 0;

    // Parse event details
    const settings = settingsData.data || [];
    const eventName = settings.find((s: any) => s.setting_key === 'event_name')?.setting_value || 'N/A';
    const eventDate = settings.find((s: any) => s.setting_key === 'event_date')?.setting_value || 'N/A';
    const eventVenue = settings.find((s: any) => s.setting_key === 'event_venue')?.setting_value || 'N/A';

    return {
      registrations: {
        total: totalCount,
        confirmed: confirmedCount,
        this_month: used,
        trend,
      },
      revenue: {
        total: totalRevenue,
        this_month: monthRevenue,
      },
      conversion: {
        orders_created: totalCount,
        payments_confirmed: confirmedCount,
        rate: totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0,
      },
      recovery: {
        abandoned: abandonedCount,
        recovered: recoveredCount,
        recovery_rate: abandonedCount > 0 ? Math.round((recoveredCount / abandonedCount) * 100) : 0,
      },
      usage: {
        used,
        limit,
        percent: limit > 0 ? Math.round((used / limit) * 100) : 0,
      },
      event: {
        name: eventName,
        date: eventDate,
        venue: eventVenue,
      },
    };
  }

  /**
   * Get global analytics (super admin)
   */
  async getGlobalAnalytics(period?: string): Promise<GlobalAnalytics> {
    const [
      allTenants,
      activeTenants,
      trialingTenants,
      cancelledTenants,
      activeSubscriptions,
      referralData,
    ] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true }),

      supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('subscription_status', ['active', 'trialing']),

      supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'trialing'),

      supabaseAdmin
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'cancelled'),

      // Active subscriptions for MRR
      supabaseAdmin
        .from('subscriptions')
        .select('amount, billing_cycle')
        .eq('status', 'active'),

      // Referral stats
      supabaseAdmin
        .from('referrals')
        .select('*', { count: 'exact', head: true }),
    ]);

    // Calculate MRR from active subscriptions
    let mrr = 0;
    if (activeSubscriptions.data) {
      for (const sub of activeSubscriptions.data) {
        const monthlyAmount = sub.billing_cycle === 'yearly'
          ? Math.round(sub.amount / 12)
          : sub.amount;
        mrr += monthlyAmount;
      }
    }
    // Convert from paise to rupees
    mrr = Math.round(mrr / 100);
    const arr = mrr * 12;

    // Signup trend (last 12 months)
    const { data: tenantTrend } = await supabaseAdmin
      .from('tenants')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });

    const trendMap = new Map<string, number>();
    if (tenantTrend) {
      for (const t of tenantTrend) {
        const month = new Date(t.created_at).toISOString().slice(0, 7); // YYYY-MM
        trendMap.set(month, (trendMap.get(month) || 0) + 1);
      }
    }
    const signup_trend = Array.from(trendMap.entries()).map(([month, count]) => ({ month, count }));

    // Plan distribution
    const { data: planData } = await supabaseAdmin
      .from('tenants')
      .select('subscription_plan')
      .eq('is_active', true);

    const planMap = new Map<string, number>();
    if (planData) {
      for (const t of planData) {
        const plan = t.subscription_plan || 'trial';
        planMap.set(plan, (planMap.get(plan) || 0) + 1);
      }
    }
    const plan_distribution = Array.from(planMap.entries()).map(([plan, count]) => ({ plan, count }));

    // Top tenants by registrations
    const { data: topTenantsRaw } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug')
      .eq('is_active', true)
      .limit(10);

    const top_tenants: { id: string; name: string; slug: string; registrations: number }[] = [];
    if (topTenantsRaw) {
      for (const tenant of topTenantsRaw) {
        const { count } = await supabaseAdmin
          .from('registrations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('payment_status', 'confirmed');
        top_tenants.push({ ...tenant, registrations: count || 0 });
      }
      top_tenants.sort((a, b) => b.registrations - a.registrations);
    }

    // Referral commission total
    let commissionData: any[] | null = null;
    try {
      const commissionResult = await supabaseAdmin
        .from('referral_commissions')
        .select('amount');
      commissionData = commissionResult.data;
    } catch {
      commissionData = null;
    }

    const totalCommission = (commissionData || []).reduce(
      (sum: number, c: any) => sum + (c.amount || 0), 0
    );

    // Churn rate
    const totalActive = (activeTenants.count || 0);
    const totalCancelled = (cancelledTenants.count || 0);
    const churnRate = (totalActive + totalCancelled) > 0
      ? Math.round((totalCancelled / (totalActive + totalCancelled)) * 100)
      : 0;

    return {
      mrr,
      arr,
      tenant_counts: {
        total: allTenants.count || 0,
        active: totalActive,
        trialing: trialingTenants.count || 0,
        cancelled: totalCancelled,
      },
      signup_trend,
      plan_distribution,
      top_tenants: top_tenants.slice(0, 10),
      referral_stats: {
        total_referrals: referralData.count || 0,
        total_commission: Math.round(totalCommission / 100),
      },
      churn_rate: churnRate,
    };
  }
}

export const analyticsService = new AnalyticsService();
