import { Response } from 'express';
import { subscriptionService } from '../services/subscription.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * GET /api/t/:slug/subscription
 */
export async function getSubscription(req: TenantRequest, res: Response): Promise<void> {
  const sub = await subscriptionService.getByTenantId(req.tenantId!);
  const usage = await subscriptionService.checkUsage(req.tenantId!);

  res.json({
    success: true,
    data: {
      subscription: sub,
      usage,
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
