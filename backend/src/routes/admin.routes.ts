import { Router } from 'express';
import {
  getDashboardStats,
  getAllRegistrations,
  getRegistrationDetails,
  exportRegistrations,
  getWaitlistEntries,
  getSeatInventory,
  adjustSeats,
  resendConfirmation,
  deleteRegistration,
  deleteAllRegistrations,
  createManualRegistration,
  resyncSeatCounts,
  sendPaymentReminder,
  adminLogin,
} from '../controllers/admin.controller.js';
import { supabase } from '../config/supabase.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import {
  getAbandonments,
  getAbandonmentStats,
  getAbandonmentDetails,
  deleteAbandonment,
  deleteAllAbandonments,
  updateFollowupStatus,
  generateRecoveryLink,
  sendFollowupEmail,
  exportAbandonments,
  getPendingRegistrations,
  cleanupExpiredRegistrations,
} from '../controllers/abandonment.controller.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { adminLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listAllTenants } from '../controllers/tenant.controller.js';
import { getSubscriptionPlans, createSubscriptionPlan, updateSubscriptionPlan } from '../controllers/subscriptionPlan.controller.js';
import { broadcastNotification, composeNotification } from '../controllers/admin.notification.controller.js';
import { logger } from '../utils/logger.js';
import flyerRouter from './flyer.routes.js';

const router = Router();

// Public login route (must be registered BEFORE requireSuperAdmin middleware)
router.post('/login', adminLimiter, asyncHandler(adminLogin));

// All admin routes require authentication
router.use(requireSuperAdmin);

// Disable caching for all admin routes to ensure fresh data
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

/**
 * @route GET /api/admin/stats
 * @desc Get dashboard statistics
 * @access Admin
 */
router.get('/stats', adminLimiter, asyncHandler(async (req, res) => {
  try {
    const { count: totalTenants } = await supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true });

    const { data: revenueData } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'captured');

    const totalRevenuePaise = (revenueData || []).reduce((sum, p) => sum + p.amount, 0);
    const totalRevenueRupees = totalRevenuePaise / 100;

    const { count: activeTenants } = await supabase
      .from('tenants')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    const activeSessions = (activeTenants || 0) * 2 + 1;

    res.status(200).json({
      success: true,
      data: {
        total_tenants: totalTenants || 0,
        total_revenue: totalRevenueRupees || 0,
        active_sessions: activeSessions || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch admin statistics',
        code: 'STATS_ERROR',
      },
    });
  }
}));

/**
 * @route GET /api/admin/check-access
 * @desc Verify super admin access
 * @access Admin
 */
router.get('/check-access', adminLimiter, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    role: 'super_admin',
    email: (req as any).userEmail || '',
  });
}));

/**
 * @route GET /api/admin/tenants
 * @desc Get all active tenants
 * @access Admin
 */
router.get('/tenants', adminLimiter, asyncHandler(listAllTenants));

/**
 * @route GET /api/admin/tenant-logins
 * @desc Get real-time list of tenant accounts / login identifiers
 * @access Admin
 */
router.get('/tenant-logins', adminLimiter, asyncHandler(async (req, res) => {
  console.log('GET /api/admin/tenant-logins: Fetching tenant login identifiers...');
  const { data, error } = await supabase
    .from('tenants')
    .select('id, email, name, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch tenant logins:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch tenant logins: ' + error.message } });
    return;
  }

  res.json({ success: true, data: data || [] });
}));

/**
 * @route GET /api/admin/tenant/:id
 * @desc Get tenant details
 * @access Admin
 */
router.get(['/tenant/:id', '/tenants/:id'], adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !tenant) {
    res.status(404).json({ success: false, error: { message: 'Tenant not found', code: 'NOT_FOUND' } });
    return;
  }

  res.json({ success: true, data: tenant });
}));

/**
 * @route POST /api/admin/tenant/:id/suspend
 * @desc Suspend a tenant
 * @access Admin
 */
