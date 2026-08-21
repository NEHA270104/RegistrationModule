import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Fallback pricing plans accurately matching tier specs
const FALLBACK_PLANS = [
  {
    id: 'plan_basic',
    name: 'Basic',
    price_monthly: 1,
    price_inr: 1,
    description: '3 events + email templates',
    features: [
      '3 events',
      'Email templates studio',
      'Up to 500 registrations',
      'Basic attendee database',
      'Standard support'
    ]
  },
  {
    id: 'plan_standard',
    name: 'Standard',
    price_monthly: 5,
    price_inr: 5,
    description: '10 events + email templates + advanced analytics',
    features: [
      '10 events',
      'Email templates studio',
      'Advanced analytics & exports',
      'Up to 5,000 registrations',
      'Priority attendee sync'
    ]
  },
  {
    id: 'plan_premium',
    name: 'Premium',
    price_monthly: 10,
    price_inr: 10,
    description: '50 events + email templates + advanced analytics + dynamic flyer generations',
    features: [
      '50 events',
      'Email templates studio',
      'Advanced analytics & exports',
      'Dynamic flyer generations',
      'Custom branding & domains',
      'VIP concierge support'
    ]
  }
];

/**
 * @route GET /api/public/plans
 * @desc Get all active subscription plans with server-side annual pricing
 * @access Public
 */
router.get('/plans', standardLimiter, asyncHandler(async (req, res) => {
  /**
   * Annual discount: 17% off  →  multiplier = 0.83
   * price_annual         = price_inr * 12 * 0.83   (total billed annually)
   * price_yearly_monthly = round(price_inr * 0.83)  (shown as "/month" when billed yearly)
   */
  const applyAnnualPricing = (plans: any[]): any[] =>
    plans.map(p => {
      const monthly = p.price_inr ?? p.price_monthly ?? 0;
      return {
        ...p,
        price_inr: monthly,
        price_monthly: monthly,
        price_annual: monthly === 0 ? 0 : Math.round(monthly * 12 * 0.83),
        price_yearly_monthly: monthly === 0 ? 0 : Math.round(monthly * 0.83),
        annual_discount_pct: 17,
      };
    });

  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*');

    if (error) {
      logger.warn('Error fetching subscription_plans, attempting fallback to legacy plans:', error.message);

      // Fallback 1: Try legacy plans table
      const { data: legacyData, error: legacyError } = await supabase
        .from('plans')
        .select('*')
        .order('price_monthly', { ascending: true });

      if (legacyError || !legacyData || legacyData.length === 0) {
        return res.json({ success: true, data: applyAnnualPricing(FALLBACK_PLANS) });
      }

      // Convert legacy plans to new format
      const formatted = legacyData.map(p => ({
        id: p.id,
        name: p.name.charAt(0).toUpperCase() + p.name.slice(1),
        price_monthly: p.price_monthly || 0,
        price_inr: p.price_monthly || 0,
        features: p.features || (p.name === 'basic' || p.name === 'starter'
          ? FALLBACK_PLANS[0].features
          : p.name === 'pro' || p.name === 'launchpad'
            ? FALLBACK_PLANS[1].features
            : FALLBACK_PLANS[2].features)
      }));
      return res.json({ success: true, data: applyAnnualPricing(formatted) });
    }

    if (data) {
      data.forEach((p: any) => {
        if (p.price_monthly === undefined && p.price_inr !== undefined) {
          p.price_monthly = p.price_inr;
        }
        if (p.price_inr === undefined && p.price_monthly !== undefined) {
          p.price_inr = p.price_monthly;
        }
      });
      data.sort((a: any, b: any) => {
        const priceA = a.price_inr !== undefined ? a.price_inr : 0;
        const priceB = b.price_inr !== undefined ? b.price_inr : 0;
        return priceA - priceB;
      });
    }

    return res.json({ success: true, data: applyAnnualPricing(data || FALLBACK_PLANS) });
  } catch (error) {
    logger.error('Unexpected error in GET /api/public/plans:', error);
    return res.json({ success: true, data: applyAnnualPricing(FALLBACK_PLANS) });
  }
}));


/**
 * @route GET /api/public/settings
 * @desc Get global system settings (maintenance mode, support email)
 * @access Public
 */
