import { Router, Response } from 'express';
import { tenantAuth, TenantRequest } from '../middleware/tenantAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import seatsRouter from './seats.routes.js';
import paymentRouter from './payment.routes.js';
import registrationRouter from './registration.routes.js';
import waitlistRouter from './waitlist.routes.js';
import adminRouter from './admin.routes.js';
import settingsRouter from './settings.routes.js';
import guestRouter from './guest.routes.js';
import msmeBenefitRouter from './msmeBenefit.routes.js';
import authRouter from './auth.routes.js';
import tenantRouter from './tenant.routes.js';
import superAdminRouter from './superAdmin.routes.js';
import ssoRouter from './sso.routes.js';
import agentStudioRouter from './agentStudio.routes.js';
import { authService } from '../services/auth.service.js';
import { tenantService } from '../services/tenant.service.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { subscriptionService } from '../services/subscription.service.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ============================================
// Legacy single-tenant API routes (backward compatible)
// ============================================
router.use('/seats', seatsRouter);
router.use('/', paymentRouter);
router.use('/registration', registrationRouter);
router.use('/waitlist', waitlistRouter);
router.use('/admin', adminRouter);
router.use('/settings', settingsRouter);
router.use('/guests', guestRouter);
router.use('/msme-benefits', msmeBenefitRouter);

// ============================================
// Multi-tenant API routes
// ============================================
router.use('/auth', authRouter);
router.use('/t', tenantRouter);
router.use('/super-admin', superAdminRouter);

// ============================================
// Onboarding Account Route
// ============================================
router.post('/onboarding/account', asyncHandler(async (req, res) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { 
    email, 
    password, 
    confirmPassword, 
    name, 
    company_name, 
    phone, 
    website, 
    industry, 
    plan, 
    billing_cycle, 
    referral_code, 
    slug, 
    termsOfService, 
    dataProcessing,
    job_title,
    bio,
    order_id
  } = body || {};

  if (!email || !password || !name || !company_name) {
    res.status(400).json({
      success: false,
      error: { message: 'Email, password, name, and company_name are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      success: false,
      error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const emailClean = email.toLowerCase().trim();
  const result = await authService.signup({
    email: emailClean,
    password,
    name,
    company_name,
    phone,
    referral_code,
    industry,
    job_title,
    bio
  });

  if (order_id) {
    try {
      const newTenantId = result.tenant.id;
      
      // 1. Update payments table to change tenant_id to the new tenant's ID
      await supabaseAdmin
        .from('payments')
        .update({ tenant_id: newTenantId })
        .eq('order_id', order_id);

      // 2. Fetch pending order details to get the plan and billing cycle purchased
      const { data: pendingOrder } = await supabaseAdmin
        .from('pending_orders')
        .select('*')
        .eq('razorpay_order_id', order_id)
        .maybeSingle();

      if (pendingOrder) {
        const purchasedPlan = pendingOrder.tier.toLowerCase();
        const purchasedBillingCycle = pendingOrder.metadata?.billing_cycle || 'monthly';
        
        // 3. Activate the chosen plan via subscriptionService
        await subscriptionService.changePlan(newTenantId, purchasedPlan, purchasedBillingCycle);
        
        // 4. Update pending_orders metadata to point to the actual tenant_id
        const updatedMetadata = {
          ...pendingOrder.metadata,
          tenant_id: newTenantId
        };
        await supabaseAdmin
          .from('pending_orders')
          .update({ metadata: updatedMetadata })
          .eq('razorpay_order_id', order_id);
        
        // 5. Update tenants status to active/premium
        await supabaseAdmin
          .from('tenants')
          .update({ status: 'premium' })
          .eq('id', newTenantId);
      }
    } catch (err) {
      logger.error('Error linking payment/activating plan on onboarding signup:', {
        order_id,
        error: err instanceof Error ? err.message : 'Unknown'
      });
    }
  }

  res.status(201).json({ success: true, data: result });
}));

// ============================================
// Onboarding Profile Route
// ============================================
router.post('/onboarding/profile', tenantAuth, asyncHandler(async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId!;
  const userId = req.userId!;
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { job_title, bio, logo_url, custom_domain } = body || {};

  // Update tenant table (avatar logo_url and website custom_domain)
  await tenantService.update(tenantId, {
    logo_url: logo_url || undefined,
    custom_domain: custom_domain || undefined
  });

  // Update Supabase Auth user metadata (job_title and bio)
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      job_title: job_title || '',
      bio: bio || ''
    }
  });

  res.json({ success: true });
}));

// ============================================
// Agent Studio integration routes
// ============================================
router.use('/sso', ssoRouter);
router.use('/', agentStudioRouter);

// ============================================
// Tenant Status Route
// ============================================
router.get('/tenant/status', tenantAuth, asyncHandler(async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;

  if (!tenantId) {
    res.status(403).json({
      success: false,
      error: { message: 'No tenant associated with this token', code: 'NO_TENANT' },
    });
    return;
  }

  // Fetch real subscription state from DB instead of returning a hardcoded value
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('slug, subscription_status, subscription_plan, is_active, status')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !tenant) {
    logger.warn('GET /tenant/status: tenant not found', { tenantId });
    res.status(404).json({
      success: false,
      error: { message: 'Tenant not found', code: 'TENANT_NOT_FOUND' },
    });
    return;
  }

  // Normalise: prefer subscription_status column, fall back to legacy status column
  const PAID_STATUSES = new Set(['active', 'trialing', 'past_due', 'premium']);
  const subStatus: string = tenant.subscription_status || tenant.status || 'inactive';
  const isPaid = PAID_STATUSES.has(subStatus.toLowerCase());

  res.json({
    success: true,
    data: {
      status: subStatus,
      subscription_plan: tenant.subscription_plan || null,
      is_active: tenant.is_active ?? isPaid,
      is_paid: isPaid,
      slug: tenant.slug,
    },
  });
}));


// ============================================
// Dashboard Notifications Routes
// ============================================
router.get('/dashboard/notifications', tenantAuth, asyncHandler(async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;
  const { data, error } = await supabase
    .from('platform_notifications')
    .select('*')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch dashboard notifications:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to fetch notifications: ' + error.message } });
    return;
  }

  res.json({ success: true, data: data || [] });
}));

router.post('/dashboard/notifications/read-all', tenantAuth, asyncHandler(async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId;

  const { data, error } = await supabase
    .from('platform_notifications')
    .update({ is_read: true })
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

  if (error) {
    logger.error('Failed to mark dashboard notifications read:', error.message);
    res.status(500).json({ success: false, error: { message: 'Failed to mark notifications read: ' + error.message } });
    return;
  }

  res.json({ success: true, message: 'All notifications marked as read' });
}));

export default router;
