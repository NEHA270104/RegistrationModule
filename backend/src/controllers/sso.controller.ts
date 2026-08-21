import { Request, Response } from 'express';
import { ssoService } from '../services/sso.service.js';
import { logger } from '../utils/logger.js';

/**
 * GET /sso/callback?token=...&redirect=...
 * SSO callback from Agent Studio. Validates token, finds/creates tenant, creates session.
 */
export const ssoCallback = async (req: Request, res: Response): Promise<void> => {
  const { token, redirect } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).json({
      success: false,
      error: { message: 'Missing SSO token', code: 'MISSING_TOKEN' },
    });
    return;
  }

  try {
    // 1. Validate SSO token
    const payload = ssoService.validateSSOToken(token);

    // 2. Find or create tenant
    const tenant = await ssoService.findOrCreateTenant(payload);

    // 3. Create session
    const session = await ssoService.createSession(tenant, payload);

    // 4. Set session cookie and redirect
    res.cookie('session', session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    const redirectUrl = (typeof redirect === 'string' && redirect) || `/dashboard/${tenant.slug}`;

    logger.info('SSO callback success', {
      tenantId: tenant.id,
      orgId: payload.org_id,
      redirect: redirectUrl,
    });

    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('SSO callback failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });

    // Redirect to login with error
    const errorMsg = error instanceof Error ? error.message : 'SSO authentication failed';
    res.redirect(`/onboarding?sso_error=${encodeURIComponent(errorMsg)}`);
  }
};

/**
 * POST /sso/validate — API-based SSO validation (for embed mode / SPAs).
 * Returns session tokens as JSON instead of redirecting.
 */
export const ssoValidate = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({
      success: false,
      error: { message: 'Missing SSO token', code: 'MISSING_TOKEN' },
    });
    return;
  }

  try {
    const payload = ssoService.validateSSOToken(token);
    const tenant = await ssoService.findOrCreateTenant(payload);
    const session = await ssoService.createSession(tenant, payload);

    res.json({
      success: true,
      data: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        tenant: {
          id: session.tenant.id,
          slug: session.tenant.slug,
          name: session.tenant.name,
        },
      },
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode || 401;
    const code = (error as { code?: string })?.code || 'SSO_ERROR';
    res.status(statusCode).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'SSO validation failed',
        code,
      },
    });
  }
};
