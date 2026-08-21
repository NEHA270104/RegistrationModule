import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { tenantService } from './tenant.service.js';
import { authService } from './auth.service.js';
import { subscriptionService } from './subscription.service.js';
import { referralService } from './referral.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import crypto from 'crypto';

export interface ProvisionRequest {
  org_id: string;
  org_name: string;
  user_email: string;
  user_name: string;
  plan?: string;
  billing_cycle?: string;
  referral_code?: string;
}

export interface ProvisionResult {
  tenant_id: string;
  tenant_slug: string;
  dashboard_url: string;
  registration_form_url: string;
  subscription: Record<string, unknown> | null;
}

class ProvisionService {
  async provision(data: ProvisionRequest): Promise<ProvisionResult> {
    const plan = data.plan || 'trial';

    // Check if tenant already exists for this org
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id, slug')
      .eq('agent_studio_org_id', data.org_id)
      .single();

    if (existingTenant) {
      throw new AppError(
        'A tenant already exists for this organization',
        409,
        'TENANT_ALREADY_EXISTS'
      );
    }

    // Generate slug
    const slug = this.generateSlug(data.org_name);

    // 1. Create tenant
    const tenant = await tenantService.create({
      name: data.user_name,
      slug,
      email: data.user_email,
      company_name: data.org_name,
    });

    try {
      // Set agent_studio columns
      await supabaseAdmin
        .from('tenants')
        .update({
          agent_studio_org_id: data.org_id,
          subscription_plan: plan,
        })
        .eq('id', tenant.id);

      // 2. Create auth user
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const { error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.user_email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          tenant_id: tenant.id,
          role: 'tenant_admin',
          name: data.user_name,
          company_name: data.org_name,
          sso_provider: 'agent_studio',
        },
      });

      if (authError) {
        logger.error('Provision: auth user creation failed', { error: authError.message });
        throw new AppError('Failed to create auth user', 500, 'PROVISION_AUTH_ERROR');
      }

      // 3. Initialize default seat inventory
      await this.initializeDefaults(tenant.id);

      // 4. Process referral
      if (data.referral_code) {
        await referralService.processReferral(data.referral_code, tenant.id);
      }

      // 5. Create subscription (if not trial)
      let subscription: Record<string, unknown> | null = null;
      if (plan !== 'trial') {
        const billingCycle = data.billing_cycle || 'monthly';
        const result = await subscriptionService.createSubscription(tenant.id, plan, billingCycle);
        subscription = result.subscription as unknown as Record<string, unknown>;
      }

      const baseUrl = process.env.API_BASE_URL || 'https://app.brtneura.com';

      logger.info('Tenant provisioned via Agent Studio', {
        tenantId: tenant.id,
        orgId: data.org_id,
        plan,
      });

      return {
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        dashboard_url: `${baseUrl}/dashboard/${tenant.slug}`,
        registration_form_url: `${baseUrl}/t/${tenant.slug}`,
        subscription,
      };
    } catch (error) {
      // Cleanup on failure
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      if (error instanceof AppError) throw error;
      logger.error('Provision failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new AppError('Provisioning failed', 500, 'PROVISION_ERROR');
    }
  }

  /**
   * Initialize default settings for a newly provisioned tenant.
   */
  private async initializeDefaults(tenantId: string): Promise<void> {
    // Create default 3-tier seat inventory
    const defaultTiers = [
      {
        tenant_id: tenantId,
        tier_name: 'vip',
        display_name: 'VIP',
        total_seats: 50,
        sold_seats: 0,
        held_seats: 0,
        price_inr: 249900,
        is_active: true,
        description: 'VIP access with premium benefits',
        benefits: ['Front row seating', 'Networking lunch', 'Certificate of participation', 'Event recording access'],
        sort_order: 1,
      },
      {
        tenant_id: tenantId,
        tier_name: 'standard',
        display_name: 'Standard',
        total_seats: 100,
        sold_seats: 0,
        held_seats: 0,
        price_inr: 149900,
        is_active: true,
        description: 'Standard access with core benefits',
        benefits: ['General seating', 'Certificate of participation', 'Event recording access'],
        sort_order: 2,
      },
      {
        tenant_id: tenantId,
        tier_name: 'basic',
        display_name: 'Basic',
        total_seats: 200,
        sold_seats: 0,
        held_seats: 0,
        price_inr: 99900,
        is_active: true,
        description: 'Basic access',
        benefits: ['General seating', 'Certificate of participation'],
        sort_order: 3,
      },
    ];

    await supabaseAdmin.from('seat_inventory').insert(defaultTiers);

    // Create default site_settings
    const defaultSettings = [
      { tenant_id: tenantId, key: 'event_name', value: 'My Event', category: 'event' },
      { tenant_id: tenantId, key: 'event_date', value: 'TBD', category: 'event' },
      { tenant_id: tenantId, key: 'event_venue', value: 'TBD', category: 'event' },
      { tenant_id: tenantId, key: 'support_email', value: '', category: 'contact' },
    ];

    await supabaseAdmin.from('site_settings').insert(defaultSettings);

    logger.info('Default settings initialized', { tenantId });
  }

  private generateSlug(name: string): string {
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const suffix = crypto.randomBytes(3).toString('hex');
    return `${slug}-${suffix}`;
  }
}

export const provisionService = new ProvisionService();
