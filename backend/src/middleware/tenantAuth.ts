import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export interface TenantRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  tenantSlug?: string;
}

/**
 * JWT-based tenant authentication middleware.
 * Extracts tenant_id from Supabase Auth JWT user_metadata.
 */
export const tenantAuth = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Missing authorization token', code: 'UNAUTHORIZED' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      });
      return;
    }

    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      res.status(403).json({
        success: false,
        error: { message: 'No tenant associated with this account', code: 'NO_TENANT' },
      });
      return;
    }

    // If route has :slug param, verify it matches the user's tenant
    const slugParam = req.params.slug;
    if (slugParam) {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, slug')
        .eq('slug', slugParam)
        .eq('is_active', true)
        .single();

      if (tenantError || !tenant) {
        res.status(404).json({
          success: false,
          error: { message: 'Tenant not found', code: 'TENANT_NOT_FOUND' },
        });
        return;
      }

      // Ensure user belongs to this tenant (unless super_admin)
      const role = user.user_metadata?.role || 'tenant_admin';
      if (role !== 'super_admin' && tenant.id !== tenantId) {
        res.status(403).json({
          success: false,
          error: { message: 'Access denied to this tenant', code: 'TENANT_MISMATCH' },
        });
        return;
      }

      req.tenantSlug = tenant.slug;
    }

    req.tenantId = tenantId;
    req.userId = user.id;
    req.userRole = user.user_metadata?.role || 'tenant_admin';

    next();
  } catch (err) {
    logger.error('tenantAuth error', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Authentication error', code: 'AUTH_ERROR' },
    });
  }
};

/**
 * Super admin middleware — must be a super_admin role user.
 */
export const superAdminAuth = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Missing authorization token', code: 'UNAUTHORIZED' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      });
      return;
    }

    const role = user.user_metadata?.role;
    if (role !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: { message: 'Super admin access required', code: 'SUPER_ADMIN_REQUIRED' },
      });
      return;
    }

    req.tenantId = user.user_metadata?.tenant_id;
    req.userId = user.id;
    req.userRole = 'super_admin';

    next();
  } catch (err) {
    logger.error('superAdminAuth error', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Authentication error', code: 'AUTH_ERROR' },
    });
  }
};
