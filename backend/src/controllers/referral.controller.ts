import { Response } from 'express';
import { referralService } from '../services/referral.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

// ============================================
// Tenant endpoints
// ============================================

export async function getReferralStats(req: TenantRequest, res: Response): Promise<void> {
  const stats = await referralService.getReferralStats(req.tenantId!);
  res.json({ success: true, data: stats });
}

export async function generateReferralCode(req: TenantRequest, res: Response): Promise<void> {
  const code = await referralService.generateReferralCode(req.tenantId!);
  res.json({ success: true, data: { referral_code: code } });
}

export async function requestPayout(req: TenantRequest, res: Response): Promise<void> {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, error: { message: 'Valid amount is required' } });
    return;
  }
  await referralService.requestPayout(req.tenantId!, amount);
  res.json({ success: true, message: 'Payout request submitted' });
}

// ============================================
// Public endpoint (click tracking)
// ============================================

export async function trackReferralClick(req: TenantRequest, res: Response): Promise<void> {
  const { code } = req.params;
  const ip = (req.ip || req.headers['x-forwarded-for'] || '') as string;
  const userAgent = req.headers['user-agent'] || '';

  await referralService.trackClick(code, ip, userAgent);
  res.json({ success: true });
}

// ============================================
// Super admin endpoints
// ============================================

export async function listAllReferrals(req: TenantRequest, res: Response): Promise<void> {
  const { page, limit } = req.query;
  const result = await referralService.listAll({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  res.json({ success: true, data: result.referrals, total: result.total });
}

export async function listPendingPayouts(req: TenantRequest, res: Response): Promise<void> {
  const payouts = await referralService.listPendingPayouts();
  res.json({ success: true, data: payouts });
}

export async function processPayout(req: TenantRequest, res: Response): Promise<void> {
  const { referrer_tenant_id, amount, reference } = req.body;
  if (!referrer_tenant_id || !amount || !reference) {
    res.status(400).json({
      success: false,
      error: { message: 'referrer_tenant_id, amount, and reference are required' },
    });
    return;
  }
  await referralService.processPayout(referrer_tenant_id, amount, reference);
  res.json({ success: true, message: 'Payout processed' });
}
