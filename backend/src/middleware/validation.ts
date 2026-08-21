import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { logger } from '../utils/logger.js';

// ============================================
// Validation Schemas
// ============================================

export const createOrderSchema = z.object({
  tier: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .pipe(
      z.enum([
        'vip', 'standard', 'basic', 'waitlist',
        'starter', 'pro', 'enterprise', 'premium',
        'launchpad', 'scaleup',                    // alias display names
      ])
    ),
  tenant_id: z.string().uuid().optional(),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s.'-]+$/, 'Name contains invalid characters')
    .optional(),
  email: z.string().email('Invalid email address').max(255).optional(),
  phone: z
    .string()
    .regex(/^(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}$/, 'Invalid Indian phone number')
    .transform((val) => val.replace(/\D/g, '').slice(-10))
    .optional(),
  order_id: z.string().max(100).optional(),
  business_name: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  revenue_range: z
    .enum(['0-10L', '10L-50L', '50L-1Cr', '1Cr-5Cr', '5Cr-10Cr', '10Cr+'])
    .optional(),
  employee_count: z.enum(['1-10', '11-50', '51-200', '200+']).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  billing_cycle: z.enum(['monthly', 'yearly']).optional(),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
  recovery_token: z.string().optional(),
});

export const waitlistSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email address').max(255),
  phone: z
    .string()
    .regex(/^(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}$/, 'Invalid Indian phone number')
    .transform((val) => val.replace(/\D/g, '').slice(-10)),
  business_name: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  preferred_tier: z.enum(['vip', 'standard', 'basic']).default('standard'),
  purchase_livestream: z.boolean().default(false),
});

export const adminFiltersSchema = z.object({
  tier: z.enum(['vip', 'standard', 'basic', 'waitlist']).optional(),
  payment_status: z
    .enum(['pending', 'processing', 'confirmed', 'failed', 'refunded', 'expired'])
    .optional(),
  search: z.string().max(100).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort_by: z
    .enum(['created_at', 'name', 'email', 'tier', 'payment_status', 'amount_paid'])
    .default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const bookingIdSchema = z.object({
  bookingId: z.string().regex(/^BF-2026-\d{6}$/, 'Invalid booking ID format'),
});

// ============================================
// Validation Middleware
// ============================================

export function validate<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        logger.warn('Validation failed', { errors });

        res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: { errors },
          },
        });
        return;
      }

      next(error);
    }
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid query parameters',
            code: 'VALIDATION_ERROR',
            details: { errors },
          },
        });
        return;
      }

      next(error);
    }
  };
}

export function validateParams<T extends ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid parameters',
            code: 'VALIDATION_ERROR',
          },
        });
        return;
      }

      next(error);
    }
  };
}

// ============================================
// Sanitization Helpers
// ============================================

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .substring(0, 1000); // Limit length
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