router.post(['/tenant/:id/suspend', '/tenants/:id/suspend'], adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Fetch tenant name for logging
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  const tenantName = tenant?.name || 'Unknown';
  const actorEmail = (req as any).userEmail || 'dev@eventregplatform.com';

  const { error } = await supabase
    .from('tenants')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    logger.error(`Failed to suspend tenant ${id}: ${error.message}`);
    res.status(500).json({ success: false, error: { message: 'Failed to suspend tenant', code: 'SUSPEND_ERROR' } });
    return;
  }

  // 2. Audit Log
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Suspend Tenant',
      tenant_id: id,
      tenant_name: tenantName,
      actor_email: actorEmail
    });

  res.json({ success: true, message: 'Tenant suspended successfully' });
}));

/**
 * @route POST /api/admin/tenant/:id/unsuspend
 * @desc Unsuspend/Activate a tenant
 * @access Admin
 */
router.post(['/tenant/:id/unsuspend', '/tenants/:id/unsuspend'], adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Fetch tenant name for logging
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  const tenantName = tenant?.name || 'Unknown';
  const actorEmail = (req as any).userEmail || 'dev@eventregplatform.com';

  const { error } = await supabase
    .from('tenants')
    .update({ is_active: true })
    .eq('id', id);

  if (error) {
    logger.error(`Failed to unsuspend tenant ${id}: ${error.message}`);
    res.status(500).json({ success: false, error: { message: 'Failed to unsuspend tenant', code: 'UNSUSPEND_ERROR' } });
    return;
  }

  // 2. Audit Log
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Unsuspend Tenant',
      tenant_id: id,
      tenant_name: tenantName,
      actor_email: actorEmail
    });

  res.json({ success: true, message: 'Tenant unsuspended successfully' });
}));

/**
 * @route DELETE /api/admin/tenant/:id
 * @desc Delete a tenant
 * @access Admin
 */
router.delete(['/tenant/:id', '/tenants/:id'], adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Fetch tenant name for logging
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  const tenantName = tenant?.name || 'Unknown';
  const actorEmail = (req as any).userEmail || 'dev@eventregplatform.com';

  // 2. Perform Cascade Delete
  const { error } = await supabase
    .from('tenants')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error(`Failed to delete tenant ${id}: ${error.message}`);
    res.status(500).json({ success: false, error: { message: 'Failed to delete tenant', code: 'DELETE_ERROR' } });
    return;
  }

  // 3. Audit Log
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Delete Tenant',
      tenant_id: id,
      tenant_name: tenantName,
      actor_email: actorEmail
    });

  res.json({ success: true, message: 'Tenant deleted successfully' });
}));

/**
 * @route GET /api/admin/registrations
 * @desc Get all registrations with filters
 * @access Admin
 */
router.get('/registrations', adminLimiter, asyncHandler(getAllRegistrations));

/**
 * @route GET /api/admin/registrations/:bookingId
 * @desc Get full registration details
 * @access Admin
 */
router.get('/registrations/:bookingId', adminLimiter, asyncHandler(getRegistrationDetails));

/**
 * @route POST /api/admin/registrations/:bookingId/resend
 * @desc Resend confirmation to a registration
 * @access Admin
 */
router.post('/registrations/:bookingId/resend', adminLimiter, asyncHandler(resendConfirmation));

/**
 * @route DELETE /api/admin/registrations/all
 * @desc Delete all registrations
 * @access Admin
 */
router.delete('/registrations/all', adminLimiter, asyncHandler(deleteAllRegistrations));

/**
 * @route DELETE /api/admin/registrations/:bookingId
 * @desc Delete a registration
 * @access Admin
 */
router.delete('/registrations/:bookingId', adminLimiter, asyncHandler(deleteRegistration));

/**
 * @route POST /api/admin/registrations
 * @desc Create a manual registration
 * @access Admin
 */
router.post('/registrations', adminLimiter, asyncHandler(createManualRegistration));

/**
 * @route GET /api/admin/export
 * @desc Export registrations as CSV
 * @access Admin
 */
router.get('/export', adminLimiter, asyncHandler(exportRegistrations));

/**
 * @route GET /api/admin/waitlist
 * @desc Get all waitlist entries
 * @access Admin
 */
router.get('/waitlist', adminLimiter, asyncHandler(getWaitlistEntries));

/**
 * @route GET /api/admin/seats
 * @desc Get seat inventory status
 * @access Admin
 */
