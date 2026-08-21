import { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { emailService } from '../services/email.service.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/auth/signup
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { email, password, name, company_name, phone, referral_code, industry } = body || {};

  if (!email || !password || !name || !company_name) {
    res.status(400).json({
      success: false,
      error: { message: 'Email, password, name, and company_name are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      success: false,
      error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const emailClean = email.toLowerCase().trim();
  const result = await authService.signup({ email: emailClean, password, name, company_name, phone, referral_code, industry });
  res.status(201).json({ success: true, data: result });
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { email, password } = body || {};

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const emailClean = email.toLowerCase().trim();
  const result = await authService.login({ email: emailClean, password });
  res.json({ success: true, data: result });
}

/**
 * POST /api/auth/refresh
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({
      success: false,
      error: { message: 'refresh_token is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await authService.refreshToken(refresh_token);
  res.json({ success: true, data: result });
}

/**
 * GET /api/auth/profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Missing authorization token', code: 'UNAUTHORIZED' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const profile = await authService.getProfile(token);
  res.json({ success: true, data: profile });
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
  await authService.logout(token);
  res.json({ success: true, message: 'Logged out' });
}

/**
 * POST /api/auth/forgot-password
 */
export async function sendPasswordResetOtp(req: Request, res: Response): Promise<void> {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { identifier } = body || {};

  if (!identifier) {
    res.status(400).json({
      success: false,
      error: { message: 'Email or mobile number is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  try {
    // Generate and store OTP in service
    const { otp, email, phone, name } = await authService.generateAndStoreOtp(identifier);

    // Determine target based on email vs mobile number
    const isEmail = identifier.includes('@');
    const target = isEmail ? email : (phone || identifier);

    // Send OTP using MSG91 via emailService
    await emailService.sendOTP(target, otp, name);

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    logger.error('Forgot password OTP sending failed', {
      identifier,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        message: error.message || 'Failed to send OTP. Please try again.',
        code: error.code || 'OTP_SEND_ERROR',
      },
    });
  }
}

/**
 * POST /api/auth/verify-otp
 */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  console.log('Verifying OTP payload:', req.body);
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { identifier, otp } = body || {};

  if (!identifier || !otp) {
    res.status(400).json({
      success: false,
      error: { message: 'Identifier and OTP are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const resetToken = await authService.verifyOtp(identifier, otp);
  res.json({ success: true, resetToken });
}

/**
 * POST /api/auth/reset-password
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { resetToken, password } = body || {};

  if (!resetToken || !password) {
    res.status(400).json({
      success: false,
      error: { message: 'Reset token and new password are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  await authService.resetPassword(resetToken, password);
  res.json({ success: true, message: 'Password has been reset successfully' });
}

/**
 * POST /api/auth/login-email-only
 */
export async function loginEmailOnly(req: Request, res: Response): Promise<void> {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { email } = body || {};

  if (!email) {
    res.status(400).json({
      success: false,
      error: { message: 'Email is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const emailClean = email.toLowerCase().trim();

  try {
    // Temporary, passwordless login for development/summit purposes.
    // TODO: We should implement 'Magic Link' authentication (via Supabase Auth) for the official launch.
    const result = await authService.loginEmailOnly(emailClean);
    res.status(200).json({
      success: true,
      token: result.session.access_token,
      user: { id: result.user.id, email: result.user.email },
      data: result
    });
  } catch (error: any) {
    logger.error('Email-only login failed', {
      email: emailClean,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(error.statusCode || 401).json({
      success: false,
      error: {
        message: error.message || 'Authentication failed',
        code: error.code || 'UNAUTHORIZED',
      },
    });
  }
}

/**
 * GET /api/auth/session-status
 *
 * Verifies whether the authenticated user already has a registered tenant
 * with an active paid subscription. Used by the onboarding page to decide
 * whether to redirect straight to /dashboard/ or to allow re-entering the
 * payment/registration flow.
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     is_registered: boolean,   // tenant record exists
 *     is_paid: boolean,         // subscription_status is active/trialing/past_due
 *     subscription_status: string,
 *     subscription_plan: string,
 *     slug: string,
 *     redirect_to: string       // '/dashboard/' when is_paid, else '/onboarding'
 *   }
 * }
 */
export async function sessionStatus(req: Request, res: Response): Promise<void> {
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
    // Validate the JWT via Supabase Admin (works for both Supabase-issued and custom JWTs)
    const { supabaseAdmin } = await import('../config/supabaseAdmin.js');
    const { supabase } = await import('../config/supabase.js');

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      });
      return;
    }

    // Resolve tenant_id from JWT metadata
    const tenantId: string | undefined = user.user_metadata?.tenant_id;

    if (!tenantId) {
      // Auth user exists but no tenant is linked yet — treat as unregistered
      res.json({
        success: true,
        data: {
          is_registered: false,
          is_paid: false,
          subscription_status: null,
          subscription_plan: null,
          slug: null,
          redirect_to: '/onboarding',
        },
      });
      return;
    }

    // Fetch tenant record with subscription info
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug, subscription_status, subscription_plan, is_active, status')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      // Tenant record missing despite auth user having tenant_id in metadata
      logger.warn('sessionStatus: tenant record not found for tenantId', { tenantId, userId: user.id });
      res.json({
        success: true,
        data: {
          is_registered: false,
          is_paid: false,
          subscription_status: null,
          subscription_plan: null,
          slug: null,
          redirect_to: '/onboarding',
        },
      });
      return;
    }

    // A subscription is considered "paid" if its status is one of these values
    const PAID_STATUSES = new Set(['active', 'trialing', 'past_due', 'premium']);
    const subStatus: string = tenant.subscription_status || tenant.status || 'inactive';
    const isPaid = PAID_STATUSES.has(subStatus.toLowerCase());

    logger.info('sessionStatus check', {
      userId: user.id,
      tenantId,
      slug: tenant.slug,
      subscription_status: subStatus,
      isPaid,
    });

    res.json({
      success: true,
      data: {
        is_registered: true,
        is_paid: isPaid,
        subscription_status: subStatus,
        subscription_plan: tenant.subscription_plan || null,
        slug: tenant.slug,
        redirect_to: isPaid ? '/dashboard/' : '/onboarding',
      },
    });
  } catch (err) {
    logger.error('sessionStatus error', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Session status check failed', code: 'SESSION_STATUS_ERROR' },
    });
  }
}
