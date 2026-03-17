import { Response } from 'express';
import { legalService } from '../services/legal.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * POST /api/t/:slug/legal/accept
 * Body: { document_type, document_version, accepted_by_email }
 */
export async function acceptLegalDocument(req: TenantRequest, res: Response): Promise<void> {
  const { document_type, document_version, accepted_by_email } = req.body;

  if (!document_type || !accepted_by_email) {
    res.status(400).json({
      success: false,
      error: { message: 'document_type and accepted_by_email are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const acceptance = await legalService.recordAcceptance(
    req.tenantId!,
    accepted_by_email,
    document_type,
    document_version,
    req.ip,
    req.get('user-agent')
  );

  res.json({ success: true, data: { acceptance } });
}

/**
 * GET /api/t/:slug/legal/status
 */
export async function getLegalStatus(req: TenantRequest, res: Response): Promise<void> {
  const status = await legalService.getLegalStatus(req.tenantId!);
  res.json({ success: true, data: status });
}