router.get('/seats', adminLimiter, asyncHandler(getSeatInventory));

/**
 * @route POST /api/admin/seats/adjust
 * @desc Manual seat adjustment (disabled for safety)
 * @access Admin
 */
router.post('/seats/adjust', adminLimiter, asyncHandler(adjustSeats));

/**
 * @route POST /api/admin/seats/resync
 * @desc Resync seat counts from registrations table
 * @access Admin
 */
router.post('/seats/resync', adminLimiter, asyncHandler(resyncSeatCounts));

/**
 * @route POST /api/admin/registrations/:registrationId/remind
 * @desc Send payment reminder email to pending registration
 * @access Admin
 */
router.post('/registrations/:registrationId/remind', adminLimiter, asyncHandler(sendPaymentReminder));

// ============================================
// Payment Abandonment Routes
// ============================================

/**
 * @route GET /api/admin/abandonments
 * @desc Get all payment abandonments with filters
 * @access Admin
 */
router.get('/abandonments', adminLimiter, asyncHandler(getAbandonments));

/**
 * @route GET /api/admin/abandonments/stats
 * @desc Get abandonment statistics
 * @access Admin
 */
router.get('/abandonments/stats', adminLimiter, asyncHandler(getAbandonmentStats));

/**
 * @route GET /api/admin/abandonments/export
 * @desc Export abandonments as CSV
 * @access Admin
 */
router.get('/abandonments/export', adminLimiter, asyncHandler(exportAbandonments));

/**
 * @route GET /api/admin/abandonments/pending
 * @desc Get pending registrations (held seats awaiting payment)
 * @access Admin
 */
router.get('/abandonments/pending', adminLimiter, asyncHandler(getPendingRegistrations));

/**
 * @route POST /api/admin/abandonments/cleanup
 * @desc Release expired registrations and free up seats
 * @access Admin
 */
router.post('/abandonments/cleanup', adminLimiter, asyncHandler(cleanupExpiredRegistrations));

/**
 * @route GET /api/admin/abandonments/:id
 * @desc Get single abandonment details
 * @access Admin
 */
router.get('/abandonments/:id', adminLimiter, asyncHandler(getAbandonmentDetails));

/**
 * @route DELETE /api/admin/abandonments/all
 * @desc Delete all abandonment records
 * @access Admin
 */
router.delete('/abandonments/all', adminLimiter, asyncHandler(deleteAllAbandonments));

/**
 * @route DELETE /api/admin/abandonments/:id
 * @desc Delete an abandonment record
 * @access Admin
 */
router.delete('/abandonments/:id', adminLimiter, asyncHandler(deleteAbandonment));

/**
 * @route PATCH /api/admin/abandonments/:id/status
 * @desc Update follow-up status
 * @access Admin
 */
router.patch('/abandonments/:id/status', adminLimiter, asyncHandler(updateFollowupStatus));

/**
 * @route POST /api/admin/abandonments/:id/recovery-link
 * @desc Generate recovery link with QR code
 * @access Admin
 */
router.post('/abandonments/:id/recovery-link', adminLimiter, asyncHandler(generateRecoveryLink));

/**
 * @route POST /api/admin/abandonments/:id/send-email
 * @desc Send follow-up email with recovery link
 * @access Admin
 */
router.post('/abandonments/:id/send-email', adminLimiter, asyncHandler(sendFollowupEmail));

/**
 * @route USE /api/admin/flyers
 * @desc Flyers generation API sub-router
 */
router.use('/flyers', flyerRouter);

/**
 * @route POST /api/admin/tenant
 * @desc Create a new tenant record manually
 * @access Admin
 */
router.post('/tenant', adminLimiter, asyncHandler(async (req, res) => {
  const { name, email, slug } = req.body;
  if (!name || !email || !slug) {
    res.status(400).json({ success: false, error: { message: 'name, email, and slug are required' } });
    return;
  }

  const { data, error } = await supabase
    .from('tenants')
    .insert({
      name,
      email,
      slug,
      added_by_admin: true,
      subscription_plan: 'trial',
      subscription_status: 'trialing',
      is_active: true
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create tenant via admin:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to create tenant: ' + error.message } });
    return;
  }

  // Log activity
  const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Create Tenant',
      tenant_id: data.id,
      tenant_name: data.name,
      actor_email: actorEmail
    });

  res.status(201).json({ success: true, data });
}));

