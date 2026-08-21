import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Standard rate limiter for general API endpoints
export const standardLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 minutes
  max: config.rateLimit.maxRequests, // 100 requests per window
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP address as key
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      },
    });
  },
});

// Stricter rate limiter for payment endpoints
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: {
    success: false,
    error: {
      message: 'Too many payment attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use email + IP as key for payment endpoints
    const email = req.body?.email || '';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${email}:${ip}`;
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Payment rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many payment attempts. Please wait 1 minute before trying again.',
        code: 'PAYMENT_RATE_LIMIT',
        retryAfter: 60,
      },
    });
  },
});

// Rate limiter for webhook endpoint (more permissive for Razorpay)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 webhooks per minute
  message: {
    success: false,
    error: {
      message: 'Too many webhook requests',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Allow Razorpay IPs (you might want to add actual Razorpay IP ranges)
    const razorpayIps: string[] = [];
    return razorpayIps.includes(req.ip || '');
  },
});

// Strict limiter for admin login/sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    success: false,
    error: {
      message: 'Too many attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many attempts. Please try again in 15 minutes.',
        code: 'STRICT_RATE_LIMIT',
        retryAfter: 900,
      },
    });
  },
});

// Lenient limiter for read-only endpoints
export const readOnlyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    success: false,
    error: {
      message: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin-specific rate limiter (very permissive for authenticated admin users)
// Admin dashboard makes many API calls on load and auto-refreshes frequently
// Since admin routes are already protected by authentication, we can be generous
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 1000, // 1000 requests per minute (effectively no limit for normal usage)
  message: {
    success: false,
    error: {
      message: 'Too many admin requests, please slow down',
      code: 'ADMIN_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use API key + IP as identifier for admin requests
    const apiKey = req.headers['x-api-key'] || '';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `admin:${apiKey}:${ip}`;
  },
  skip: (req: Request) => {
    // Skip rate limiting entirely if valid API key is present
    // Admin routes are already protected by adminAuth middleware
    const apiKey = req.headers['x-api-key'];
    return !!apiKey;
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Admin rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests. Please wait a moment before refreshing.',
        code: 'ADMIN_RATE_LIMIT_EXCEEDED',
        retryAfter: 60,
      },
    });
  },
});

// Rate limiter for OTP requests (max 3 requests per 15 minutes)
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window
  message: {
    success: false,
    error: {
      message: 'Too many OTP requests. Please try again in 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    logger.warn('OTP rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many OTP requests. Please try again in 15 minutes.',
        code: 'OTP_RATE_LIMIT',
        retryAfter: 900,
      },
    });
  },
});

