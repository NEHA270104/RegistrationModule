import { Response } from 'express';
import { auditService } from '../services/audit.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

/**
 * GET /api/t/:slug/activity-log
 */
export async function getTenantActivityLog(req: TenantRequest, res: Response): Promise<void> {
  const result = await auditService.getByTenant(req.tenantId!, {
    action: req.query.action as string,
    resource_type: req.query.resource_type as string,
    date_from: req.query.date_from as string,
    date_to: req.query.date_to as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
  });

  res.json({ success: true, data: result });
}

/**
 * GET /api/super-admin/audit-log
 */
export async function getGlobalAuditLog(req: TenantRequest, res: Response): Promise<void> {
  const result = await auditService.getGlobal({
    action: req.query.action as string,
    resource_type: req.query.resource_type as string,
    date_from: req.query.date_from as string,
    date_to: req.query.date_to as string,
    search: req.query.search as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
  });

  res.json({ success: true, data: result });
}
