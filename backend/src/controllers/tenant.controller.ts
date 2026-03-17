import { Response } from 'express';
import { tenantService } from '../services/tenant.service.js';
import { registrationService } from '../services/registration.service.js';
import { seatService } from '../services/seat.service.js';
import { settingsService } from '../services/settings.service.js';
import { guestService } from '../services/guest.service.js';
import { msmeBenefitService } from '../services/msmeBenefit.service.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';
import type { AdminRegistrationFilters, TierType } from '../types/index.js';

// ============================================
// Public tenant endpoints (no auth)
// ============================================

/**
 * GET /api/t/:slug/public/config
 * Public tenant branding + event details
 */
export async function getPublicConfig(req: TenantRequest, res: Response): Promise<void> {
  const { slug } = req.params;

  const tenant = await tenantService.getBySlug(slug);
  if (!tenant || !tenant.is_active) {
    res.status(404).json({ success: false, error: { message: 'Event not found', code: 'NOT_FOUND' } });
    return;
  }

  // Get tenant-scoped settings
  const { data: settings } = await supabase
    .from('site_settings')
    .select('setting_key, setting_value')
    .eq('tenant_id', tenant.id)
    .eq('is_public', true);

  const settingsMap: Record<string, unknown> = {};
  for (const s of settings || []) {
    settingsMap[s.setting_key] = s.setting_value;
  }

  // Get guests and benefits
  const { data: guests } = await supabase
    .from('guests')
    .select('id, name, title, bio, photo_url, session_heading, session_points, sort_order')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const { data: benefits } = await supabase
    .from('msme_benefits')
    .select('id, title, description, icon, sort_order')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  // Get seats
  const { data: seats } = await supabase
    .from('seat_inventory')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('sort_order', { ascending: true });

  res.json({
    success: true,
    data: {
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        company_name: tenant.company_name,
        logo_url: tenant.logo_url,
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
        favicon_url: tenant.favicon_url,
      },
      settings: settingsMap,
      guests: guests || [],
      benefits: benefits || [],
      seats: seats || [],
    },
  });
}

/**
 * GET /api/t/:slug/public/seats
 */
export async function getPublicSeats(req: TenantRequest, res: Response): Promise<void> {
  const { slug } = req.params;
  const tenant = await tenantService.getBySlug(slug);
  if (!tenant || !tenant.is_active) {
    res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    return;
  }

  const { data: seats } = await supabase
    .from('seat_inventory')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('sort_order', { ascending: true });

  const seatList = (seats || [])
    .filter((s: { tier_name: string }) => s.tier_name !== 'waitlist')
    .map((s: { tier_name: string; display_name: string; total_seats: number; sold_seats: number; held_seats: number; price_inr: number; is_active: boolean; benefits: string[] }) => ({
      tier_name: s.tier_name,
      display_name: s.display_name,
      total_seats: s.total_seats,
      sold_seats: s.sold_seats,
      held_seats: s.held_seats,
      available_seats: s.total_seats - s.sold_seats - s.held_seats,
      price_inr: s.price_inr,
      is_active: s.is_active,
      is_sold_out: s.sold_seats + s.held_seats >= s.total_seats,
      benefits: s.benefits || [],
    }));

  const totalAvailable = seatList.reduce((sum: number, s: { available_seats: number }) => sum + s.available_seats, 0);

  res.json({
    success: true,
    seats: seatList,
    all_sold_out: totalAvailable === 0,
    total_available: totalAvailable,
    waitlist_mode: totalAvailable === 0,
  });
}

/**
 * GET /api/t/:slug/public/guests
 */
export async function getPublicGuests(req: TenantRequest, res: Response): Promise<void> {
  const { slug } = req.params;
  const tenant = await tenantService.getBySlug(slug);
  if (!tenant || !tenant.is_active) {
    res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    return;
  }

  const { data: guests } = await supabase
    .from('guests')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  res.json({ success: true, data: { guests: guests || [] } });
}

/**
 * GET /api/t/:slug/public/benefits
 */
export async function getPublicBenefits(req: TenantRequest, res: Response): Promise<void> {
  const { slug } = req.params;
  const tenant = await tenantService.getBySlug(slug);
  if (!tenant || !tenant.is_active) {
    res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    return;
  }

  const { data: benefits } = await supabase
    .from('msme_benefits')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  res.json({ success: true, data: { benefits: benefits || [] } });
}

// ============================================
// Tenant dashboard endpoints (auth required)
// ============================================

/**
 * GET /api/t/:slug/overview
 */
