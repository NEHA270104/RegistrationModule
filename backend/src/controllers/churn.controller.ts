import { Response } from 'express';
import { churnService } from '../services/churn.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * POST /api/t/:slug/subscription/initiate-cancellation
 * Body: { reason, feedback }
 */
export async function initiateCancellation(req: TenantRequest, res: Response): Promise<void> {
  const { reason, feedback } = req.body;

  if (!reason) {
    res.status(400).json({
      success: false,
      error: { message: 'reason is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await churnService.initiateCancellation(req.tenantId!, reason, feedback || '');
  res.json({ success: true, data: result });
}

/**
 * POST /api/t/:slug/churn-offers/:offerId/accept
 */
export async function acceptRetentionOffer(req: TenantRequest, res: Response): Promise<void> {
  await churnService.acceptRetentionOffer(req.tenantId!, req.params.offerId);
  res.json({ success: true, message: 'Offer accepted — your subscription is active again' });
}

/**
 * GET /api/t/:slug/churn-offers
 */
export async function getChurnOffers(req: TenantRequest, res: Response): Promise<void> {
  const offers = await churnService.getOffers(req.tenantId!);
  res.json({ success: true, data: { offers } });
}