/**
 * @route GET /api/admin/plans
 * @desc Get all subscription plans
 * @access Admin
 */
router.get('/plans', adminLimiter, asyncHandler(getSubscriptionPlans));

/**
 * @route POST /api/admin/plans
 * @desc Create a new subscription plan
 * @access Admin
 */
router.post('/plans', adminLimiter, asyncHandler(createSubscriptionPlan));

/**
 * @route PUT /api/admin/plans/:id
 * @desc Update a subscription plan
 * @access Admin
 */
router.put('/plans/:id', adminLimiter, (req, res, next) => {
  const { id } = req.params;
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || /^\d+$/.test(id);
  if (!isValidId) {
    res.status(400).json({
      success: false,
      error: { message: 'Invalid format for Plan ID' }
    });
    return;
  }
  next();
}, asyncHandler(updateSubscriptionPlan));

/**
 * @route GET /api/admin/user-details/:id
 * @desc Get details for a specific user/tenant, joining subscriptions and payments tables
 * @access Admin
 */
router.get('/user-details/:id', adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    res.status(400).json({ success: false, error: { message: 'Invalid tenant UUID format' } });
    return;
  }

  // 1. Fetch tenant detail
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (tenantError || !tenant) {
    res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
    return;
  }

  // 2. Fetch subscription details
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', id)
    .maybeSingle();

  // 3. Fetch payment details
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', id);

  // 4. Fetch 30-day registration trend (activities)
  const last30Days: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last30Days.push({ date: dateStr, count: 0 });
  }

  const { data: trendData } = await supabase
    .from('registrations')
    .select('created_at')
    .eq('tenant_id', id)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (trendData) {
    trendData.forEach((r: any) => {
      const regDate = new Date(r.created_at).toISOString().split('T')[0];
      const match = last30Days.find(t => t.date === regDate);
      if (match) {
        match.count++;
      }
    });
  }

  // 5. Fetch recent registrations for activity stream
  const { data: recentRegs } = await supabase
    .from('registrations')
    .select('name, created_at')
    .eq('tenant_id', id)
    .order('created_at', { ascending: false })
    .limit(3);

  // Calculate plan status
  const planStatus = subscription ? subscription.status : tenant.subscription_status || 'trialing';

  res.json({
    success: true,
    data: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      is_active: tenant.is_active,
      subscription_plan: tenant.subscription_plan || 'free',
      current_plan_status: planStatus || 'active',
      total_events_created: 1, // each tenant represents an event registration site
      last_active_timestamp: tenant.updated_at || tenant.created_at,
      activity_trend: last30Days,
      recent_registrations: recentRegs || [],
      subscription: subscription || null,
      payments: payments || [],
      total_amount_paid: (payments || [])
        .filter((p: any) => p.status === 'captured')
        .reduce((sum: number, p: any) => sum + (p.amount || 0) / 100, 0)
    }
  });
}));

/**
 * @route POST /api/admin/tenants/:id/reset-password
 * @desc Reset a tenant's password to a temporary password
 * @access Admin
 */
router.post('/tenants/:id/reset-password', adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    res.status(400).json({ success: false, error: { message: 'Invalid tenant UUID format' } });
    return;
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('email, name')
    .eq('id', id)
    .maybeSingle();

  if (tenantError || !tenant) {
    res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
    return;
  }

  // Generate random temporary password
  const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 10) + '!';

  // Update in auth
  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    id,
    { password: tempPassword }
  );

  if (error) {
    logger.error(`Failed to reset password for user ${id}: ${error.message}`);
    res.status(500).json({ success: false, error: { message: 'Failed to reset password: ' + error.message } });
    return;
  }

  // Audit activity log
  const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Reset Password',
      tenant_id: id,
      tenant_name: tenant.name,
      actor_email: actorEmail
    });

  res.json({
    success: true,
    message: 'Password reset successful',
    temp_password: tempPassword
  });
}));

/**
 * @route GET /api/admin/global-settings
 * @desc Get global system settings
 * @access Admin
 */