export async function getOverview(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;

  const { data: registrations } = await supabase
    .from('registrations')
    .select('tier, payment_status, amount_paid, created_at')
    .eq('tenant_id', tenantId);

  const { data: seats } = await supabase
    .from('seat_inventory')
    .select('*')
    .eq('tenant_id', tenantId)
    .neq('tier_name', 'waitlist');

  const { count: waitlistCount } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const regs = registrations || [];

  res.json({
    success: true,
    data: {
      total_registrations: regs.length,
      confirmed_registrations: regs.filter(r => r.payment_status === 'confirmed').length,
      pending_payments: regs.filter(r => r.payment_status === 'pending').length,
      total_revenue: regs.filter(r => r.payment_status === 'confirmed').reduce((sum, r) => sum + r.amount_paid, 0),
      seats_by_tier: (seats || []).map(s => ({
        tier: s.tier_name,
        total: s.total_seats,
        sold: s.sold_seats,
        available: s.total_seats - s.sold_seats - s.held_seats,
      })),
      waitlist_count: waitlistCount || 0,
      today_registrations: regs.filter(r => new Date(r.created_at) >= today).length,
    },
  });
}

/**
 * GET /api/t/:slug/registrations
 */
export async function getRegistrations(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('registrations')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (req.query.tier) query = query.eq('tier', req.query.tier);
  if (req.query.payment_status) query = query.eq('payment_status', req.query.payment_status);
  if (req.query.search) {
    query = query.or(`name.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%,phone.ilike.%${req.query.search}%,booking_id.ilike.%${req.query.search}%`);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations', code: 'FETCH_ERROR' } });
    return;
  }

  res.json({
    success: true,
    data: {
      registrations: data || [],
      pagination: { total: count || 0, page, limit, total_pages: Math.ceil((count || 0) / limit) },
    },
  });
}

/**
 * GET /api/t/:slug/registrations/:id
 */
export async function getRegistrationDetail(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .single();

  if (error || !data) {
    res.status(404).json({ success: false, error: { message: 'Registration not found', code: 'NOT_FOUND' } });
    return;
  }

  res.json({ success: true, data });
}

/**
 * GET /api/t/:slug/settings
 */
export async function getTenantSettings(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;

  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('category')
    .order('setting_key');

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch settings', code: 'FETCH_ERROR' } });
    return;
  }

  res.json({ success: true, data: { settings: data || [] } });
}

/**
 * POST /api/t/:slug/settings/:key
 */
export async function updateTenantSetting(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    res.status(400).json({ success: false, error: { message: 'Value is required', code: 'VALIDATION_ERROR' } });
    return;
  }

  const { data, error } = await supabase
    .from('site_settings')
    .update({ setting_value: value, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('setting_key', key)
    .select()
    .single();

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update setting', code: 'UPDATE_ERROR' } });
    return;
  }

  res.json({ success: true, data });
}

/**
 * GET /api/t/:slug/guests
 */
export async function getTenantGuests(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;

  const { data } = await supabase
    .from('guests')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true });

  res.json({ success: true, data: { guests: data || [] } });
}

/**
 * POST /api/t/:slug/guests
 */
export async function createTenantGuest(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { name, title, bio, session_heading, session_points, sort_order, is_active } = req.body;

  if (!name || !title || !bio) {
    res.status(400).json({ success: false, error: { message: 'Name, title, and bio are required', code: 'VALIDATION_ERROR' } });
    return;
  }

  const { data, error } = await supabase
    .from('guests')
    .insert({
      tenant_id: tenantId,
      name,
      title,
      bio,
      session_heading: session_heading || "In this session, you'll learn:",
      session_points: session_points || [],
      sort_order: sort_order || 0,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create guest', code: 'CREATE_ERROR' } });
    return;
  }

  res.status(201).json({ success: true, data: { guest: data } });
}

/**
 * PUT /api/t/:slug/guests/:id
 */
export async function updateTenantGuest(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = ['name', 'title', 'bio', 'session_heading', 'session_points', 'sort_order', 'is_active'];
  for (const f of fields) {
    if (req.body[f] !== undefined) updateData[f] = req.body[f];
  }

  const { data, error } = await supabase
    .from('guests')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update guest', code: 'UPDATE_ERROR' } });
    return;
  }

  res.json({ success: true, data: { guest: data } });
}

/**
 * DELETE /api/t/:slug/guests/:id
 */
export async function deleteTenantGuest(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const { error } = await supabase
    .from('guests')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete guest', code: 'DELETE_ERROR' } });
    return;
  }

  res.json({ success: true, message: 'Guest deleted' });
}

/**
 * GET /api/t/:slug/msme-benefits
 */
export async function getTenantBenefits(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;

  const { data } = await supabase
    .from('msme_benefits')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true });

  res.json({ success: true, data: { benefits: data || [] } });
}

/**
 * POST /api/t/:slug/msme-benefits
 */
