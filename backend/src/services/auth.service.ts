import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { tenantService, type CreateTenantRequest } from './tenant.service.js';
import { emailService } from './email.service.js';
import { config } from '../config/index.js';

// In-memory stores for OTPs and temporary reset tokens
const otpStore = new Map<string, { otp: string; expiresAt: number; email: string }>();
const resetTokenStore = new Map<string, { email: string; expiresAt: number }>();

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  company_name: string;
  phone?: string;
  referral_code?: string;
  industry?: string;
  job_title?: string;
  bio?: string;
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
    company_name: string | null;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    favicon_url: string | null;
    subscription_plan: string;
    subscription_status: string;
    industry: string | null;
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
      industry: data.industry,
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
          job_title: data.job_title || null,
          bio: data.bio || null,
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
          company_name: tenant.company_name,
          logo_url: tenant.logo_url,
          primary_color: tenant.primary_color,
          secondary_color: tenant.secondary_color,
          favicon_url: tenant.favicon_url,
          subscription_plan: tenant.subscription_plan,
          subscription_status: tenant.subscription_status,
          industry: tenant.industry,
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
    const { email, password } = data;
    try {
      const { data: signInData, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error(`Login failed for ${email}: ${error.message}`);
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      if (!signInData.session || !signInData.user) {
        throw new AppError('Login failed', 500, 'LOGIN_FAILED');
      }

      // Check if the user is a super admin first
      console.log('Querying super_admins for:', email.toLowerCase());
      const { data: adminRecord } = await supabaseAdmin
        .from('super_admins')
        .select('email')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      const isSuperAdmin = !!adminRecord;

      // Fetch tenant_id and industry directly from database by email
      const { data: dbTenant, error: dbError } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (!dbTenant && !isSuperAdmin) {
        throw new AppError('No tenant associated with this account', 403, 'NO_TENANT');
      }

      const tenantId = dbTenant?.id || '00000000-0000-0000-0000-000000000001';
      const role = isSuperAdmin ? 'super_admin' : (signInData.user.user_metadata?.role || 'tenant_admin');

      if (dbTenant && !dbTenant.is_active) {
        throw new AppError('Your account has been deactivated. Please contact support.', 403, 'TENANT_INACTIVE');
      }

      if (dbTenant) {
        // Sync metadata back to Supabase if they differ
        let metadataUpdated = false;
        const updatedMetadata = { ...signInData.user.user_metadata };
        if (updatedMetadata.tenant_id !== dbTenant.id) {
          updatedMetadata.tenant_id = dbTenant.id;
          metadataUpdated = true;
        }
        if (updatedMetadata.industry !== dbTenant.industry) {
          updatedMetadata.industry = dbTenant.industry;
          metadataUpdated = true;
        }

        if (metadataUpdated) {
          await supabaseAdmin.auth.admin.updateUserById(signInData.user.id, {
            user_metadata: updatedMetadata,
          });
        }
      }

      logger.info('User logged in', { userId: signInData.user.id, tenantId });

      return {
        user: {
          id: signInData.user.id,
          email,
          tenant_id: tenantId,
          role,
        },
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_in: signInData.session.expires_in,
        },
        tenant: dbTenant ? {
          id: dbTenant.id,
          slug: dbTenant.slug,
          name: dbTenant.name,
          company_name: dbTenant.company_name,
          logo_url: dbTenant.logo_url,
          primary_color: dbTenant.primary_color,
          secondary_color: dbTenant.secondary_color,
          favicon_url: dbTenant.favicon_url,
          subscription_plan: dbTenant.subscription_plan,
          subscription_status: dbTenant.subscription_status,
          industry: dbTenant.industry,
        } : {
          id: '00000000-0000-0000-0000-000000000001',
          slug: 'admin',
          name: 'EventReg Platform Admin',
          company_name: 'EventReg Platform',
          logo_url: null,
          primary_color: '#d946ef',
          secondary_color: '#3b82f6',
          favicon_url: null,
          subscription_plan: 'enterprise',
          subscription_status: 'active',
          industry: 'IT Services',
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in login', { error: error instanceof Error ? error.message : 'Unknown' });
      throw new AppError('Login failed', 500, 'LOGIN_ERROR');
    }
  }

  /**
   * Passwordless email-only login.
   * Temporary for development/summit purposes.
   * We should implement 'Magic Link' authentication (via Supabase Auth) for the official launch.
   */
  async loginEmailOnly(email: string): Promise<AuthResponse> {
    try {
      const emailClean = email.toLowerCase().trim();

      // Check if user is a super admin first
      console.log('Querying super_admins for:', emailClean);
      const { data: adminRecord } = await supabaseAdmin
        .from('super_admins')
        .select('email')
        .eq('email', emailClean)
        .maybeSingle();

      const isSuperAdmin = !!adminRecord;

      // Fetch tenant from database by email
      const { data: dbTenant, error: dbError } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('email', emailClean)
        .maybeSingle();

      if (!dbTenant && !isSuperAdmin) {
        throw new AppError('No user account found with that email address', 401, 'USER_NOT_FOUND');
      }

      if (dbTenant && !dbTenant.is_active) {
        throw new AppError('Your account has been deactivated. Please contact support.', 403, 'TENANT_INACTIVE');
      }

      // Get the Supabase Auth user by email if they exist, to get their user ID.
      let authUserId = '00000000-0000-0000-0000-000000000001';
      let userMetadata: any = {};
      try {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const user = users.find(u => u.email?.toLowerCase() === emailClean);
        if (user) {
          authUserId = user.id;
          userMetadata = user.user_metadata || {};
        }
      } catch (err) {
        logger.warn('Failed to retrieve Supabase Auth user, using fallback UUID', { email: emailClean });
      }

      const tenantId = dbTenant?.id || '00000000-0000-0000-0000-000000000001';
      const role = isSuperAdmin ? 'super_admin' : (userMetadata.role || 'tenant_admin');

      // Task 1: Replace with pure jwt.sign() logic to issue a new token
      const jwtSecret = process.env.JWT_SECRET!;
      const tokenPayload = {
        sub: authUserId,
        email: emailClean,
        tenant_id: tenantId,
        role: role,
        user_metadata: {
          role: role,
          tenant_id: tenantId,
          name: dbTenant?.name || 'User'
        }
      };

      const accessToken = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '7d' });
      const refreshToken = jwt.sign({ sub: authUserId, type: 'refresh' }, jwtSecret, { expiresIn: '30d' });
      const expiresIn = 7 * 24 * 3600; // 7 days in seconds

      console.log('ANTIGRAVITY DEBUG: Signed custom JWT token successfully for user:', {
        id: authUserId,
        email: emailClean,
        tenantId,
        role
      });


      return {
        user: {
          id: authUserId,
          email: emailClean,
          tenant_id: tenantId,
          role,
        },
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn,
        },
        tenant: dbTenant ? {
          id: dbTenant.id,
          slug: dbTenant.slug,
          name: dbTenant.name,
          company_name: dbTenant.company_name,
          logo_url: dbTenant.logo_url,
          primary_color: dbTenant.primary_color,
          secondary_color: dbTenant.secondary_color,
          favicon_url: dbTenant.favicon_url,
          subscription_plan: dbTenant.subscription_plan,
          subscription_status: dbTenant.subscription_status,
          industry: dbTenant.industry,
        } : {
          id: '00000000-0000-0000-0000-000000000001',
          slug: 'admin',
          name: 'EventReg Platform Admin',
          company_name: 'EventReg Platform',
          logo_url: null,
          primary_color: '#d946ef',
          secondary_color: '#3b82f6',
          favicon_url: null,
          subscription_plan: 'enterprise',
          subscription_status: 'active',
          industry: 'IT Services',
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in passwordless login', { error: error instanceof Error ? error.message : 'Unknown' });
      throw new AppError('Login failed', 500, 'LOGIN_ERROR');
    }
  }

  /**
   * Log in a super admin user. Dedicated authentication bypasses tenant checking.
   */
  async loginAdmin(data: LoginRequest): Promise<AuthResponse> {
    const { email, password } = data;
    if (process.env.DEVELOPMENT_MODE !== 'false') {
      logger.info('Bypassing admin login check for development mode', { email });
      return {
        user: {
          id: 'dev-super-admin-id',
          email: email || 'dev@eventregplatform.com',
          tenant_id: '00000000-0000-0000-0000-000000000001',
          role: 'super_admin',
        },
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
        },
        tenant: {
          id: '00000000-0000-0000-0000-000000000001',
          slug: 'admin',
          name: 'EventReg Platform Admin',
          company_name: 'EventReg Platform',
          logo_url: null,
          primary_color: '#d946ef',
          secondary_color: '#3b82f6',
          favicon_url: null,
          subscription_plan: 'enterprise',
          subscription_status: 'active',
          industry: 'IT Services',
        },
      };
    }
    try {
      const { data: signInData, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error(`Login failed for ${email}: ${error.message}`);
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      if (!signInData.session || !signInData.user) {
        throw new AppError('Login failed', 500, 'LOGIN_FAILED');
      }

      // Check if user is super admin
      console.log('Querying super_admins for:', email.toLowerCase());
      const { data: adminRecord, error: dbError } = await supabaseAdmin
        .from('super_admins')
        .select('email')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (dbError || !adminRecord) {
        logger.warn(`Access denied for ${email}: Not registered in super_admins table.`);
        throw new AppError('Access denied. You are not authorized as a Super Admin.', 403, 'UNAUTHORIZED_ACCESS');
      }

      logger.info('Super Admin logged in', { userId: signInData.user.id });

      return {
        user: {
          id: signInData.user.id,
          email,
          tenant_id: '00000000-0000-0000-0000-000000000001',
          role: 'super_admin',
        },
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_in: signInData.session.expires_in,
        },
        tenant: {
          id: '00000000-0000-0000-0000-000000000001',
          slug: 'admin',
          name: 'EventReg Platform Admin',
          company_name: 'EventReg Platform',
          logo_url: null,
          primary_color: '#d946ef',
          secondary_color: '#3b82f6',
          favicon_url: null,
          subscription_plan: 'enterprise',
          subscription_status: 'active',
          industry: 'IT Services',
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in admin login', { error: error instanceof Error ? error.message : 'Unknown' });
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
    tenant?: {
      id: string;
      slug: string;
      name: string;
      company_name: string | null;
      logo_url: string | null;
      primary_color: string;
      secondary_color: string;
      favicon_url: string | null;
      subscription_plan: string;
      subscription_status: string;
      industry: string | null;
    };
  }> {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
      }

      if (!user.email) {
        throw new AppError('User has no email associated', 400, 'NO_EMAIL');
      }

      // Check if user is super admin first
      console.log('Querying super_admins for:', user.email.toLowerCase());
      const { data: adminRecord } = await supabaseAdmin
        .from('super_admins')
        .select('email')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

      const isSuperAdmin = !!adminRecord;

      // Database-driven lookup by email
      const { data: dbTenant, error: dbError } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

      if (!dbTenant && !isSuperAdmin) {
        throw new AppError('No tenant associated with this account', 403, 'NO_TENANT');
      }

      let tenantId = user.user_metadata?.tenant_id || '';
      let tenant;

      if (dbTenant) {
        tenantId = dbTenant.id;
        tenant = {
          id: dbTenant.id,
          slug: dbTenant.slug,
          name: dbTenant.name,
          company_name: dbTenant.company_name,
          logo_url: dbTenant.logo_url,
          primary_color: dbTenant.primary_color,
          secondary_color: dbTenant.secondary_color,
          favicon_url: dbTenant.favicon_url,
          subscription_plan: dbTenant.subscription_plan,
          subscription_status: dbTenant.subscription_status,
          industry: dbTenant.industry,
        };

        // Sync metadata back to Supabase if they differ
        let metadataUpdated = false;
        const updatedMetadata = { ...user.user_metadata };
        if (updatedMetadata.tenant_id !== dbTenant.id) {
          updatedMetadata.tenant_id = dbTenant.id;
          metadataUpdated = true;
        }
        if (updatedMetadata.industry !== dbTenant.industry) {
          updatedMetadata.industry = dbTenant.industry;
          metadataUpdated = true;
        }

        if (metadataUpdated) {
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: updatedMetadata,
          });
        }
      }

      return {
        id: user.id,
        email: user.email || '',
        tenant_id: tenantId,
        role: isSuperAdmin ? 'super_admin' : (user.user_metadata?.role || 'tenant_admin'),
        name: user.user_metadata?.name || '',
        tenant,
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

  /**
   * Normalize mobile number to E.164 format.
   */
  normalizeMobileNumber(num: string): string {
    const digits = num.replace(/\D/g, '');
    if (!digits) return num;
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    return num.startsWith('+') ? `+${digits}` : `+${digits}`;
  }

  /**
   * Send OTP via MSG91 API
   */
  async sendMsg91Otp(mobile: string, otp: string): Promise<boolean> {
    const authKey = process.env.MSG91_AUTH_KEY || '';
    const templateId = process.env.MSG91_TEMPLATE_OTP || '';

    console.log(`[MSG91 Debug] MSG91_AUTH_KEY: ${authKey ? 'Loaded' : 'Missing'}, MSG91_TEMPLATE_OTP: ${templateId ? 'Loaded' : 'Missing'}`);

    if (!authKey) {
      logger.warn('MSG91 auth key not configured - skipping SMS OTP send');
      return false;
    }

    if (!templateId) {
      logger.warn('MSG91 OTP template ID not configured - skipping SMS OTP send');
      return false;
    }

    const cleanMobile = mobile.replace(/\D/g, ''); // e.g., 919881310261

    try {
      const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${cleanMobile}&authkey=${authKey}&otp=${otp}`;
      
      logger.info(`Sending SMS OTP via MSG91 to: ${cleanMobile}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ otp }),
      });

      const data = await response.json() as any;

      if (!response.ok || data.type === 'error') {
        logger.error('MSG91 SMS OTP sending failed', {
          mobile: cleanMobile,
          status: response.status,
          error: data,
        });
        return false;
      }

      logger.info('SMS OTP sent successfully via MSG91', {
        mobile: cleanMobile,
        response: data,
      });
      return true;
    } catch (error) {
      logger.error('MSG91 SMS OTP sending exception', {
        mobile: cleanMobile,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Verify OTP via MSG91 API (fallback)
   */
  async verifyMsg91Otp(mobile: string, otp: string): Promise<boolean> {
    const authKey = process.env.MSG91_AUTH_KEY || '';
    if (!authKey) return false;

    const cleanMobile = mobile.replace(/\D/g, '');
    const cleanOtp = otp.trim();

    try {
      const url = `https://control.msg91.com/api/v5/otp/verify?mobile=${cleanMobile}&otp=${cleanOtp}`;
      
      logger.info(`Verifying OTP via MSG91 API for: ${cleanMobile}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'authkey': authKey,
        },
      });

      const data = await response.json() as any;

      if (response.ok && (data.type === 'success' || data.message === 'number_verified_successfully')) {
        logger.info('OTP verified successfully via MSG91 API', { mobile: cleanMobile });
        return true;
      }

      logger.warn('MSG91 OTP verification failed', { mobile: cleanMobile, response: data });
      return false;
    } catch (error) {
      logger.error('MSG91 OTP verification exception', {
        mobile: cleanMobile,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Generate OTP and store it in memory for password recovery verification
   */
  async generateAndStoreOtp(identifier: string): Promise<{ otp: string; email: string; phone?: string; name: string }> {
    const identifierClean = identifier.trim();
    if (!identifierClean) {
      throw new AppError('Email or mobile number is required', 400, 'VALIDATION_ERROR');
    }

    const isEmail = identifierClean.includes('@');
    let queryFilter = '';

    if (isEmail) {
      queryFilter = `email.eq.${identifierClean.toLowerCase()}`;
    } else {
      const normalizedMobile = this.normalizeMobileNumber(identifierClean);
      const digits = normalizedMobile.replace(/\D/g, '');
      queryFilter = `phone.eq.${normalizedMobile},phone.eq.${digits}`;
      if (digits.startsWith('91') && digits.length === 12) {
        queryFilter += `,phone.eq.${digits.substring(2)}`;
      }
    }

    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .or(queryFilter);

    const tenant = tenants && tenants.length > 0 ? tenants[0] : null;

    if (tenantError || !tenant) {
      throw new AppError('No user account found with that email or mobile number', 404, 'USER_NOT_FOUND');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    const key = identifierClean.toLowerCase();
    const record = { otp, expiresAt, email: tenant.email };
    
    otpStore.set(key, record);
    otpStore.set(tenant.email.toLowerCase(), record);
    if (tenant.phone) {
      const phoneClean = tenant.phone.trim().toLowerCase();
      otpStore.set(phoneClean, record);
      const digitsOnly = phoneClean.replace(/\D/g, '');
      if (digitsOnly.length === 10) {
        otpStore.set(digitsOnly, record);
      } else if (digitsOnly.length === 12 && phoneClean.startsWith('+91')) {
        otpStore.set(digitsOnly.substring(2), record);
      } else if (digitsOnly.length === 12 && phoneClean.startsWith('91')) {
        otpStore.set(digitsOnly.substring(2), record);
      }
    }

    logger.info(`[Forgot Password OTP] Generated and stored OTP in service: ${otp} for identifier: ${identifierClean}`);
    return { otp, email: tenant.email, phone: tenant.phone || undefined, name: tenant.name || 'User' };
  }

  /**
   * Generate OTP and send via MSG91 SMS / Email for password recovery
   */
  async sendPasswordResetOtp(identifier: string): Promise<void> {
    console.log('Querying users table for:', identifier);
    const identifierClean = identifier.trim();
    if (!identifierClean) {
      throw new AppError('Email or mobile number is required', 400, 'VALIDATION_ERROR');
    }

    const isEmail = identifierClean.includes('@');
    let queryFilter = '';

    if (isEmail) {
      queryFilter = `email.eq.${identifierClean.toLowerCase()}`;
    } else {
      const normalizedMobile = this.normalizeMobileNumber(identifierClean);
      const digits = normalizedMobile.replace(/\D/g, '');
      queryFilter = `phone.eq.${normalizedMobile},phone.eq.${digits}`;
      if (digits.startsWith('91') && digits.length === 12) {
        queryFilter += `,phone.eq.${digits.substring(2)}`;
      }
    }

    console.log(`[Database Query Debug] Running query: supabase.from('tenants').select('*').or('${queryFilter}')`);
    logger.info(`[Database Query Debug] Running query on tenants: .or("${queryFilter}")`);

    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .or(queryFilter);

    const tenant = tenants && tenants.length > 0 ? tenants[0] : null;

    if (tenantError || !tenant) {
      console.log(`[Lookup Failure Query Debug] Lookup failed for identifier "${identifierClean}". Executed Query: supabase.from('tenants').select('*').or('${queryFilter}')`);
      if (tenantError) {
        console.error('Supabase tenants query error:', tenantError.message);
      }
      logger.warn('Forgot password request: Tenant not found', { identifier: identifierClean });
      throw new AppError('No user account found with that email or mobile number', 404, 'USER_NOT_FOUND');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    // Store the OTP keyed by multiple variants to make sure verify-otp always finds it
    const key = identifierClean.toLowerCase();
    const record = { otp, expiresAt, email: tenant.email };
    
    otpStore.set(key, record);
    otpStore.set(tenant.email.toLowerCase(), record);
    if (tenant.phone) {
      const phoneClean = tenant.phone.trim().toLowerCase();
      otpStore.set(phoneClean, record);
      // Also store plain digits only if it has a prefix
      const digitsOnly = phoneClean.replace(/\D/g, '');
      if (digitsOnly.length === 10) {
        otpStore.set(digitsOnly, record);
      } else if (digitsOnly.length === 12 && phoneClean.startsWith('+91')) {
        otpStore.set(digitsOnly.substring(2), record);
      } else if (digitsOnly.length === 12 && phoneClean.startsWith('91')) {
        otpStore.set(digitsOnly.substring(2), record);
      }
    }

    logger.info(`[Forgot Password OTP] Generated OTP: ${otp} for tenant email: ${tenant.email}`);

    // Send OTP via SMS if mobile number exists
    if (tenant.phone) {
      const sentSms = await this.sendMsg91Otp(tenant.phone, otp);
      if (!sentSms) {
        logger.warn('Failed to send OTP via MSG91 SMS, falling back to email only');
      }
    }

    // Also send OTP via email for maximum reliability and convenience
    try {
      await emailService.sendOtpEmail(tenant.email, otp, tenant.name || undefined);
    } catch (emailErr) {
      logger.error('Failed to send OTP email', { error: emailErr instanceof Error ? emailErr.message : 'Unknown' });
    }
  }

  /**
   * Verify OTP and return temporary reset token
   */
  async verifyOtp(identifier: string, otp: string): Promise<string> {
    const identifierClean = identifier.trim().toLowerCase();
    const otpClean = otp.trim();

    if (!identifierClean || !otpClean) {
      throw new AppError('Identifier and OTP are required', 400, 'VALIDATION_ERROR');
    }

    const isEmail = identifierClean.includes('@');
    const normalizedIdentifier = isEmail ? identifierClean : this.normalizeMobileNumber(identifierClean);
    const digitsOnly = identifierClean.replace(/\D/g, '');

    // 1. Validate against the in-memory cache
    let record = otpStore.get(identifierClean) || otpStore.get(normalizedIdentifier);
    if (!record && digitsOnly) {
      record = otpStore.get(digitsOnly);
      if (!record && digitsOnly.startsWith('91') && digitsOnly.length === 12) {
        record = otpStore.get(digitsOnly.substring(2));
      }
    }

    let isVerified = false;
    let targetEmail = '';

    if (record) {
      if (Date.now() <= record.expiresAt && String(record.otp) === String(otpClean)) {
        isVerified = true;
        targetEmail = record.email;
        // Delete OTP from memory immediately upon success
        otpStore.delete(identifierClean);
        otpStore.delete(normalizedIdentifier);
        otpStore.delete(record.email.toLowerCase());
        if (digitsOnly) otpStore.delete(digitsOnly);
      }
    }

    // 2. If in-memory check fails, fall back to MSG91 API verification
    if (!isVerified) {
      console.log('Available keys in otpStore:', Array.from(otpStore.keys()));
      logger.info(`In-memory OTP check failed for identifier "${identifierClean}". Trying MSG91 verification fallback...`);
      
      const msg91Identifier = isEmail ? identifierClean : normalizedIdentifier;
      console.log(`[MSG91 Verify Debug] Final normalizedIdentifier for MSG91: "${msg91Identifier}"`);
      logger.info(`Final normalizedIdentifier for MSG91: ${msg91Identifier}`);

      const msg91Verified = await this.verifyMsg91Otp(msg91Identifier, otpClean);
      if (msg91Verified) {
        // Retrieve tenant to get email
        let queryFilter = '';
        if (isEmail) {
          queryFilter = `email.eq.${identifierClean}`;
        } else {
          const digits = msg91Identifier.replace(/\D/g, '');
          queryFilter = `phone.eq.${msg91Identifier},phone.eq.${digits}`;
          if (digits.startsWith('91') && digits.length === 12) {
            queryFilter += `,phone.eq.${digits.substring(2)}`;
          }
        }

        const { data: tenants } = await supabaseAdmin
          .from('tenants')
          .select('email')
          .or(queryFilter);

        if (tenants && tenants.length > 0) {
          isVerified = true;
          targetEmail = tenants[0].email;
        }
      }
    }

    if (!isVerified) {
      console.log(`[Verify OTP Error] OTP verification failed for identifier: ${identifierClean}`);
      throw new AppError('Invalid or expired OTP. Please try again.', 400, 'INVALID_OTP');
    }

    // Generate a temporary reset token (UUID)
    const resetToken = crypto.randomUUID();
    const tokenExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity

    resetTokenStore.set(resetToken, { email: targetEmail, expiresAt: tokenExpiresAt });

    logger.info(`[Forgot Password OTP] OTP verified. Generated reset token for: ${targetEmail}`);

    return resetToken;
  }

  /**
   * Reset password using temporary reset token
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    if (!resetToken || !newPassword) {
      throw new AppError('Reset token and new password are required', 400, 'VALIDATION_ERROR');
    }

    if (newPassword.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400, 'VALIDATION_ERROR');
    }

    const record = resetTokenStore.get(resetToken);
    if (!record) {
      throw new AppError('Invalid or expired reset token. Please start the forgot password flow again.', 400, 'INVALID_TOKEN');
    }

    if (Date.now() > record.expiresAt) {
      resetTokenStore.delete(resetToken);
      throw new AppError('Reset token has expired. Please request a new OTP.', 400, 'TOKEN_EXPIRED');
    }

    // Find user in Supabase Auth by email
    const { data: usersData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError || !usersData?.users) {
      logger.error('Failed to list users from Supabase Auth', { error: authError?.message });
      throw new AppError('Failed to reset password. Please try again.', 500, 'RESET_FAILED');
    }

    const authUser = usersData.users.find(u => u.email === record.email);
    if (!authUser) {
      logger.error('Auth user not found during password reset', { email: record.email });
      throw new AppError('User account not found', 404, 'USER_NOT_FOUND');
    }

    // Update password using the Supabase Admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });

    if (updateError) {
      logger.error('Failed to update password in Supabase Auth', { userId: authUser.id, error: updateError.message });
      throw new AppError('Failed to reset password. Please try again.', 500, 'RESET_FAILED');
    }

    // Remove (invalidate) the reset token after successful reset
    resetTokenStore.delete(resetToken);

    logger.info(`[Forgot Password OTP] Password reset successful for user: ${record.email}`);
  }
}

export const authService = new AuthService();