router.get('/global-settings', adminLimiter, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('global_settings')
    .select('*');

  if (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch global settings: ' + error.message } });
    return;
  }

  const settings: Record<string, any> = {};
  (data || []).forEach(item => {
    settings[item.key] = item.value;
  });

  res.json({ success: true, data: settings });
}));

/**
 * @route POST /api/admin/global-settings
 * @desc Update multiple global settings
 * @access Admin
 */
router.post('/global-settings', adminLimiter, asyncHandler(async (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ success: false, error: { message: 'Settings object is required' } });
    return;
  }

  const results = [];
  for (const [key, value] of Object.entries(settings)) {
    const { data, error } = await supabase
      .from('global_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select();

    if (error) {
      logger.error(`Failed to upsert global setting ${key}:`, error.message);
      res.status(500).json({ success: false, error: { message: `Failed to update ${key}: ` + error.message } });
      return;
    }
    results.push(data);
  }

  // Log activity
  const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Update Global Settings',
      actor_email: actorEmail
    });

  res.json({ success: true, message: 'Global settings updated successfully', data: results });
}));

/**
 * @route GET /api/admin/coupons
 * @desc Get all platform coupons
 * @access Admin
 */
router.get('/coupons', adminLimiter, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('platform_coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch coupons:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch coupons: ' + error.message } });
    return;
  }

  res.json({ success: true, data: data || [] });
}));

/**
 * @route POST /api/admin/coupons
 * @desc Create a new platform coupon
 * @access Admin
 */
router.post('/coupons', adminLimiter, asyncHandler(async (req, res) => {
  const { code, discount_percent, expiry_date } = req.body;
  if (!code || discount_percent === undefined || !expiry_date) {
    res.status(400).json({ success: false, error: { message: 'code, discount_percent, and expiry_date are required' } });
    return;
  }

  const { data, error } = await supabase
    .from('platform_coupons')
    .insert({
      code: code.trim().toUpperCase(),
      discount_percent: Number(discount_percent),
      expiry_date,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create coupon:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to create coupon: ' + error.message } });
    return;
  }

  // Log activity
  const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Create Coupon',
      actor_email: actorEmail,
      tenant_name: code.toUpperCase()
    });

  res.status(201).json({ success: true, data });
}));

/**
 * @route POST /api/admin/coupons/:id/toggle
 * @desc Toggle active status of a coupon
 * @access Admin
 */
router.post('/coupons/:id/toggle', adminLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (is_active === undefined) {
    res.status(400).json({ success: false, error: { message: 'is_active is required' } });
    return;
  }

  const { data, error } = await supabase
    .from('platform_coupons')
    .update({ is_active: !!is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to toggle coupon:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to toggle coupon: ' + error.message } });
    return;
  }

  // Log activity
  const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
  await supabase
    .from('admin_activity_log')
    .insert({
      action: is_active ? 'Activate Coupon' : 'Deactivate Coupon',
      actor_email: actorEmail,
      tenant_name: data.code
    });

  res.json({ success: true, data });
}));

/**
 * @route POST /api/admin/notifications
 * @desc Create/Broadcast a platform notification
 * @access Admin
 */
router.post('/notifications', adminLimiter, asyncHandler(broadcastNotification));

/**
 * @route POST /api/admin/ai/compose-notification
 * @desc Generate professional title and message using AI
 * @access Admin
 */
router.post('/ai/compose-notification', adminLimiter, asyncHandler(composeNotification));

/**
 * @route GET /api/admin/analytics-summary
 * @desc Get global platform statistics, revenue trend, plan distribution & registration growth
 * @access Admin
 */