export async function createTenantBenefit(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { title, description, icon, sort_order, is_active } = req.body;

  if (!title) {
    res.status(400).json({ success: false, error: { message: 'Title is required', code: 'VALIDATION_ERROR' } });
    return;
  }

  const { data, error } = await supabase
    .from('msme_benefits')
    .insert({
      tenant_id: tenantId,
      title,
      description: description || '',
      icon: icon || null,
      sort_order: sort_order || 0,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create benefit', code: 'CREATE_ERROR' } });
    return;
  }

  res.status(201).json({ success: true, data: { benefit: data } });
}

/**
 * PUT /api/t/:slug/msme-benefits/:id
 */
export async function updateTenantBenefit(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'icon', 'sort_order', 'is_active'];
  for (const f of fields) {
    if (req.body[f] !== undefined) updateData[f] = req.body[f];
  }

  const { data, error } = await supabase
    .from('msme_benefits')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update benefit', code: 'UPDATE_ERROR' } });
    return;
  }

  res.json({ success: true, data: { benefit: data } });
}

/**
 * DELETE /api/t/:slug/msme-benefits/:id
 */
export async function deleteTenantBenefit(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const { error } = await supabase
    .from('msme_benefits')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete benefit', code: 'DELETE_ERROR' } });
    return;
  }

  res.json({ success: true, message: 'Benefit deleted' });
}

/**
 * GET /api/t/:slug/seats
 */
export async function getTenantSeats(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;

  const { data } = await supabase
    .from('seat_inventory')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true });

  res.json({ success: true, data: { seats: data || [] } });
}

/**
 * POST /api/t/:slug/seats
 */
export async function updateTenantSeats(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { tier, total_seats, price_inr } = req.body;

  if (!tier) {
    res.status(400).json({ success: false, error: { message: 'Tier is required', code: 'VALIDATION_ERROR' } });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (total_seats !== undefined) updateData.total_seats = total_seats;
  if (price_inr !== undefined) updateData.price_inr = price_inr;

  const { data, error } = await supabase
    .from('seat_inventory')
    .update(updateData)
    .eq('tenant_id', tenantId)
    .eq('tier_name', tier)
    .select()
    .single();

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update seats', code: 'UPDATE_ERROR' } });
    return;
  }

  res.json({ success: true, data });
}

/**
 * GET /api/t/:slug/abandonments
 */
export async function getTenantAbandonments(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('payment_abandonments')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch abandonments', code: 'FETCH_ERROR' } });
    return;
  }

  res.json({
    success: true,
    data: {
      abandonments: data || [],
      pagination: { total: count || 0, page, limit },
    },
  });
}

// ============================================
// Super Admin tenant endpoints
// ============================================

/**
 * GET /api/super-admin/tenants
 */
export async function listAllTenants(req: TenantRequest, res: Response): Promise<void> {
  const result = await tenantService.list({
    search: req.query.search as string,
    is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
    subscription_plan: req.query.plan as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
  });

  res.json({ success: true, data: result });
}

/**
 * GET /api/super-admin/tenants/:id
 */
export async function getTenantDetail(req: TenantRequest, res: Response): Promise<void> {
  const tenant = await tenantService.getById(req.params.id);
  if (!tenant) {
    res.status(404).json({ success: false, error: { message: 'Tenant not found', code: 'NOT_FOUND' } });
    return;
  }

  // Get usage stats
  const { count: regCount } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('payment_status', 'confirmed');

  res.json({ success: true, data: { ...tenant, usage: { confirmed_registrations: regCount || 0 } } });
}

/**
 * PATCH /api/super-admin/tenants/:id
 */
export async function updateTenant(req: TenantRequest, res: Response): Promise<void> {
  const tenant = await tenantService.update(req.params.id, req.body);
  res.json({ success: true, data: tenant });
}

/**
 * POST /api/super-admin/tenants/:id/activate
 */
export async function activateTenant(req: TenantRequest, res: Response): Promise<void> {
  const tenant = await tenantService.activate(req.params.id);
  res.json({ success: true, data: tenant, message: 'Tenant activated' });
}

/**
 * POST /api/super-admin/tenants/:id/deactivate
 */
export async function deactivateTenant(req: TenantRequest, res: Response): Promise<void> {
  const tenant = await tenantService.deactivate(req.params.id);
  res.json({ success: true, data: tenant, message: 'Tenant deactivated' });
}

/**
 * GET /api/super-admin/stats
 */
export async function getGlobalStats(req: TenantRequest, res: Response): Promise<void> {
  const { count: totalTenants } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true });

  const { count: activeTenants } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: trialTenants } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'trialing');

  const { count: totalRegistrations } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('payment_status', 'confirmed');

  const { data: revenueData } = await supabase
    .from('subscriptions')
    .select('amount')
    .eq('status', 'active');

  const mrr = (revenueData || []).reduce((sum, s) => sum + s.amount, 0);

  res.json({
    success: true,
    data: {
      total_tenants: totalTenants || 0,
      active_tenants: activeTenants || 0,
      trial_tenants: trialTenants || 0,
      total_registrations: totalRegistrations || 0,
      mrr,
    },
  });
}
