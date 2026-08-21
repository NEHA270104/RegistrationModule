import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';

export interface AuditEntry {
  tenant_id?: string;
  actor_id?: string;
  actor_role?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditFilters {
  action?: string;
  resource_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class AuditService {
  /**
   * Log an audit entry — fire-and-forget, never throws
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await supabaseAdmin
        .from('audit_log')
        .insert({
          tenant_id: entry.tenant_id || null,
          actor_id: entry.actor_id || null,
          actor_role: entry.actor_role || 'system',
          action: entry.action,
          resource_type: entry.resource_type,
          resource_id: entry.resource_id || null,
          ip_address: entry.ip_address || null,
          user_agent: entry.user_agent || null,
          metadata: entry.metadata || {},
        });
    } catch (err) {
      logger.error('Audit log failed', {
        error: err instanceof Error ? err.message : 'Unknown',
        action: entry.action,
        resource_type: entry.resource_type,
      });
    }
  }

  /**
   * Get audit entries for a specific tenant (tenant dashboard activity log)
   */
  async getByTenant(
    tenantId: string,
    filters: AuditFilters = {}
  ): Promise<{ entries: Record<string, unknown>[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.resource_type) {
      query = query.eq('resource_type', filters.resource_type);
    }
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error('Error fetching tenant audit log', { tenantId, error: error.message });
      return { entries: [], total: 0 };
    }

    return { entries: data || [], total: count || 0 };
  }

  /**
   * Get all audit entries (super admin)
   */
  async getGlobal(
    filters: AuditFilters = {}
  ): Promise<{ entries: Record<string, unknown>[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('audit_log')
      .select('*, tenants:tenant_id(name, slug)', { count: 'exact' });

    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.resource_type) {
      query = query.eq('resource_type', filters.resource_type);
    }
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error('Error fetching global audit log', { error: error.message });
      return { entries: [], total: 0 };
    }

    return { entries: data || [], total: count || 0 };
  }
}

export const auditService = new AuditService();