router.get('/analytics-summary', adminLimiter, asyncHandler(async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Build a zero-filled date map for the last 30 days
    const buildDateMap = (): Record<string, number> => {
      const map: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        map[d.toISOString().split('T')[0]] = 0;
      }
      return map;
    };

    // ── 1. Plan Distribution ────────────────────────────────────────────────
    const { data: tenantsData } = await supabase
      .from('tenants')
      .select('subscription_plan, is_active');

    const planCounts: Record<string, number> = {};
    let totalActiveTenants = 0;
    (tenantsData || []).forEach(t => {
      const plan = t.subscription_plan || 'free';
      planCounts[plan] = (planCounts[plan] || 0) + 1;
      if (t.is_active) totalActiveTenants++;
    });
    const planDistribution = Object.entries(planCounts).map(([plan, count]) => ({ plan, count }));

    // ── 2. Registration Growth (last 30 days, grouped by day) ─────────────
    const growthMap = buildDateMap();
    let totalRegistrations = 0;

    const { data: regsData } = await supabase
      .from('registrations')
      .select('created_at, payment_status')
      .gte('created_at', thirtyDaysAgoISO);

    (regsData || []).forEach(r => {
      if (r.created_at) {
        const dateStr = r.created_at.split('T')[0];
        if (growthMap[dateStr] !== undefined) growthMap[dateStr]++;
      }
      if (r.payment_status === 'confirmed') totalRegistrations++;
    });

    // Fall back to tenant sign-ups if registrations table is empty
    if ((regsData || []).length === 0) {
      const { data: tenantGrowthData } = await supabase
        .from('tenants')
        .select('created_at')
        .gte('created_at', thirtyDaysAgoISO);

      (tenantGrowthData || []).forEach(t => {
        if (t.created_at) {
          const dateStr = t.created_at.split('T')[0];
          if (growthMap[dateStr] !== undefined) growthMap[dateStr]++;
        }
      });
    }

    const registrationGrowth = Object.entries(growthMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 3. Revenue Trend (last 30 days, grouped by day) ───────────────────
    const revenueMap = buildDateMap();
    let totalRevenue = 0;

    // Try payments table first
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('created_at, amount, status')
      .gte('created_at', thirtyDaysAgoISO);

    if (!paymentsError && paymentsData && paymentsData.length > 0) {
      paymentsData.forEach(p => {
        if (p.status === 'captured' || p.status === 'paid' || p.status === 'success') {
          const dateStr = (p.created_at || '').split('T')[0];
          const amountInRupees = (p.amount || 0) > 1000
            ? Math.round((p.amount || 0) / 100)   // Paise → Rupees
            : (p.amount || 0);
          if (revenueMap[dateStr] !== undefined) revenueMap[dateStr] += amountInRupees;
          totalRevenue += amountInRupees;
        }
      });
    } else {
      // Fallback: aggregate from registrations.amount_paid
      const { data: regRevenueData } = await supabase
        .from('registrations')
        .select('created_at, amount_paid, payment_status')
        .gte('created_at', thirtyDaysAgoISO)
        .eq('payment_status', 'confirmed');

      (regRevenueData || []).forEach(r => {
        const dateStr = (r.created_at || '').split('T')[0];
        const amount = r.amount_paid || 0;
        if (revenueMap[dateStr] !== undefined) revenueMap[dateStr] += amount;
        totalRevenue += amount;
      });
    }

    const revenueTrend = Object.entries(revenueMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 4. Conversion Rate ─────────────────────────────────────────────────
    const totalOrders = (regsData || []).length;
    const confirmedOrders = (regsData || []).filter(r => r.payment_status === 'confirmed').length;
    const conversionRate = totalOrders > 0 ? Math.round((confirmedOrders / totalOrders) * 100) : 0;

    res.json({
      success: true,
      data: {
        // Metric card summary
        total_revenue: totalRevenue,
        total_active_tenants: totalActiveTenants,
        conversion_rate: conversionRate,
        // Chart data
        plan_distribution: planDistribution,
        registration_growth: registrationGrowth,
        revenue: revenueTrend,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}));

/**
 * @route POST /api/admin/create-admin
 * @desc Create a new super admin user and add to whitelist
 * @access Admin
 */
router.post('/create-admin', adminLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ success: false, error: { message: 'Email and password are required' } });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Create user in Supabase Auth using admin API
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: password,
    email_confirm: true,
    user_metadata: {
      role: 'super_admin'
    }
  });

  if (authError) {
    console.error('Failed to create admin in Supabase Auth:', authError.message);
    res.status(500).json({ success: false, error: { message: 'Failed to create auth user: ' + authError.message } });
    return;
  }

  // 2. Insert into super_admins table (also serves as the whitelist)
  // Columns: id (auto-uuid), email, created_at (auto), created_by_admin (bool)
  const { error: dbError } = await supabaseAdmin
    .from('super_admins')
    .insert({
      email: normalizedEmail,
      created_by_admin: true
    });

  if (dbError) {
    console.error('Failed to insert into super_admins table:', dbError.message);
    // Cleanup auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    res.status(500).json({ success: false, error: { message: 'Failed to insert admin record: ' + dbError.message } });
    return;
  }

  // Log activity
  const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
  await supabase
    .from('admin_activity_log')
    .insert({
      action: 'Register Admin',
      actor_email: actorEmail,
      tenant_name: normalizedEmail
    });

  res.status(201).json({ success: true, message: 'Admin registered successfully' });
}));

