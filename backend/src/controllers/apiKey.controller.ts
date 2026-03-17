import { Response } from 'express';
import { apiKeyService } from '../services/apiKey.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * POST /api/t/:slug/api-keys
 * Body: { name, scopes?, expires_in_days? }
 */
export async function createApiKey(req: TenantRequest, res: Response): Promise<void> {
  const { name, scopes, expires_in_days } = req.body;

  if (!name) {
    res.status(400).json({
      success: false,
      error: { message: 'name is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await apiKeyService.createKey(
    req.tenantId!,
    name,
    scopes || ['read'],
    expires_in_days
  );

  res.status(201).json({
    success: true,
    data: {
      key: result.key,
      raw_key: result.raw_key,
    },
    message: 'Save this key — it will not be shown again.',
  });
}

/**
 * GET /api/t/:slug/api-keys
 */
export async function listApiKeys(req: TenantRequest, res: Response): Promise<void> {
  const keys = await apiKeyService.listKeys(req.tenantId!);
  res.json({ success: true, data: { keys } });
}

/**
 * DELETE /api/t/:slug/api-keys/:keyId
 */
export async function revokeApiKey(req: TenantRequest, res: Response): Promise<void> {
  await apiKeyService.revokeKey(req.tenantId!, req.params.keyId);
  res.json({ success: true, message: 'API key revoked' });
}
