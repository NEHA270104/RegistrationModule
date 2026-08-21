import { Response } from 'express';
import { subscriptionService, FALLBACK_PLAN_LIMITS, FALLBACK_PLAN_PRICING } from '../services/subscription.service.js';
import { supabase } from '../config/supabase.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * GET /api/t/:slug/subscription
 */
export async function getSubscription(req: TenantRequest, res: Response): Promise<void> {
  const sub = await subscriptionService.getByTenantId(req.tenantId!);
  const usage = await subscriptionService.checkUsage(req.tenantId!);

  // Fetch plans from database
  let plans = [];
  try {
    const { data } = await supabase
      .from('plans')
      .select('*')
      .order('price_monthly', { ascending: true });
    plans = data || [];
  } catch (err) {
    plans = [];
  }

  // Fallback to defaults if empty
  if (plans.length === 0) {
    plans = [
      { name: 'Basic', price_monthly: 1, price_inr: 1, guest_limit: 3 },
      { name: 'Standard', price_monthly: 5, price_inr: 5, guest_limit: 10 },
      { name: 'Premium', price_monthly: 10, price_inr: 10, guest_limit: 50 }
    ];
  }

  res.json({
    success: true,
    data: {
      subscription: sub,
      usage,
      plans,
    },
  });
}

/**
 * POST /api/t/:slug/subscription/upgrade
 */
export async function upgradeSubscription(req: TenantRequest, res: Response): Promise<void> {
  const { plan, billing_cycle } = req.body;

  if (!plan || !billing_cycle) {
    res.status(400).json({
      success: false,
      error: { message: 'plan and billing_cycle are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const subscription = await subscriptionService.changePlan(req.tenantId!, plan, billing_cycle);
  res.json({ success: true, data: { subscription } });
}

/**
 * POST /api/t/:slug/subscription/cancel
 */
export async function cancelSubscription(req: TenantRequest, res: Response): Promise<void> {
  await subscriptionService.cancel(req.tenantId!);
  res.json({ success: true, message: 'Subscription cancelled' });
}

/**
 * GET /api/super-admin/subscriptions
 */
export async function listAllSubscriptions(req: TenantRequest, res: Response): Promise<void> {
  const result = await subscriptionService.listAll({
    status: req.query.status as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
  });

  res.json({ success: true, data: result });
}