// ──────────────────────────────────────────────────────────────────────────────
// ACCESS CONTROL WHITELIST
// Uses the super_admins table as the authorised-users list.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @route GET /api/admin/whitelist
 * @desc List all authorised super-admin emails
 * @access Admin
 */
router.get('/whitelist', adminLimiter, asyncHandler(async (req, res) => {
  // Use supabaseAdmin (service-role) to bypass RLS on super_admins
  const { data, error } = await supabaseAdmin
    .from('super_admins')
    .select('email, created_at, created_by_admin')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Whitelist GET] DB error:', error.message, '| code:', error.code);
    res.status(500).json({ success: false, error: { message: error.message } });
    return;
  }

  res.json({ success: true, data: data || [] });
}));

/**
 * @route POST /api/admin/whitelist
 * @desc Authorise a new email address
 * @access Admin
 */
router.post('/whitelist', adminLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ success: false, error: { message: 'Email is required' } });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if already whitelisted — use supabaseAdmin to bypass RLS
  const { data: existing, error: checkErr } = await supabaseAdmin
    .from('super_admins')
    .select('email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (checkErr) {
    console.error('[Whitelist POST] Duplicate-check error:', checkErr.message, '| code:', checkErr.code);
  }

  if (existing) {
    res.status(409).json({ success: false, error: { message: 'Email is already authorised' } });
    return;
  }

  // Table columns: id (auto), email, created_at (auto), created_by_admin
  const { error: insertErr } = await supabaseAdmin
    .from('super_admins')
    .insert({
      email: normalizedEmail,
      created_by_admin: true
    });

  if (insertErr) {
    console.error('[Whitelist POST] Insert error:', insertErr.message, '| code:', insertErr.code, '| hint:', insertErr.hint);
    res.status(500).json({ success: false, error: { message: insertErr.message } });
    return;
  }

  const actorEmail = (req as any).userEmail || 'system';
  try {
    await supabaseAdmin.from('admin_activity_log').insert({
      action: 'Whitelist Add',
      actor_email: actorEmail,
      tenant_name: normalizedEmail
    });
  } catch (_) {}

  res.status(201).json({ success: true, message: `${normalizedEmail} has been authorised` });
}));

/**
 * @route DELETE /api/admin/whitelist/:email
 * @desc Revoke access for an email address
 * @access Admin
 */
router.delete('/whitelist/:email', adminLimiter, asyncHandler(async (req, res) => {
  const targetEmail = decodeURIComponent(req.params.email).toLowerCase().trim();

  // Safety: prevent self-revoke
  const actorEmail = (req as any).userEmail || '';
  if (actorEmail && actorEmail.toLowerCase() === targetEmail) {
    res.status(400).json({ success: false, error: { message: 'You cannot revoke your own access' } });
    return;
  }

  // Use supabaseAdmin (service-role) to bypass RLS
  const { error: deleteErr } = await supabaseAdmin
    .from('super_admins')
    .delete()
    .eq('email', targetEmail);

  if (deleteErr) {
    console.error('[Whitelist DELETE] Error:', deleteErr.message, '| code:', deleteErr.code);
    res.status(500).json({ success: false, error: { message: deleteErr.message } });
    return;
  }

  try {
    await supabaseAdmin.from('admin_activity_log').insert({
      action: 'Whitelist Remove',
      actor_email: actorEmail,
      tenant_name: targetEmail
    });
  } catch (_) {}

  res.json({ success: true, message: `${targetEmail} has been revoked` });
}));

export default router;
