import { Response } from 'express';
import { domainService } from '../services/domain.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * POST /api/t/:slug/domain/set
 * Body: { domain }
 */
export async function setCustomDomain(req: TenantRequest, res: Response): Promise<void> {
  const { domain } = req.body;

  if (!domain) {
    res.status(400).json({
      success: false,
      error: { message: 'domain is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await domainService.setCustomDomain(req.tenantId!, domain);
  res.json({ success: true, data: result });
}

/**
 * POST /api/t/:slug/domain/verify
 */
export async function verifyDomain(req: TenantRequest, res: Response): Promise<void> {
  const result = await domainService.verifyDomain(req.tenantId!);
  res.json({ success: true, data: result });
}

/**
 * GET /api/t/:slug/domain/status
 */
export async function getDomainStatus(req: TenantRequest, res: Response): Promise<void> {
  const status = await domainService.getDomainStatus(req.tenantId!);
  res.json({ success: true, data: status });
}
