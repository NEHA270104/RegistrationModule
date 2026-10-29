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
      const isUuid = (val?: string) =>
        val ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) : false;

      await supabaseAdmin
        .from('admin_activity_log')
        .insert({
          action: entry.action,
          admin_identifier: entry.actor_id || entry.actor_role || entry.tenant_id || 'system',
          entity_type: entry.resource_type,
          entity_id: isUuid(entry.resource_id) ? entry.resource_id : null,
          new_value: {
            ...(entry.metadata || {}),
            resource_id: entry.resource_id,
            tenant_id: entry.tenant_id,
            user_agent: entry.user_agent,
            actor_role: entry.actor_role,
          },
          ip_address: entry.ip_address || null,
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

    try {
      let query = supabaseAdmin
        .from('admin_activity_log')
        .select('*', { count: 'exact' });

      if (filters.action) {
        query = query.ilike('action', `%${filters.action}%`);
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

      const filtered = (data || []).filter((entry: any) => {
        if (!entry.new_value && !entry.admin_identifier) return true;
        const entryTenant = entry.new_value?.tenant_id || entry.tenant_id;
        return !entryTenant || entryTenant === tenantId || entryTenant === '00000000-0000-0000-0000-000000000001';
      });

      return { entries: filtered, total: count || filtered.length };
    } catch (err: any) {
      logger.error('Tenant audit query failed', { message: err?.message });
      return { entries: [], total: 0 };
    }
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

    try {
      let query = supabaseAdmin
        .from('admin_activity_log')
        .select('*', { count: 'exact' });

      if (filters.action) {
        query = query.ilike('action', `%${filters.action}%`);
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
    } catch (err: any) {
      logger.error('Global audit query failed', { message: err?.message });
      return { entries: [], total: 0 };
    }
  }
}

export const auditService = new AuditService();
