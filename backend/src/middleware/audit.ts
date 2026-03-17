import { Response, NextFunction } from 'express';
import type { TenantRequest } from './tenantAuth.js';
import { auditService } from '../services/audit.service.js';

/**
 * Derive action from HTTP method
 */
function deriveAction(method: string): string {
  const map: Record<string, string> = {
    GET: 'read',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };
  return map[method] || method.toLowerCase();
}

/**
 * Derive resource type from the route path.
 * Extracts the main resource segment from paths like /:slug/guests/:id
 */
function deriveResourceType(path: string): string {
  // Remove leading /api/t/:slug/ or /api/super-admin/ prefix
  const cleaned = path
    .replace(/^\/api\/t\/[^/]+\//, '')
    .replace(/^\/api\/super-admin\//, '')
    .replace(/^\//, '');

  // Get the first segment as resource type
  const segment = cleaned.split('/')[0] || 'unknown';

  // Normalize common segments
  const normalizeMap: Record<string, string> = {
    'msme-benefits': 'msme_benefit',
    'email-templates': 'email_template',
    'rebrand-requests': 'rebrand_request',
    'churn-offers': 'churn_offer',
    'activity-log': 'audit_log',
    'audit-log': 'audit_log',
  };

  return normalizeMap[segment] || segment.replace(/-/g, '_');
}

/**
 * Audit middleware — logs all authenticated API actions.
 * Non-blocking: audit logging happens after the response is sent.
 */
export function auditMiddleware(req: TenantRequest, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    // Fire-and-forget audit log after response completes
    const action = deriveAction(req.method);
    const resourceType = deriveResourceType(req.originalUrl);

    auditService.log({
      tenant_id: req.tenantId,
      actor_id: req.userId,
      actor_role: req.userRole,
      action,
      resource_type: resourceType,
      resource_id: req.params.id || req.params.requestId || req.params.offerId || undefined,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      metadata: {
        method: req.method,
        path: req.originalUrl,
        status_code: res.statusCode,
      },
    });

    return originalJson(body);
  };

  next();
}
