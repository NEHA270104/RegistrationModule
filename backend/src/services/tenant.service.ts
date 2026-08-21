import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  favicon_url: string | null;
  subscription_plan: string;
  subscription_status: string;
  trial_ends_at: string | null;
  is_rebranded: boolean;
  rebrand_approved_at: string | null;
  rebrand_fee_paid: boolean;
  referral_code: string | null;
  referred_by_tenant_id: string | null;
  api_key_hash: string | null;
  custom_domain: string | null;
  domain_verified: boolean;
  // Churn columns (Phase 4)
  cancellation_requested_at: string | null;
  cancellation_effective_at: string | null;
  data_deletion_scheduled_at: string | null;
  churn_reason: string | null;
  churn_feedback: string | null;
  // Domain verification columns (Phase 4)
  domain_verification_token: string | null;
  domain_verified_at: string | null;
  ssl_provisioned: boolean;
  is_active: boolean;
  industry: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  email: string;
  phone?: string;
  company_name?: string;
  referral_code?: string;
  referred_by_tenant_id?: string;
  industry?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  favicon_url?: string;
  custom_domain?: string;
  is_active?: boolean;
  industry?: string;
}

export class TenantService {
  async create(data: CreateTenantRequest): Promise<Tenant> {
    try {
      // Generate a unique referral code
      const generatedReferralCode = this.generateReferralCode();

      const insertPayload = {
        name: data.name,
        slug: data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        company_name: data.company_name || null,
        referral_code: generatedReferralCode,
        referred_by_tenant_id: data.referred_by_tenant_id || null,
        industry: data.industry || null,
      };

      console.log('Inserting tenant payload into database:', JSON.stringify(insertPayload, null, 2));

      const { data: tenant, error } = await supabase
        .from('tenants')
        .insert(insertPayload as any)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError('A tenant with this slug already exists', 409, 'SLUG_TAKEN');
        }
        logger.error('Error creating tenant', { error: error.message });
        throw new AppError('Failed to create tenant', 500, 'TENANT_CREATE_ERROR');
      }

      logger.info('Tenant created', { id: tenant.id, slug: tenant.slug });
      return tenant as Tenant;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in createTenant', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        logger.error('Error fetching tenant by slug', { slug, error: error.message });
        throw new AppError('Failed to fetch tenant', 500, 'TENANT_FETCH_ERROR');
      }

      return data as Tenant;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  async getById(id: string): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        logger.error('Error fetching tenant by id', { id, error: error.message });
        throw new AppError('Failed to fetch tenant', 500, 'TENANT_FETCH_ERROR');
      }

      return data as Tenant;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  async update(id: string, data: UpdateTenantRequest): Promise<Tenant> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email.toLowerCase();
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.company_name !== undefined) updateData.company_name = data.company_name;
      if (data.logo_url !== undefined) updateData.logo_url = data.logo_url;
      if (data.primary_color !== undefined) updateData.primary_color = data.primary_color;
      if (data.secondary_color !== undefined) updateData.secondary_color = data.secondary_color;
      if (data.favicon_url !== undefined) updateData.favicon_url = data.favicon_url;
      if (data.custom_domain !== undefined) updateData.custom_domain = data.custom_domain;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.industry !== undefined) updateData.industry = data.industry;

      const { data: tenant, error } = await supabase
        .from('tenants')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating tenant', { id, error: error.message });
        throw new AppError('Failed to update tenant', 500, 'TENANT_UPDATE_ERROR');
      }

      logger.info('Tenant updated', { id });
      return tenant as Tenant;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  async list(filters?: {
    is_active?: boolean;
    subscription_plan?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ tenants: Tenant[]; total: number }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('tenants')
        .select('*', { count: 'exact' });

      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }
      if (filters?.subscription_plan) {
        query = query.eq('subscription_plan', filters.subscription_plan);
      }
      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`
        );
      }

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error listing tenants', { error: error.message });
        throw new AppError('Failed to list tenants', 500, 'TENANT_LIST_ERROR');
      }

      return { tenants: (data || []) as Tenant[], total: count || 0 };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  async activate(id: string): Promise<Tenant> {
    return this.update(id, { is_active: true });
  }

  async deactivate(id: string): Promise<Tenant> {
    return this.update(id, { is_active: false });
  }

  async getByReferralCode(code: string): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('referral_code', code)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        return null;
      }

      return data as Tenant;
    } catch {
      return null;
    }
  }

  async getPublicConfig(slug: string): Promise<{
    name: string;
    slug: string;
    company_name: string | null;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    favicon_url: string | null;
  } | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('name, slug, company_name, logo_url, primary_color, secondary_color, favicon_url')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'REF-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export const tenantService = new TenantService();
