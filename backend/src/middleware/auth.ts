import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';


/**
 * Admin authentication middleware
 * Validates API key for admin endpoints
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    logger.warn('Admin access attempted without API key', {
      ip: req.ip,
      path: req.path,
    });

    res.status(401).json({
      success: false,
      error: {
        message: 'API key required',
        code: 'UNAUTHORIZED',
      },
    });
    return;
  }

  if (apiKey !== config.adminApiKey) {
    logger.warn('Admin access attempted with invalid API key', {
      ip: req.ip,
      path: req.path,
      providedKeyLength: typeof apiKey === 'string' ? apiKey.length : 0,
      expectedKeyLength: config.adminApiKey.length,
    });

    res.status(403).json({
      success: false,
      error: {
        message: 'Invalid API key',
        code: 'FORBIDDEN',
      },
    });
    return;
  }

  // Log admin activity
  logger.info('Admin access granted', {
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  next();
}

/**
 * Webhook authentication middleware
 * Validates Razorpay webhook signature
 */
export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-razorpay-signature'] as string;

  if (!signature) {
    logger.warn('Webhook received without signature', {
      ip: req.ip,
    });

    res.status(401).json({
      success: false,
      error: {
        message: 'Webhook signature required',
        code: 'UNAUTHORIZED',
      },
    });
    return;
  }

  // Store signature for later verification
  req.headers['x-webhook-signature'] = signature;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (apiKey && apiKey === config.adminApiKey) {
    (req as Request & { isAdmin: boolean }).isAdmin = true;
  }

  next();
}

/**
 * Super Admin authentication middleware
 * Validates Supabase JWT and checks against the super_admins table
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check if DEVELOPMENT_MODE bypass is active
  if (process.env.DEVELOPMENT_MODE !== 'false') {
    (req as any).userId = 'dev-super-admin-id';
    (req as any).userRole = 'super_admin';
    (req as any).isAdmin = true;
    (req as any).userEmail = 'dev@eventregplatform.com';
    return next();
  }

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // Check if API key is provided and matches config.adminApiKey
  if (apiKey && apiKey === config.adminApiKey) {
    (req as any).isAdmin = true;
    (req as any).userRole = 'super_admin';
    return next();
  }

  // Also support Bearer token as API key if it matches config.adminApiKey
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token === config.adminApiKey) {
      (req as any).isAdmin = true;
      (req as any).userRole = 'super_admin';
      return next();
    }
  }

  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('Super Admin access attempted without authorization token', {
      ip: req.ip,
      path: req.path,
    });
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
      logger.warn('Super Admin access attempted with invalid token', {
        ip: req.ip,
        path: req.path,
      });
      res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      });
      return;
    }

    const email = user.email;
    if (!email) {
      logger.warn('Super Admin access attempted but user email is missing from JWT', {
        userId: user.id,
      });
      res.status(403).json({
        success: false,
        error: { message: 'User email not found', code: 'EMAIL_NOT_FOUND' },
      });
      return;
    }

    // Query super_admins table to see if email is authorized
    const { data: adminRecord, error: dbError } = await supabase
      .from('super_admins')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (dbError || !adminRecord) {
      logger.warn('Non-super-admin email attempted admin access', { email, ip: req.ip });
      res.status(403).json({
        success: false,
        error: { message: 'Super admin access required', code: 'SUPER_ADMIN_REQUIRED' },
      });
      return;
    }

    (req as any).userId = user.id;
    (req as any).userRole = 'super_admin';
    (req as any).isAdmin = true;
    (req as any).userEmail = email;

    logger.info('Super Admin access granted via JWT', { email, userId: user.id });
    next();
  } catch (err) {
    logger.error('requireSuperAdmin error', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Authentication error', code: 'AUTH_ERROR' },
    });
  }
}

