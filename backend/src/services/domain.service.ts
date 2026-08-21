import dns from 'dns/promises';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { config } from '../config/index.js';

const PLATFORM_DOMAIN = config.frontendUrl
  ? new URL(config.frontendUrl).hostname
  : 'app.brtneura.com';

export interface DomainSetupInfo {
  domain: string;
  verification_token: string;
  cname_target: string;
  instructions: {
    cname: { type: string; name: string; value: string };
    txt: { type: string; name: string; value: string };
  };
}

export interface DomainStatus {
  custom_domain: string | null;
  domain_verified: boolean;
  domain_verified_at: string | null;
  ssl_provisioned: boolean;
  verification_token: string | null;
}

export class DomainService {
  /**
   * Set a custom domain for a tenant — generates verification token
   */
  async setCustomDomain(tenantId: string, domain: string): Promise<DomainSetupInfo> {
    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    if (!domainRegex.test(domain)) {
      throw new AppError('Invalid domain format', 400, 'INVALID_DOMAIN');
    }

    // Check domain not already in use by another tenant
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('custom_domain', domain)
      .neq('id', tenantId)
      .limit(1);

    if (existing && existing.length > 0) {
      throw new AppError('This domain is already in use by another tenant', 409, 'DOMAIN_TAKEN');
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Update tenant record
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        custom_domain: domain,
        domain_verified: false,
        domain_verified_at: null,
        domain_verification_token: verificationToken,
        ssl_provisioned: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      logger.error('Error setting custom domain', { error: error.message });
      throw new AppError('Failed to set custom domain', 500, 'DOMAIN_SET_ERROR');
    }

    const cnameTarget = PLATFORM_DOMAIN;

    return {
      domain,
      verification_token: verificationToken,
      cname_target: cnameTarget,
      instructions: {
        cname: {
          type: 'CNAME',
          name: domain.split('.')[0],
          value: cnameTarget,
        },
        txt: {
          type: 'TXT',
          name: `_brtneura-verify.${domain}`,
          value: verificationToken,
        },
      },
    };
  }

  /**
   * Verify DNS records for a tenant's custom domain
   */
  async verifyDomain(tenantId: string): Promise<{ verified: boolean; errors: string[] }> {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('custom_domain, domain_verification_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.custom_domain) {
      throw new AppError('No custom domain set', 400, 'NO_DOMAIN');
    }

    const domain = tenant.custom_domain;
    const token = tenant.domain_verification_token;
    const errors: string[] = [];

    // Check CNAME record
    try {
      const cnameRecords = await dns.resolveCname(domain);
      const hasValidCname = cnameRecords.some(
        (record: string) => record.includes(PLATFORM_DOMAIN) || record.includes('brtneura')
      );
      if (!hasValidCname) {
        errors.push(`CNAME record found but not pointing to ${PLATFORM_DOMAIN}`);
      }
    } catch {
      errors.push('CNAME record not found — please add a CNAME record pointing to ' + PLATFORM_DOMAIN);
    }

    // Check TXT verification record
    if (token) {
      try {
        const txtRecords = await dns.resolveTxt(`_brtneura-verify.${domain}`);
        const flatRecords = txtRecords.flat();
        if (!flatRecords.includes(token)) {
          errors.push('TXT verification record found but does not match expected value');
        }
      } catch {
        errors.push(`TXT record not found — please add a TXT record for _brtneura-verify.${domain}`);
      }
    }

    if (errors.length === 0) {
      // Mark domain as verified
      await supabaseAdmin
        .from('tenants')
        .update({
          domain_verified: true,
          domain_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      // Trigger SSL provisioning
      await this.provisionSSL(tenantId);

      logger.info('Domain verified', { tenantId, domain });
    }

    return { verified: errors.length === 0, errors };
  }

  /**
   * Provision SSL for a verified domain (placeholder — implement with your infrastructure)
   */
  async provisionSSL(tenantId: string): Promise<void> {
    // In production, this would call:
    // - Cloudflare API to add custom hostname
    // - gcloud run domain-mappings create
    // - certbot for Let's Encrypt

    await supabaseAdmin
      .from('tenants')
      .update({
        ssl_provisioned: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    logger.info('SSL provisioned (placeholder)', { tenantId });
  }

  /**
   * Get domain status for a tenant
   */
  async getDomainStatus(tenantId: string): Promise<DomainStatus> {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('custom_domain, domain_verified, domain_verified_at, ssl_provisioned, domain_verification_token')
      .eq('id', tenantId)
      .single();

    return {
      custom_domain: data?.custom_domain || null,
      domain_verified: data?.domain_verified || false,
      domain_verified_at: data?.domain_verified_at || null,
      ssl_provisioned: data?.ssl_provisioned || false,
      verification_token: data?.domain_verification_token || null,
    };
  }

  /**
   * Lookup tenant by custom domain (used by domain routing middleware)
   */
  async getByDomain(hostname: string): Promise<{ slug: string } | null> {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('slug')
      .eq('custom_domain', hostname)
      .eq('domain_verified', true)
      .eq('is_active', true)
      .single();

    return data || null;
  }
}

export const domainService = new DomainService();
