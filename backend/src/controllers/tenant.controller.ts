import { Response } from 'express';
import { tenantService } from '../services/tenant.service.js';
import { subscriptionService } from '../services/subscription.service.js';
import { registrationService } from '../services/registration.service.js';
import { seatService } from '../services/seat.service.js';
import { settingsService } from '../services/settings.service.js';
import { guestService } from '../services/guest.service.js';
import { msmeBenefitService } from '../services/msmeBenefit.service.js';
import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
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

  const { data: recentRegistrations } = await supabase
    .from('registrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const regs = registrations || [];

  // Generate registrations trend for the last 7 days (including today)
  const last7DaysTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7DaysTrend.push({
      date: dateStr,
      count: 0
    });
  }

  for (const reg of regs) {
    const regDate = new Date(reg.created_at).toISOString().split('T')[0];
    const match = last7DaysTrend.find(t => t.date === regDate);
    if (match) {
      match.count++;
    }
  }

  res.json({
    success: true,
    data: {
      total_registrations: regs.length,
      totalRegistrations: regs.length,
      confirmed_registrations: regs.filter(r => r.payment_status === 'confirmed').length,
      confirmedRegistrations: regs.filter(r => r.payment_status === 'confirmed').length,
      confirmedPayments: regs.filter(r => r.payment_status === 'confirmed').length,
      pending_payments: regs.filter(r => r.payment_status === 'pending').length,
      pendingPayments: regs.filter(r => r.payment_status === 'pending').length,
      total_revenue: regs.filter(r => r.payment_status === 'confirmed').reduce((sum, r) => sum + r.amount_paid, 0),
      totalRevenue: regs.filter(r => r.payment_status === 'confirmed').reduce((sum, r) => sum + r.amount_paid, 0),
      seats_by_tier: (seats || []).map(s => ({
        tier: s.tier_name,
        total: s.total_seats,
        sold: s.sold_seats,
        available: s.total_seats - s.sold_seats - s.held_seats,
      })),
      waitlist_count: waitlistCount || 0,
      waitlistCount: waitlistCount || 0,
      today_registrations: regs.filter(r => new Date(r.created_at) >= today).length,
      todayRegistrations: regs.filter(r => new Date(r.created_at) >= today).length,
      recent: recentRegistrations || [],
      daily_registrations_trend: last7DaysTrend,
      dailyRegistrationsTrend: last7DaysTrend,
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

  // Convert settings array to a key-value map for ease of consumption by frontend
  const settingsMap: Record<string, unknown> = {};
  for (const s of data || []) {
    settingsMap[s.setting_key] = s.setting_value;
  }

  // Populate compatibility/standard keys for frontend mapping
  if (settingsMap['event_name'] !== undefined && settingsMap['event_title'] === undefined) {
    settingsMap['event_title'] = settingsMap['event_name'];
  }
  if (settingsMap['event_venue'] !== undefined && settingsMap['venue'] === undefined) {
    settingsMap['venue'] = settingsMap['event_venue'];
  }
  if (settingsMap['event_description'] !== undefined && settingsMap['description'] === undefined) {
    settingsMap['description'] = settingsMap['event_description'];
  }
  if (settingsMap['registration_fee'] !== undefined && settingsMap['fee'] === undefined) {
    settingsMap['fee'] = settingsMap['registration_fee'];
  }
  if (settingsMap['registration_open'] !== undefined && settingsMap['status'] === undefined) {
    settingsMap['status'] = settingsMap['registration_open'] ? 'open' : 'closed';
  }

  res.json({
    success: true,
    settings: settingsMap,
    data: { settings: data || [] }
  });
}

/**
 * PUT /api/t/:slug/settings
 */
export async function updateEventSettings(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const body = req.body;

  if (!body) {
    res.status(400).json({ success: false, error: { message: 'Request body is required', code: 'VALIDATION_ERROR' } });
    return;
  }

  // Map keys submitted in the body to their database site_settings representation
  const settingsToUpsert = [
    { key: 'event_name', value: body.event_name ?? body.event_title, category: 'event', is_public: true, setting_type: 'string' },
    { key: 'event_date', value: body.event_date, category: 'event', is_public: true, setting_type: 'string' },
    { key: 'event_venue', value: body.event_venue ?? body.venue, category: 'event', is_public: true, setting_type: 'string' },
    { key: 'event_description', value: body.event_description ?? body.description, category: 'event', is_public: true, setting_type: 'string' },
    { key: 'registration_fee', value: body.registration_fee !== undefined ? body.registration_fee : body.fee, category: 'payment', is_public: true, setting_type: 'number' },
    { key: 'max_registrations', value: body.max_registrations, category: 'registration', is_public: true, setting_type: 'number' },
    { key: 'registration_open', value: body.registration_open !== undefined ? body.registration_open : (body.status !== undefined ? (body.status === 'open' || body.status === true || body.status === 'true') : undefined), category: 'registration', is_public: true, setting_type: 'boolean' }
  ];

  try {
    for (const item of settingsToUpsert) {
      if (item.value === undefined) {
        continue;
      }

      // Check if this setting key already exists for the tenant
      const { data: existingSetting, error: checkError } = await supabase
        .from('site_settings')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('setting_key', item.key)
        .maybeSingle();

      if (checkError) {
        logger.error('Error checking site setting', { error: checkError.message, setting_key: item.key });
        res.status(500).json({ success: false, error: { message: `Failed to check setting: ${item.key}`, code: 'DATABASE_ERROR' } });
        return;
      }

      if (existingSetting) {
        // Update setting
        const { error: updateError } = await supabase
          .from('site_settings')
          .update({
            setting_value: item.value,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)
          .eq('setting_key', item.key);

        if (updateError) {
          logger.error('Error updating site setting', { error: updateError.message, setting_key: item.key });
          res.status(500).json({ success: false, error: { message: `Failed to update setting: ${item.key}`, code: 'DATABASE_ERROR' } });
          return;
        }
      } else {
        // Insert setting
        const { error: insertError } = await supabase
          .from('site_settings')
          .insert({
            tenant_id: tenantId,
            setting_key: item.key,
            setting_value: item.value,
            category: item.category,
            is_public: item.is_public,
            setting_type: item.setting_type
          });

        if (insertError) {
          logger.error('Error inserting site setting', { error: insertError.message, setting_key: item.key });
          res.status(500).json({ success: false, error: { message: `Failed to insert setting: ${item.key}`, code: 'DATABASE_ERROR' } });
          return;
        }
      }
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    logger.error('Unexpected error in updateEventSettings', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  }
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
  const { name, title, bio, session_heading, session_points, sort_order, is_active, admin_override } = req.body;

  if (!name || !title || !bio) {
    res.status(400).json({ success: false, error: { message: 'Name, title, and bio are required', code: 'VALIDATION_ERROR' } });
    return;
  }

  // 1. Fetch tenant information to find their plan
  const tenant = await tenantService.getById(tenantId);
  const plan = tenant?.subscription_plan || 'basic';

  // 2. Fetch the plan limit from the DB (with standard fallback)
  const planInfo = await subscriptionService.getPlanFromDb(plan);
  const limit = planInfo.guest_limit;

  // 3. Count current guests
  const { count, error: countError } = await supabase
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (countError) {
    logger.error('Error counting tenant guests', { tenantId, error: countError.message });
    res.status(500).json({ success: false, error: { message: 'Failed to verify limits', code: 'LIMIT_CHECK_ERROR' } });
    return;
  }

  const currentCount = count || 0;
  let manualAdminEntry = false;

  // 4. Enforce guest limits
  if (currentCount >= limit) {
    if (admin_override === true) {
      if (req.isAdmin === true) {
        // Bypass authorized
        manualAdminEntry = true;
        logger.info('Admin override bypass active for guest creation', { tenantId, userId: req.userId });
      } else {
        res.status(403).json({
          success: false,
          error: {
            message: 'Only admins can perform override.',
            code: 'FORBIDDEN'
          }
        });
        return;
      }
    } else {
      // Create admin notification
      const tenantName = tenant?.company_name || tenant?.name || 'Unknown Tenant';
      const tenantSlug = tenant?.slug || 'unknown';
      try {
        await supabase.from('admin_notifications').insert({
          type: 'limit_exceeded',
          title: `Limit Exceeded: ${tenantName}`,
          message: `Tenant '${tenantName}' (Slug: ${tenantSlug}) has hit their guest limit of ${limit}. Current count: ${currentCount}.`,
          tenant_id: tenantId,
          reference_id: null,
        });
      } catch (notifyError) {
        logger.error('Failed to create limit exceeded admin notification', {
          tenantId,
          error: notifyError instanceof Error ? notifyError.message : 'Unknown error',
        });
      }

      res.status(403).json({
        success: false,
        error: {
          message: `Guest limit reached for plan '${plan}' (${limit}). Contact platform Admin (Anvika Web Studio) for override.`,
          code: 'LIMIT_EXCEEDED'
        }
      });
      return;
    }
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
      manual_admin_entry: manualAdminEntry,
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

/**
 * POST /api/t/:slug/setup
 */
export async function setupTenant(req: TenantRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const { event_name, event_date, venue, ticket_tiers } = req.body;

  if (!event_name || !event_date || !venue || !Array.isArray(ticket_tiers)) {
    res.status(400).json({
      success: false,
      error: { message: 'Missing required fields: event_name, event_date, venue, ticket_tiers', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  try {
    // 1. Fetch the tenant to get their email (for support_email setting)
    const tenant = await tenantService.getById(tenantId);
    const email = tenant?.email || '';

    // 2. Prepare default settings to insert/upsert
    const defaultSettings = [
      { tenant_id: tenantId, setting_key: 'event_name', setting_value: event_name, category: 'event', is_public: true, setting_type: 'string' },
      { tenant_id: tenantId, setting_key: 'event_date', setting_value: event_date, category: 'event', is_public: true, setting_type: 'string' },
      { tenant_id: tenantId, setting_key: 'event_venue', setting_value: venue, category: 'event', is_public: true, setting_type: 'string' },
      { tenant_id: tenantId, setting_key: 'support_email', setting_value: email, category: 'contact', is_public: true, setting_type: 'string' },
    ];

    // Check and save each setting
    for (const s of defaultSettings) {
      const { data: existingSetting, error: checkError } = await supabase
        .from('site_settings')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('setting_key', s.setting_key)
        .maybeSingle();

      if (checkError) {
        logger.error('Error checking site setting during setup', { error: checkError.message, setting_key: s.setting_key });
        res.status(500).json({
          success: false,
          error: { message: 'Failed to verify settings', code: 'SETUP_ERROR' },
        });
        return;
      }

      if (existingSetting) {
        // Update
        const { error: updateError } = await supabase
          .from('site_settings')
          .update({
            setting_value: s.setting_value,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)
          .eq('setting_key', s.setting_key);

        if (updateError) {
          logger.error('Error updating site setting during setup', { error: updateError.message, setting_key: s.setting_key });
          res.status(500).json({
            success: false,
            error: { message: `Failed to update setting: ${s.setting_key}`, code: 'SETUP_ERROR' },
          });
          return;
        }
      } else {
        // Insert
        const { error: insertError } = await supabase
          .from('site_settings')
          .insert(s);

        if (insertError) {
          logger.error('Error inserting site setting during setup', { error: insertError.message, setting_key: s.setting_key });
          res.status(500).json({
            success: false,
            error: { message: `Failed to insert setting: ${s.setting_key}`, code: 'SETUP_ERROR' },
          });
          return;
        }
      }
    }

    // 3. Prepare ticket tiers to insert/upsert into seat_inventory
    const defaultBenefits: Record<string, string[]> = {
      vip: ['Front row seating', 'Networking lunch', 'Certificate of participation', 'Event recording access'],
      standard: ['General seating', 'Certificate of participation', 'Event recording access'],
      basic: ['General seating', 'Certificate of participation'],
    };

    const defaultDescriptions: Record<string, string> = {
      vip: 'VIP access with premium benefits',
      standard: 'Standard access with core benefits',
      basic: 'Basic access',
    };

    for (let i = 0; i < ticket_tiers.length; i++) {
      const tier = ticket_tiers[i];
      const { name, price, seats } = tier;
      let tierName = name.toLowerCase();
      // Map incoming names to match database ENUM values exactly, ensuring no 'invalid input value' errors occur
      if (tierName === 'general') {
        tierName = 'standard';
      } else if (tierName === 'vip') {
        tierName = 'vip';
      } else if (tierName === 'basic') {
        tierName = 'basic';
      } else if (tierName === 'waitlist') {
        tierName = 'waitlist';
      } else {
        tierName = 'standard'; // Fallback to standard
      }

      const seatRecord = {
        tenant_id: tenantId,
        tier_name: tierName as any,
        display_name: name,
        total_seats: parseInt(seats) || 0,
        sold_seats: 0,
        held_seats: 0,
        price_inr: Math.round((parseFloat(price) || 0) * 100), // convert to paise
        is_active: true,
        description: defaultDescriptions[tierName] || `${name} access`,
        benefits: defaultBenefits[tierName] || ['General seating'],
        sort_order: i + 1,
      };

      // Check if seat inventory record already exists for this tenant and tier
      const { data: existingSeat, error: checkSeatError } = await supabase
        .from('seat_inventory')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('tier_name', tierName)
        .maybeSingle();

      if (checkSeatError) {
        logger.error('Error checking seat inventory during setup', { error: checkSeatError.message, tier: tierName });
        res.status(500).json({
          success: false,
          error: { message: 'Failed to verify ticket tiers', code: 'SETUP_ERROR' },
        });
        return;
      }

      if (existingSeat) {
        // Update
        const { error: updateSeatError } = await supabase
          .from('seat_inventory')
          .update({
            total_seats: seatRecord.total_seats,
            price_inr: seatRecord.price_inr,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)
          .eq('tier_name', tierName);

        if (updateSeatError) {
          logger.error('Error updating seat inventory during setup', { error: updateSeatError.message, tier: tierName });
          res.status(500).json({
            success: false,
            error: { message: `Failed to update ticket tier: ${name}`, code: 'SETUP_ERROR' },
          });
          return;
        }
      } else {
        // Insert
        const { error: insertSeatError } = await supabase
          .from('seat_inventory')
          .insert(seatRecord);

        if (insertSeatError) {
          logger.error('Error inserting seat inventory during setup', { error: insertSeatError.message, tier: tierName });
          res.status(500).json({
            success: false,
            error: { message: `Failed to insert ticket tier: ${name}`, code: 'SETUP_ERROR' },
          });
          return;
        }
      }
    }

    logger.info('Tenant setup completed', { tenantId, event_name });

    res.json({
      success: true,
      message: 'Event setup completed successfully',
    });
  } catch (error) {
    logger.error('Unexpected error in setupTenant', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Setup failed due to internal error', code: 'SETUP_ERROR' },
    });
  }
}

const ALL_TEMPLATES = [
  { id: 'summit-classic', name: 'Modern Summit', subtitle: 'Clean & high impact' },
  { id: 'summit-neon', name: 'Cyber Neon', subtitle: 'Vibrant neon style' },
  { id: 'summit-light', name: 'Minimal Light', subtitle: 'Simple light design' },
  { id: 'speaker-spotlight', name: 'Speaker Spotlight', subtitle: 'Focus on speaker details' },
  { id: 'speaker-academic', name: 'Academic Blue', subtitle: 'Professional school/college theme' },
  { id: 'speaker-warm', name: 'Warm Autumn', subtitle: 'Vibrant speaker card' },
  { id: 'pricing-emerald', name: 'Early Bird Passes', subtitle: 'Standard ticket pricing' },
  { id: 'pricing-corporate', name: 'Corporate Dark', subtitle: 'Premium corporate tickets' },
  { id: 'pricing-gradient', name: 'Sunset Glow', subtitle: 'Warm gradient passes' },
  { id: 'minimal-clean', name: 'Minimal Clean', subtitle: 'Simple layout' }
];

const INDUSTRY_TEMPLATES_MAP: Record<string, string[]> = {
  school: ['minimal-clean', 'summit-light', 'speaker-academic', 'pricing-emerald'],
  hospital: ['summit-classic', 'summit-light', 'speaker-spotlight', 'minimal-clean'],
  business: ['summit-classic', 'summit-neon', 'speaker-spotlight', 'pricing-emerald', 'pricing-corporate', 'pricing-gradient', 'minimal-clean'],
  corporate: ['summit-classic', 'summit-neon', 'speaker-spotlight', 'pricing-corporate', 'pricing-gradient', 'minimal-clean'],
  college: ['summit-classic', 'summit-neon', 'speaker-spotlight', 'speaker-academic', 'pricing-emerald', 'pricing-gradient', 'minimal-clean'],
  it_services: ['summit-classic', 'summit-neon', 'speaker-spotlight', 'pricing-corporate', 'pricing-gradient', 'minimal-clean'],
  retail: ['summit-neon', 'speaker-spotlight', 'pricing-emerald', 'pricing-gradient', 'minimal-clean'],
  finance: ['summit-classic', 'summit-light', 'speaker-spotlight', 'pricing-corporate', 'minimal-clean'],
  healthcare: ['summit-classic', 'summit-light', 'speaker-spotlight', 'minimal-clean'],
  education: ['minimal-clean', 'summit-light', 'speaker-academic', 'pricing-emerald']
};

/**
 * GET /api/t/:slug/flyer-templates
 */
export async function getAvailableFlyerTemplates(req: TenantRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const tenant = await tenantService.getById(tenantId);
    if (!tenant) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found', code: 'NOT_FOUND' } });
      return;
    }

    // Return all templates to ensure both views access the same complete template library
    res.json({ success: true, data: ALL_TEMPLATES });
  } catch (error) {
    logger.error('Unexpected error in getAvailableFlyerTemplates', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve flyer templates', code: 'INTERNAL_ERROR' },
    });
  }
}

/**
 * GET /api/t/:slug/account
 */
export async function getAccount(req: TenantRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const tenant = await tenantService.getById(tenantId);
    if (!tenant) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found', code: 'NOT_FOUND' } });
      return;
    }

    // Fetch user details from supabase auth to get job_title and bio
    let job_title = '';
    let bio = '';
    try {
      if (userId) {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (user) {
          job_title = user.user_metadata?.job_title || '';
          bio = user.user_metadata?.bio || '';
        }
      }
    } catch (e) {
      logger.warn('Failed to retrieve user metadata', { error: e instanceof Error ? e.message : 'Unknown' });
    }

    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        company_name: tenant.company_name,
        logo_url: tenant.logo_url,
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
        favicon_url: tenant.favicon_url,
        custom_domain: tenant.custom_domain,
        industry: tenant.industry,
        subscription_plan: tenant.subscription_plan,
        subscription_status: tenant.subscription_status,
        job_title,
        bio
      }
    });
  } catch (error) {
    logger.error('Unexpected error in getAccount', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Failed to retrieve account details', code: 'INTERNAL_ERROR' } });
  }
}

/**
 * PUT /api/t/:slug/account
 */
export async function updateAccount(req: TenantRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const { name, email, phone, company_name, logo_url, primary_color, secondary_color, favicon_url, custom_domain, industry, job_title, bio } = req.body;

    const updated = await tenantService.update(tenantId, {
      name,
      email,
      phone,
      company_name,
      logo_url,
      primary_color,
      secondary_color,
      favicon_url,
      custom_domain,
      industry
    });

    // Update Supabase Auth user metadata
    try {
      if (userId) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            job_title: job_title || '',
            bio: bio || ''
          }
        });
      }
    } catch (e) {
      logger.warn('Failed to update user metadata', { error: e instanceof Error ? e.message : 'Unknown' });
    }

    res.json({
      success: true,
      data: {
        ...updated,
        job_title,
        bio
      }
    });
  } catch (error) {
    logger.error('Unexpected error in updateAccount', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Failed to update account details', code: 'INTERNAL_ERROR' } });
  }
}

/**
 * POST /api/t/:slug/activate
 */
export async function activateTenantSelf(req: TenantRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const tenant = await tenantService.activate(tenantId);
    res.json({ success: true, data: tenant, message: 'Tenant activated successfully' });
  } catch (error) {
    logger.error('Unexpected error in activateTenantSelf', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Failed to activate tenant', code: 'INTERNAL_ERROR' } });
  }
}

/**
 * POST /api/t/:slug/account/avatar
 */
export async function uploadProfilePicture(req: TenantRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const { image_base64 } = req.body;

    if (!image_base64) {
      res.status(400).json({ success: false, error: { message: 'image_base64 is required', code: 'VALIDATION_ERROR' } });
      return;
    }

    // Parse base64 image data URL
    const matches = image_base64.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (!matches) {
      res.status(400).json({ success: false, error: { message: 'Invalid image data URL format', code: 'VALIDATION_ERROR' } });
      return;
    }

    const ext = matches[1];
    const base64Data = matches[2];
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    // Generate unique name under tenant_id folder
    const fileName = `avatar_${Date.now()}.${ext}`;
    const storagePath = `${tenantId}/${fileName}`;

    // Upload to Supabase Storage (flyers bucket)
    const { error: uploadError } = await supabase.storage
      .from('flyers')
      .upload(storagePath, fileBuffer, {
        contentType: `image/${ext}`,
        upsert: true,
      });

    if (uploadError) {
      logger.error('Error uploading avatar to storage', { error: uploadError.message });
      res.status(500).json({ success: false, error: { message: 'Failed to upload image to storage', code: 'STORAGE_UPLOAD_ERROR' } });
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('flyers')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update tenant logo_url
    const updated = await tenantService.update(tenantId, {
      logo_url: publicUrl,
    });

    res.json({
      success: true,
      data: {
        logo_url: publicUrl,
        tenant: updated
      }
    });
  } catch (error) {
    logger.error('Unexpected error in uploadProfilePicture', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Failed to upload profile picture', code: 'INTERNAL_ERROR' } });
  }
}

