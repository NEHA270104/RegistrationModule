import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface EmailTemplate {
  id: string;
  tenant_id: string | null;
  template_type: string;
  subject: string;
  html_body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const VALID_TEMPLATE_TYPES = [
  'welcome',
  'registration_confirmation',
  'payment_receipt',
  'subscription_invoice',
  'trial_expiring',
  'subscription_cancelled',
];

export class EmailTemplateService {
  /**
   * Get rendered email for a tenant + template type.
   * Falls back to default (tenant_id = NULL) template if no custom one exists.
   */
  async getRenderedEmail(
    tenantId: string | null,
    templateType: string,
    variables: Record<string, string>
  ): Promise<{ subject: string; html: string } | null> {
    let template: EmailTemplate | null = null;

    // Try tenant-specific template first
    if (tenantId) {
      const { data } = await supabase
        .from('email_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('template_type', templateType)
        .eq('is_active', true)
        .single();

      template = data as EmailTemplate | null;
    }

    // Fall back to default
    if (!template) {
      const { data } = await supabaseAdmin
        .from('email_templates')
        .select('*')
        .is('tenant_id', null)
        .eq('template_type', templateType)
        .eq('is_active', true)
        .single();

      template = data as EmailTemplate | null;
    }

    if (!template) return null;

    const subject = this.replaceVariables(template.subject, variables);
    const html = this.replaceVariables(template.html_body, variables);

    return { subject, html };
  }

  /**
   * Replace {{variable}} placeholders in a template string.
   */
  private replaceVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (variables[key] !== undefined) return variables[key];
      
      const keyLower = key.toLowerCase();
      const mappings: Record<string, string> = {
        company_name: 'tenant_name',
        guest_name: 'attendee_name',
      };
      const mappedKey = mappings[keyLower] || keyLower;
      if (variables[mappedKey] !== undefined) return variables[mappedKey];
      
      const foundKey = Object.keys(variables).find(k => k.toLowerCase() === keyLower);
      if (foundKey) return variables[foundKey];
      
      return match;
    });
  }

  /**
   * Preview a template with sample data.
   */
  async previewTemplate(tenantId: string, templateType: string): Promise<{ subject: string; html: string } | null> {
    const sampleVars: Record<string, string> = {
      tenant_name: 'Sample Event Co',
      tenant_logo_url: '',
      primary_color: '#6366F1',
      secondary_color: '#8B5CF6',
      event_name: 'AI for MSME Summit 2026',
      event_date: 'Feb 21, 2026',
      event_venue: 'CPR, Pune',
      support_email: 'support@example.com',
      registration_url: 'https://example.com/register',
      attendee_name: 'John Doe',
      attendee_email: 'john@example.com',
      tier_name: 'VIP Pass',
      amount: '2,499',
      payment_id: 'pay_sample123',
      qr_code_url: '',
      month: 'March 2026',
    };

    return this.getRenderedEmail(tenantId, templateType, sampleVars);
  }

  /**
   * List all templates for a tenant (including defaults).
   */
  async listTemplates(tenantId: string): Promise<EmailTemplate[]> {
    // Get tenant-specific templates
    const { data: customTemplates } = await supabase
      .from('email_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('template_type');

    // Get default templates
    const { data: defaultTemplates } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .is('tenant_id', null)
      .order('template_type');

    // Merge: custom overrides default
    const customMap = new Map((customTemplates || []).map((t) => [t.template_type, t]));
    const merged = (defaultTemplates || []).map((dt) => {
      const custom = customMap.get(dt.template_type);
      return custom ? { ...custom, is_default: false } : { ...dt, is_default: true };
    });

    return merged as EmailTemplate[];
  }

  /**
   * Create or update a tenant-specific email template (ScaleUp Pro only).
   */
  async upsertTemplate(
    tenantId: string,
    templateType: string,
    subject: string,
    htmlBody: string
  ): Promise<EmailTemplate> {
    if (!VALID_TEMPLATE_TYPES.includes(templateType)) {
      throw new AppError('Invalid template type', 400, 'INVALID_TEMPLATE_TYPE');
    }

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .upsert(
        {
          tenant_id: tenantId,
          template_type: templateType,
          subject,
          html_body: htmlBody,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,template_type' }
      )
      .select()
      .single();

    if (error) {
      logger.error('Error upserting email template', { error: error.message });
      throw new AppError('Failed to save email template', 500, 'TEMPLATE_SAVE_ERROR');
    }

    return data as EmailTemplate;
  }

  /**
   * Reset a template to default (delete tenant-specific version).
   */
  async resetToDefault(tenantId: string, templateType: string): Promise<void> {
    await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('template_type', templateType);
  }
}

export const emailTemplateService = new EmailTemplateService();
