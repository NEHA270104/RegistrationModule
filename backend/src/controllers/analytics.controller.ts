import { Response } from 'express';
import { analyticsService } from '../services/analytics.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * GET /api/t/:slug/analytics
 */
export async function getTenantAnalytics(req: TenantRequest, res: Response): Promise<void> {
  const period = req.query.period as string;
  const analytics = await analyticsService.getTenantAnalytics(req.tenantId!, period);
  res.json({ success: true, data: analytics });
}

/**
 * GET /api/super-admin/analytics
 */
export async function getGlobalAnalytics(req: TenantRequest, res: Response): Promise<void> {
  const period = req.query.period as string;
  const analytics = await analyticsService.getGlobalAnalytics(period);
  res.json({ success: true, data: analytics });
}
