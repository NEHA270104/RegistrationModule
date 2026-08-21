import { Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import type { TenantRequest } from './tenantAuth.js';

const RATE_LIMITS: Record<string, { windowMs: number; max: number; registrationsPerMonth: number }> = {
  trial: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 50,
    registrationsPerMonth: 50,
  },
  starter: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    registrationsPerMonth: 3,
  },
  pro: {
    windowMs: 15 * 60 * 1000,
    max: 200,
    registrationsPerMonth: 10,
  },
  enterprise: {
    windowMs: 15 * 60 * 1000,
    max: 500,
    registrationsPerMonth: 50,
  },
};

// Cache of rate limiters per tenant plan
const limiterCache = new Map<string, ReturnType<typeof rateLimit>>();

function getLimiter(plan: string): ReturnType<typeof rateLimit> {
  if (limiterCache.has(plan)) {
    return limiterCache.get(plan)!;
  }

  const limits = RATE_LIMITS[plan] || RATE_LIMITS.trial;
  const limiter = rateLimit({
    windowMs: limits.windowMs,
    max: limits.max,
    keyGenerator: (req) => (req as TenantRequest).tenantId || req.ip || 'unknown',
    message: {
      success: false,
      error: {
        message: 'Rate limit exceeded for your plan',
        code: 'RATE_LIMIT_EXCEEDED',
        plan,
        upgrade_url: '/dashboard/subscription',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  limiterCache.set(plan, limiter);
  return limiter;
}

/**
 * Per-tenant API rate limiting based on subscription plan.
 * Must be used after tenantAuth middleware.
 */
export const tenantRateLimiter = async (
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    next();
    return;
  }

  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('subscription_plan')
      .eq('id', tenantId)
      .single();

    const plan = tenant?.subscription_plan || 'trial';
    const limiter = getLimiter(plan);
    limiter(req, res, next);
  } catch {
    // If we can't fetch tenant, apply trial limits
    const limiter = getLimiter('trial');
    limiter(req, res, next);
  }
};

/**
 * Check monthly registration limit before creating a registration.
 * Call this in the registration flow, not as middleware.
 */
export async function checkRegistrationLimit(tenantId: string): Promise<void> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('subscription_plan')
    .eq('id', tenantId)
    .single();

  const plan = tenant?.subscription_plan || 'trial';
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.trial;

  if (limits.registrationsPerMonth === -1) return; // unlimited

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth.toISOString());

  const used = count || 0;

  if (used >= limits.registrationsPerMonth) {
    throw new AppError(
      `Registration limit reached (${used}/${limits.registrationsPerMonth}). Upgrade your plan for more.`,
      429,
      'REGISTRATION_LIMIT_EXCEEDED'
    );
  }
}

/**
 * Get usage stats for a tenant (for dashboard display).
 */
export async function getUsageStats(tenantId: string): Promise<{
  plan: string;
  api_requests: { limit: number; window_minutes: number };
  registrations: { used: number; limit: number; unlimited: boolean };
}> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('subscription_plan')
    .eq('id', tenantId)
    .single();

  const plan = tenant?.subscription_plan || 'trial';
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.trial;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth.toISOString());

  return {
    plan,
    api_requests: {
      limit: limits.max,
      window_minutes: limits.windowMs / 60000,
    },
    registrations: {
      used: count || 0,
      limit: limits.registrationsPerMonth,
      unlimited: limits.registrationsPerMonth === -1,
    },
  };
}
