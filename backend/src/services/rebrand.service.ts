import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { tenantService } from './tenant.service.js';

export interface RebrandRequest {
  id: string;
  tenant_id: string;
  requested_brand_name: string;
  requested_logo_url: string | null;
  requested_primary_color: string | null;
  requested_secondary_color: string | null;
  requested_favicon_url: string | null;
  requested_domain: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  setup_fee: number;
  setup_fee_paid: boolean;
  setup_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RebrandRequestData {
  requested_brand_name: string;
  requested_logo_url?: string;
  requested_primary_color?: string;
  requested_secondary_color?: string;
  requested_favicon_url?: string;
  requested_domain?: string;
}

export class RebrandService {
  async submitRequest(tenantId: string, data: RebrandRequestData): Promise<RebrandRequest> {
    // Check no pending/approved request exists
    const { data: existing } = await supabase
      .from('rebrand_requests')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (existing && existing.length > 0) {
      throw new AppError(
        'You already have a pending or approved rebrand request',
        409,
        'REBRAND_REQUEST_EXISTS'
      );
    }

    const { data: request, error } = await supabaseAdmin
      .from('rebrand_requests')
      .insert({
        tenant_id: tenantId,
        requested_brand_name: data.requested_brand_name,
        requested_logo_url: data.requested_logo_url || null,
        requested_primary_color: data.requested_primary_color || null,
        requested_secondary_color: data.requested_secondary_color || null,
        requested_favicon_url: data.requested_favicon_url || null,
        requested_domain: data.requested_domain || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating rebrand request', { error: error.message });
      throw new AppError('Failed to submit rebrand request', 500, 'REBRAND_SUBMIT_ERROR');
    }

    // Create admin notification
    await this.createNotification(
      'rebrand_request',
      'New Rebrand Request',
      `Tenant requested rebranding to "${data.requested_brand_name}"`,
      tenantId,
      request.id
    );

    logger.info('Rebrand request submitted', { tenantId, requestId: request.id });
    return request as RebrandRequest;
  }

  async approveRequest(requestId: string, adminId: string, notes?: string): Promise<RebrandRequest> {
    const { data: request, error } = await supabaseAdmin
      .from('rebrand_requests')
      .update({
        status: 'approved',
        admin_notes: notes || null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      logger.error('Error approving rebrand request', { error: error.message });
      throw new AppError('Failed to approve rebrand request', 500, 'REBRAND_APPROVE_ERROR');
    }

    logger.info('Rebrand request approved', { requestId, adminId });
    return request as RebrandRequest;
  }

  async rejectRequest(requestId: string, adminId: string, notes: string): Promise<RebrandRequest> {
    if (!notes) {
      throw new AppError('Rejection reason is required', 400, 'NOTES_REQUIRED');
    }

    const { data: request, error } = await supabaseAdmin
      .from('rebrand_requests')
      .update({
        status: 'rejected',
        admin_notes: notes,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      logger.error('Error rejecting rebrand request', { error: error.message });
      throw new AppError('Failed to reject rebrand request', 500, 'REBRAND_REJECT_ERROR');
    }

    logger.info('Rebrand request rejected', { requestId, adminId });
    return request as RebrandRequest;
  }

  async handleSetupPayment(requestId: string, paymentId: string): Promise<RebrandRequest> {
    // Fetch the request
    const { data: existing } = await supabaseAdmin
      .from('rebrand_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'approved')
      .single();

    if (!existing) {
      throw new AppError('Rebrand request not found or not approved', 404, 'REBRAND_NOT_FOUND');
    }

    // Update request as paid
    const { data: request, error } = await supabaseAdmin
      .from('rebrand_requests')
      .update({
        setup_fee_paid: true,
        setup_payment_id: paymentId,
        paid_at: new Date().toISOString(),
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating rebrand payment', { error: error.message });
      throw new AppError('Failed to process rebrand payment', 500, 'REBRAND_PAYMENT_ERROR');
    }

    // Apply branding to tenant
    await supabaseAdmin
      .from('tenants')
      .update({
        name: existing.requested_brand_name,
        logo_url: existing.requested_logo_url,
        primary_color: existing.requested_primary_color || '#6366F1',
        secondary_color: existing.requested_secondary_color || '#8B5CF6',
        favicon_url: existing.requested_favicon_url,
        custom_domain: existing.requested_domain,
        is_rebranded: true,
        rebrand_approved_at: new Date().toISOString(),
        rebrand_fee_paid: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.tenant_id);

    // Notify admin
    await this.createNotification(
      'rebrand_request',
      'Rebrand Payment Completed',
      `Tenant paid setup fee for "${existing.requested_brand_name}" rebrand`,
      existing.tenant_id,
      requestId
    );

    logger.info('Rebrand payment processed and branding applied', {
      requestId,
      tenantId: existing.tenant_id,
    });

    return request as RebrandRequest;
  }

  async getRequestsByTenant(tenantId: string): Promise<RebrandRequest[]> {
    const { data, error } = await supabase
      .from('rebrand_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching rebrand requests', { error: error.message });
      throw new AppError('Failed to fetch rebrand requests', 500, 'REBRAND_FETCH_ERROR');
    }

    return (data || []) as RebrandRequest[];
  }

  async getPendingRequests(): Promise<(RebrandRequest & { tenant_name?: string })[]> {
    const { data, error } = await supabaseAdmin
      .from('rebrand_requests')
      .select('*, tenants(name, slug, email)')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching pending rebrand requests', { error: error.message });
      throw new AppError('Failed to fetch pending requests', 500, 'REBRAND_FETCH_ERROR');
    }

    return (data || []).map((r: Record<string, unknown>) => {
      const tenant = r.tenants as { name?: string; slug?: string; email?: string } | null;
      return {
        ...r,
        tenant_name: tenant?.name || '',
        tenant_slug: tenant?.slug || '',
        tenant_email: tenant?.email || '',
      };
    }) as unknown as (RebrandRequest & { tenant_name?: string })[];
  }

  async getAllRequests(filters?: { status?: string; page?: number; limit?: number }): Promise<{
    requests: RebrandRequest[];
    total: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('rebrand_requests')
      .select('*, tenants(name, slug, email)', { count: 'exact' });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Error fetching all rebrand requests', { error: error.message });
      throw new AppError('Failed to fetch rebrand requests', 500, 'REBRAND_FETCH_ERROR');
    }

    return { requests: (data || []) as RebrandRequest[], total: count || 0 };
  }

  // --- Notification helpers ---

  async createNotification(
    type: string,
    title: string,
    message: string,
    tenantId: string | null,
    referenceId?: string
  ): Promise<void> {
    try {
      await supabaseAdmin.from('admin_notifications').insert({
        type,
        title,
        message,
        tenant_id: tenantId,
        reference_id: referenceId || null,
      });
    } catch (err) {
      logger.warn('Failed to create admin notification', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  async getUnreadNotificationCount(): Promise<number> {
    const { count } = await supabaseAdmin
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    return count || 0;
  }

  async getNotifications(limit = 50): Promise<Record<string, unknown>[]> {
    const { data } = await supabaseAdmin
      .from('admin_notifications')
      .select('*, tenants(slug, name, company_name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await supabaseAdmin
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  }

  async markAllNotificationsRead(): Promise<void> {
    await supabaseAdmin
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('is_read', false);
  }
}

export const rebrandService = new RebrandService();
