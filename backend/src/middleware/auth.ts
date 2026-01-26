import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

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

/**
 * Optional auth - extracts user info if available
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (apiKey && apiKey === config.adminApiKey) {
    (req as Request & { isAdmin: boolean }).isAdmin = true;
  }

  next();
}
