import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { tenantService, type CreateTenantRequest } from './tenant.service.js';

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  company_name: string;
  phone?: string;
  referral_code?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    tenant_id: string;
    role: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
}

export class AuthService {
  /**
   * Sign up a new tenant admin. Creates both auth user and tenant record.
   */
  async signup(data: SignupRequest): Promise<AuthResponse> {
    // Generate slug from company name
    const slug = data.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if slug is taken
    const existing = await tenantService.getBySlug(slug);
    if (existing) {
      throw new AppError('A tenant with this name already exists. Please choose a different company name.', 409, 'SLUG_TAKEN');
    }

    // Resolve referral
    let referredByTenantId: string | undefined;
    if (data.referral_code) {
      const referrer = await tenantService.getByReferralCode(data.referral_code);
      if (referrer) {
        referredByTenantId = referrer.id;
      }
    }

    // Create tenant first
    const tenant = await tenantService.create({
      name: data.name,
      slug,
      email: data.email,
      phone: data.phone,
      company_name: data.company_name,
      referred_by_tenant_id: referredByTenantId,
    });

    try {
      // Create Supabase Auth user with tenant metadata
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          tenant_id: tenant.id,
          role: 'tenant_admin',
          name: data.name,
          company_name: data.company_name,
        },
      });

      if (authError) {
        // Cleanup: delete the tenant we just created
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
        logger.error('Auth user creation failed', { error: authError.message });
        throw new AppError(authError.message, 400, 'AUTH_SIGNUP_ERROR');
      }

      // Sign in to get session tokens
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError || !signInData.session) {
        throw new AppError('Account created but login failed. Please try logging in.', 500, 'AUTO_LOGIN_FAILED');
      }

      logger.info('Tenant signup complete', { tenantId: tenant.id, slug: tenant.slug, userId: authData.user.id });

      return {
        user: {
          id: authData.user.id,
          email: data.email,
          tenant_id: tenant.id,
          role: 'tenant_admin',
        },
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_in: signInData.session.expires_in,
        },
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Cleanup tenant on unexpected errors
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      logger.error('Unexpected error in signup', { error: error instanceof Error ? error.message : 'Unknown' });
      throw new AppError('Signup failed', 500, 'SIGNUP_ERROR');
    }
  }

  /**
   * Log in an existing user.
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const { data: signInData, error } = await supabaseAdmin.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      if (!signInData.session || !signInData.user) {
        throw new AppError('Login failed', 500, 'LOGIN_FAILED');
      }

      const tenantId = signInData.user.user_metadata?.tenant_id;
      const role = signInData.user.user_metadata?.role || 'tenant_admin';

      if (!tenantId) {
        throw new AppError('No tenant associated with this account', 403, 'NO_TENANT');
      }

      const tenant = await tenantService.getById(tenantId);
      if (!tenant) {
        throw new AppError('Tenant not found', 404, 'TENANT_NOT_FOUND');
      }

      if (!tenant.is_active) {
        throw new AppError('Your account has been deactivated. Please contact support.', 403, 'TENANT_INACTIVE');
      }

      logger.info('User logged in', { userId: signInData.user.id, tenantId });

      return {
        user: {
          id: signInData.user.id,
          email: data.email,
          tenant_id: tenantId,
          role,
        },
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_in: signInData.session.expires_in,
        },
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in login', { error: error instanceof Error ? error.message : 'Unknown' });
      throw new AppError('Login failed', 500, 'LOGIN_ERROR');
    }
  }

  /**
   * Refresh an expired access token.
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    try {
      const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !data.session) {
        throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Token refresh failed', 500, 'REFRESH_ERROR');
    }
  }

  /**
   * Get current user profile from token.
   */
  async getProfile(token: string): Promise<{
    id: string;
    email: string;
    tenant_id: string;
    role: string;
    name: string;
  }> {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
      }

      return {
        id: user.id,
        email: user.email || '',
        tenant_id: user.user_metadata?.tenant_id || '',
        role: user.user_metadata?.role || 'tenant_admin',
        name: user.user_metadata?.name || '',
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to fetch profile', 500, 'PROFILE_ERROR');
    }
  }

  /**
   * Sign out (invalidate session).
   */
  async logout(token: string): Promise<void> {
    try {
      // Get user to sign out
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        await supabaseAdmin.auth.admin.signOut(user.id);
      }
    } catch {
      // Logout errors are non-critical
    }
  }
}

export const authService = new AuthService();
