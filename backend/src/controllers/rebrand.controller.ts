import { Response } from 'express';
import { rebrandService } from '../services/rebrand.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

// ============================================
// Tenant endpoints
// ============================================

export async function submitRebrandRequest(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const {
    requested_brand_name,
    requested_logo_url,
    requested_primary_color,
    requested_secondary_color,
    requested_favicon_url,
    requested_domain,
  } = req.body;

  if (!requested_brand_name) {
    res.status(400).json({ success: false, error: { message: 'Brand name is required' } });
    return;
  }

  const request = await rebrandService.submitRequest(tenantId, {
    requested_brand_name,
    requested_logo_url,
    requested_primary_color,
    requested_secondary_color,
    requested_favicon_url,
    requested_domain,
  });

  res.status(201).json({ success: true, data: request });
}

export async function getMyRebrandRequests(req: TenantRequest, res: Response): Promise<void> {
  try {
    const requests = await rebrandService.getRequestsByTenant(req.tenantId!);
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching rebrand requests from database:', error);
    res.json({ success: true, data: {} });
  }
}

export async function payRebrandSetupFee(req: TenantRequest, res: Response): Promise<void> {
  const { requestId } = req.params;
  const { payment_id } = req.body;

  if (!payment_id) {
    res.status(400).json({ success: false, error: { message: 'Payment ID is required' } });
    return;
  }

  const request = await rebrandService.handleSetupPayment(requestId, payment_id);
  res.json({ success: true, data: request });
}

// ============================================
// Super admin endpoints
// ============================================

export async function getPendingRebrandRequests(req: TenantRequest, res: Response): Promise<void> {
  const requests = await rebrandService.getPendingRequests();
  res.json({ success: true, data: requests });
}

export async function getAllRebrandRequests(req: TenantRequest, res: Response): Promise<void> {
  const { status, page, limit } = req.query;
  const result = await rebrandService.getAllRequests({
    status: status as string,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  res.json({ success: true, data: result.requests, total: result.total });
}

export async function approveRebrandRequest(req: TenantRequest, res: Response): Promise<void> {
  const { requestId } = req.params;
  const { notes } = req.body;
  const request = await rebrandService.approveRequest(requestId, req.userId!, notes);
  res.json({ success: true, data: request });
}

export async function rejectRebrandRequest(req: TenantRequest, res: Response): Promise<void> {
  const { requestId } = req.params;
  const { notes } = req.body;
  const request = await rebrandService.rejectRequest(requestId, req.userId!, notes);
  res.json({ success: true, data: request });
}

// ============================================
// Notification endpoints (super admin)
// ============================================

export async function getNotifications(req: TenantRequest, res: Response): Promise<void> {
  const notifications = await rebrandService.getNotifications();
  const unreadCount = await rebrandService.getUnreadNotificationCount();
  res.json({ success: true, data: { notifications, unread_count: unreadCount } });
}

export async function markNotificationRead(req: TenantRequest, res: Response): Promise<void> {
  const { notificationId } = req.params;
  await rebrandService.markNotificationRead(notificationId);
  res.json({ success: true });
}

export async function markAllNotificationsRead(req: TenantRequest, res: Response): Promise<void> {
  await rebrandService.markAllNotificationsRead();
  res.json({ success: true });
}
