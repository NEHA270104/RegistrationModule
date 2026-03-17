import crypto from 'crypto';
import { agentStudioConfig } from '../config/agentStudio.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { tenantService, type Tenant } from './tenant.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface SSOPayload {
  user_id: string;
  org_id: string;
  org_name: string;
  email: string;
  name: string;
  role: string;
  exp: number;
  iss: string;
  aud: string;
}

export interface SSOSession {
  access_token: string;
  refresh_token: string;
  tenant: Tenant;
}

class SSOService {
  /**
   * Validate SSO token from Agent Studio.
   * Token format: base64(JSON payload).base64(HMAC-SHA256 signature)
   */
  validateSSOToken(token: string): SSOPayload {
    if (!agentStudioConfig.ssoSecret) {
      throw new AppError('SSO is not configured', 500, 'SSO_NOT_CONFIGURED');
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        throw new AppError('Invalid SSO token format', 401, 'INVALID_SSO_TOKEN');
      }

      const [payloadB64, signatureB64] = parts;

      // Verify signature
      const expectedSig = crypto
        .createHmac('sha256', agentStudioConfig.ssoSecret)
        .update(payloadB64)
        .digest('base64url');

      if (signatureB64 !== expectedSig) {
        throw new AppError('Invalid SSO token signature', 401, 'INVALID_SSO_SIGNATURE');
      }

      // Decode payload
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8')
      ) as SSOPayload;

      // Check expiry
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        throw new AppError('SSO token has expired', 401, 'SSO_TOKEN_EXPIRED');
      }

      // Verify issuer and audience
      if (payload.iss !== agentStudioConfig.ssoIssuer) {
        throw new AppError('Invalid SSO token issuer', 401, 'INVALID_SSO_ISSUER');
      }
      if (payload.aud !== agentStudioConfig.ssoAudience) {
        throw new AppError('Invalid SSO token audience', 401, 'INVALID_SSO_AUDIENCE');
      }

      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('SSO token validation failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new AppError('Invalid SSO token', 401, 'INVALID_SSO_TOKEN');
    }
  }

  /**
   * Find or create tenant from Agent Studio org.
   */
  async findOrCreateTenant(ssoPayload: SSOPayload): Promise<Tenant> {
    // Look up by agent_studio_org_id
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('agent_studio_org_id', ssoPayload.org_id)
      .single();

    if (existing) {
      return existing as Tenant;
    }

    // Auto-provision a new tenant
    const slug = this.generateSlug(ssoPayload.org_name);
    const tenant = await tenantService.create({
      name: ssoPayload.name,
      slug,
      email: ssoPayload.email,
    });

    // Set agent_studio columns
    await supabaseAdmin
      .from('tenants')
      .update({
        agent_studio_org_id: ssoPayload.org_id,
        agent_studio_user_id: ssoPayload.user_id,
        company_name: ssoPayload.org_name,
      })
      .eq('id', tenant.id);

    logger.info('Tenant auto-provisioned via SSO', {
      tenantId: tenant.id,
      orgId: ssoPayload.org_id,
    });

    return { ...tenant, agent_studio_org_id: ssoPayload.org_id } as Tenant & { agent_studio_org_id: string };
  }

  /**
   * Create a Supabase Auth session for the SSO user.
   */
  async createSession(tenant: Tenant, ssoPayload: SSOPayload): Promise<SSOSession> {
    // Check if Supabase Auth user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === ssoPayload.email
    );

    let userId: string;

    if (existingUser) {
      // Update metadata if needed
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
          tenant_id: tenant.id,
          role: ssoPayload.role || 'tenant_admin',
          name: ssoPayload.name,
        },
      });
      userId = existingUser.id;
    } else {
      // Create new auth user with a random password (SSO-only login)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: ssoPayload.email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          tenant_id: tenant.id,
          role: ssoPayload.role || 'tenant_admin',
          name: ssoPayload.name,
          sso_provider: 'agent_studio',
        },
      });

      if (error || !newUser.user) {
        logger.error('Failed to create SSO auth user', { error: error?.message });
        throw new AppError('Failed to create auth session', 500, 'SSO_SESSION_ERROR');
      }
      userId = newUser.user.id;
    }

    // Generate a magic link or direct session via admin
    // Use generateLink to get a session token
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: ssoPayload.email,
    });

    if (linkError || !linkData) {
      throw new AppError('Failed to generate session', 500, 'SSO_SESSION_ERROR');
    }

    // Extract token from the hashed_token and create a session
    // For SSO, we'll return a custom session token that the frontend uses
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: ssoPayload.email,
    });

    // Since we need actual session tokens, use signInWithPassword with a known approach
    // We'll use the admin API to create a session directly
    // Workaround: generate a temporary password, sign in, then restore
    const tempPassword = crypto.randomBytes(32).toString('hex');
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword });

    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: ssoPayload.email,
      password: tempPassword,
    });

    // Reset to random password so direct login doesn't work
    const finalPassword = crypto.randomBytes(32).toString('hex');
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: finalPassword });

    if (signInError || !signInData.session) {
      throw new AppError('Failed to create SSO session', 500, 'SSO_SESSION_ERROR');
    }

    logger.info('SSO session created', { userId, tenantId: tenant.id });

    return {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      tenant,
    };
  }

  private generateSlug(name: string): string {
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Add random suffix to avoid collisions
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${slug}-${suffix}`;
  }
}

export const ssoService = new SSOService();