router.get('/settings', standardLimiter, asyncHandler(async (req, res) => {
  const defaultSettings = {
    maintenance_mode: false,
    support_email: 'support@eventregplatform.com'
  };

  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('key, value');

    if (error || !data) {
      logger.warn('Error fetching global_settings, returning defaults:', error?.message);
      return res.json({ success: true, data: defaultSettings });
    }

    const settings: Record<string, any> = { ...defaultSettings };
    data.forEach(item => {
      settings[item.key] = item.value;
    });

    return res.json({ success: true, data: settings });
  } catch (error) {
    logger.error('Unexpected error in GET /api/public/settings:', error);
    return res.json({ success: true, data: defaultSettings });
  }
}));


/**
 * @route GET /api/public/check-email
 * @desc  Check whether an email is already registered as a tenant.
 *        Used by the onboarding Step 1 form for real-time duplicate detection.
 *        Returns only a boolean — no tenant details are exposed.
 * @access Public (no auth required — called before a session exists)
 * @query  email {string} — the email address to check
 */
router.get('/check-email', standardLimiter, asyncHandler(async (req, res) => {
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      error: { message: 'A valid email address is required', code: 'VALIDATION_ERROR' },
    });
  }

  try {
    // Check the tenants table first (primary source of truth)
    const { data: tenantRow, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (tenantError) {
      logger.warn('check-email: tenants query error', { error: tenantError.message });
      // Fail open — do not block the user on a DB error
      return res.json({ success: true, exists: false });
    }

    if (tenantRow) {
      return res.json({ success: true, exists: true });
    }

    // Also verify against Supabase Auth users as a secondary check
    // (covers edge cases where the auth user was created but tenant row is missing)
    const { supabaseAdmin } = await import('../config/supabaseAdmin.js');
    const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (!authError && users) {
      const found = users.some(u => u.email?.toLowerCase() === email);
      return res.json({ success: true, exists: found });
    }

    return res.json({ success: true, exists: false });
  } catch (err) {
    logger.error('check-email error', { error: err instanceof Error ? err.message : 'Unknown' });
    // Fail open on unexpected errors so we never block a new user
    return res.json({ success: true, exists: false });
  }
}));

/**
 * @route GET /api/public/check-phone
 * @desc  Check whether a phone number is already registered as a tenant.
 *        Used by the onboarding Step 1 form for real-time duplicate detection.
 * @access Public
 * @query  phone {string} — digits only, min 10 chars
 */
router.get('/check-phone', standardLimiter, asyncHandler(async (req, res) => {
  const rawPhone = ((req.query.phone as string) || '').replace(/\D/g, '').trim();

  if (!rawPhone || rawPhone.length < 10) {
    return res.status(400).json({
      success: false,
      error: { message: 'A valid phone number (min 10 digits) is required', code: 'VALIDATION_ERROR' },
    });
  }

  try {
    // Normalise: strip leading country code variants (+91, 91) for Indian numbers
    const normalised = rawPhone.replace(/^(91)(\d{10})$/, '$2');

    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .or(`phone.eq.${rawPhone},phone.eq.+${rawPhone},phone.eq.${normalised},phone.eq.+91${normalised}`)
      .maybeSingle();

    if (error) {
      logger.warn('check-phone: tenants query error', { error: error.message });
      return res.json({ success: true, exists: false });
    }

    return res.json({ success: true, exists: !!data });
  } catch (err) {
    logger.error('check-phone error', { error: err instanceof Error ? err.message : 'Unknown' });
    return res.json({ success: true, exists: false });
  }
}));

/**
 * @route GET /api/public/events/:eventSlug
 * @desc Get public event metadata for hosted event form
 * @access Public
 */
router.get('/events/:eventSlug', standardLimiter, asyncHandler(async (req, res) => {
  const { getPublicEvent } = await import('../controllers/event.controller.js');
  return getPublicEvent(req, res);
}));

/**
 * @route POST /api/public/events/:eventSlug/register
 * @desc Public attendee registration submission & Supabase sync
 * @access Public
 */
router.post('/events/:eventSlug/register', standardLimiter, asyncHandler(async (req, res) => {
  const { registerPublicAttendee } = await import('../controllers/event.controller.js');
  return registerPublicAttendee(req, res);
}));

export default router;
