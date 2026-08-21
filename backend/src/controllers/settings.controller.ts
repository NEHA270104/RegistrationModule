import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service.js';
import { seatService } from '../services/seat.service.js';
import { guestService } from '../services/guest.service.js';
import { msmeBenefitService } from '../services/msmeBenefit.service.js';
import { openAIService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';
import type { TierType } from '../types/index.js';

/**
 * Get public settings (for frontend dynamic config)
 * Public endpoint - no authentication required
 */
export async function getPublicSettings(req: Request, res: Response): Promise<void> {
  const settings = await settingsService.getPublicSettings();

  // Transform into frontend-friendly format
  // Default discount for backward compatibility
  const defaultDiscount = settings.offer_discount_amount || 1000;

  const config = {
    offer: {
      startDate: settings.offer_start_date,
      durationDays: settings.offer_duration_days,
      discountAmount: defaultDiscount,
      // Tier-specific discounts
      discountVip: settings.offer_discount_vip || defaultDiscount,
      discountStandard: settings.offer_discount_standard || defaultDiscount,
      discountBasic: settings.offer_discount_basic || defaultDiscount,
      isActive: settings.offer_is_active,
      label: settings.offer_label,
      description: settings.offer_description,
    },
    promo: {
      enabled: settings.promo_enabled,
      valueProp: settings.promo_value_prop,
      whatsappKeyword: settings.promo_whatsapp_keyword,
      urgencyText: settings.promo_urgency_text,
    },
    event: {
      name: settings.event_name,
      date: settings.event_date,
      time: settings.event_time,
      venue: settings.event_venue,
      platform: settings.event_platform,
      platformVisible: settings.event_platform_visible,
    },
    support: {
      email: settings.support_email,
      phone: settings.support_phone,
      whatsapp: settings.support_whatsapp,
    },
    registration: {
      isOpen: settings.registration_open,
      closeDate: settings.registration_close_date,
      waitlistEnabled: settings.waitlist_enabled,
    },
    pricing: {
      vip: {
        offerPrice: settings.tier_vip_offer_price,
        originalPrice: settings.tier_vip_original_price,
      },
      standard: {
        offerPrice: settings.tier_standard_offer_price,
        originalPrice: settings.tier_standard_original_price,
      },
      basic: {
        offerPrice: settings.tier_basic_offer_price,
        originalPrice: settings.tier_basic_original_price,
      },
      waitlist: {
        price: settings.tier_waitlist_price,
      },
    },
    display: {
      showLiveCounter: settings.show_live_counter,
      showOfferBanner: settings.show_offer_banner,
      seatPollInterval: settings.seat_poll_interval,
    },
  };

  // Fetch active guests for the speakers section
  try {
    const guests = await guestService.getActiveGuests();
    (config as Record<string, unknown>).guests = guests.map(g => ({
      id: g.id,
      name: g.name,
      title: g.title,
      bio: g.bio,
      photo_url: g.photo_url,
      session_heading: g.session_heading,
      session_points: g.session_points,
      sort_order: g.sort_order,
    }));
  } catch (error) {
    logger.warn('Failed to fetch guests for public settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    (config as Record<string, unknown>).guests = [];
  }

  // Fetch active MSME benefits
  try {
    const benefits = await msmeBenefitService.getActiveBenefits();
    (config as Record<string, unknown>).msmeBenefits = benefits.map(b => ({
      id: b.id,
      title: b.title,
      description: b.description,
      icon: b.icon,
      sort_order: b.sort_order,
    }));
  } catch (error) {
    logger.warn('Failed to fetch MSME benefits for public settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    (config as Record<string, unknown>).msmeBenefits = [];
  }

  res.json(config);
}

/**
 * Get all settings (admin only)
 */
export async function getAllSettings(req: Request, res: Response): Promise<void> {
  const settings = await settingsService.getAllSettings();

  // Group by category
  const grouped: Record<string, typeof settings> = {};
  for (const setting of settings) {
    if (!grouped[setting.category]) {
      grouped[setting.category] = [];
    }
    grouped[setting.category].push(setting);
  }

  res.json({
    settings,
    grouped,
    categories: Object.keys(grouped),
  });
}

/**
 * Get settings by category (admin only)
 */
export async function getSettingsByCategory(req: Request, res: Response): Promise<void> {
  const { category } = req.params;
  const settings = await settingsService.getSettingsByCategory(category);

  res.json({ settings });
}

/**
 * Update a single setting (admin only)
 */
export async function updateSetting(req: Request, res: Response): Promise<void> {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    res.status(400).json({ error: { message: 'Value is required' } });
    return;
  }

  const adminIdentifier = req.headers['x-api-key'] as string || 'unknown';
  const ipAddress = req.ip || req.socket.remoteAddress;

  const updated = await settingsService.updateSetting(key, value, adminIdentifier, ipAddress);

  logger.info('Setting updated via API', { key, adminIdentifier });

  res.json({
    success: true,
    setting: updated,
  });
}

/**
 * Update multiple settings (admin only)
 */
export async function updateSettings(req: Request, res: Response): Promise<void> {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: { message: 'Updates array is required' } });
    return;
  }

  // Validate each update
  for (const update of updates) {
    if (!update.key || update.value === undefined) {
      res.status(400).json({
        error: { message: `Invalid update: each update must have 'key' and 'value'` },
      });
      return;
    }
  }

  const adminIdentifier = req.headers['x-api-key'] as string || 'unknown';
  const ipAddress = req.ip || req.socket.remoteAddress;

  // Separate seat capacity keys (these go to seat_inventory, not site_settings)
  const seatCapacityKeyPrefix = 'total_seats_';
  const settingUpdates = updates.filter((u: { key: string }) => !u.key.startsWith(seatCapacityKeyPrefix));
  const seatCapacityUpdates = updates.filter((u: { key: string }) => u.key.startsWith(seatCapacityKeyPrefix));

  const results = settingUpdates.length > 0
    ? await settingsService.updateSettings(settingUpdates, adminIdentifier, ipAddress)
    : [];

  // Sync tier pricing to seat_inventory when offer prices are updated
  // This ensures the actual payment price matches the display price
  const pricingKeys: Record<string, TierType> = {
    'tier_vip_offer_price': 'vip',
    'tier_standard_offer_price': 'standard',
    'tier_basic_offer_price': 'basic',
    'tier_waitlist_price': 'waitlist',
  };

  const pricingSyncErrors: string[] = [];
  for (const update of updates) {
    const tier = pricingKeys[update.key];
    if (tier && typeof update.value === 'number') {
      try {
        await seatService.updateTierPrice(tier, update.value);
        logger.info('Seat inventory price synced via batch update', { tier, priceInr: update.value });
      } catch (error) {
        const errorMsg = `Failed to sync ${tier} price to seat_inventory`;
        logger.error(errorMsg, { error: error instanceof Error ? error.message : 'Unknown error' });
        pricingSyncErrors.push(errorMsg);
      }
    }
  }

  // Sync total_seats to seat_inventory when seat capacity is updated
  const seatsKeys: Record<string, TierType> = {
    'total_seats_vip': 'vip',
    'total_seats_standard': 'standard',
    'total_seats_basic': 'basic',
  };

  for (const update of seatCapacityUpdates) {
    const tier = seatsKeys[update.key];
    if (tier && typeof update.value === 'number') {
      try {
        await seatService.updateTotalSeats(tier, update.value);
        logger.info('Seat capacity synced via batch update', { tier, totalSeats: update.value });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : `Failed to sync ${tier} seat capacity`;
        logger.error(errorMsg, { error: error instanceof Error ? error.message : 'Unknown error' });
        pricingSyncErrors.push(errorMsg);
      }
    }
  }

  logger.info('Multiple settings updated via API', {
    count: updates.length,
    keys: updates.map((u: { key: string }) => u.key),
    adminIdentifier,
  });

  res.json({
    success: true,
    updated: results.length,
    settings: results,
    ...(pricingSyncErrors.length > 0 && { warnings: pricingSyncErrors }),
  });
}

/**
 * Update offer configuration (admin only)
 * Convenience endpoint for offer settings
 */
export async function updateOfferConfig(req: Request, res: Response): Promise<void> {
  const { startDate, durationDays, discountAmount, isActive } = req.body;

  const updates: { key: string; value: unknown }[] = [];

  if (startDate !== undefined) {
    updates.push({ key: 'offer_start_date', value: startDate });
  }
  if (durationDays !== undefined) {
    updates.push({ key: 'offer_duration_days', value: durationDays });
  }
  if (discountAmount !== undefined) {
    updates.push({ key: 'offer_discount_amount', value: discountAmount });
  }
  if (isActive !== undefined) {
    updates.push({ key: 'offer_is_active', value: isActive });
  }

  if (updates.length === 0) {
    res.status(400).json({ error: { message: 'No valid offer settings provided' } });
    return;
  }

  const adminIdentifier = req.headers['x-api-key'] as string || 'unknown';
  const ipAddress = req.ip || req.socket.remoteAddress;

  const results = await settingsService.updateSettings(updates, adminIdentifier, ipAddress);

  logger.info('Offer configuration updated', {
    updates: updates.map((u) => u.key),
    adminIdentifier,
  });

  res.json({
    success: true,
    message: 'Offer configuration updated',
    settings: results,
  });
}

/**
 * Update tier pricing (admin only)
 * This updates both display settings AND the actual payment price in seat_inventory
 */
export async function updateTierPricing(req: Request, res: Response): Promise<void> {
  const { tier } = req.params;
  const { offerPrice, originalPrice } = req.body;

  const validTiers = ['vip', 'standard', 'basic', 'waitlist'];
  if (!validTiers.includes(tier)) {
    res.status(400).json({ error: { message: 'Invalid tier' } });
    return;
  }

  const updates: { key: string; value: unknown }[] = [];

  if (tier === 'waitlist') {
    if (offerPrice !== undefined) {
      updates.push({ key: 'tier_waitlist_price', value: offerPrice });
    }
  } else {
    if (offerPrice !== undefined) {
      updates.push({ key: `tier_${tier}_offer_price`, value: offerPrice });
    }
    if (originalPrice !== undefined) {
      updates.push({ key: `tier_${tier}_original_price`, value: originalPrice });
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: { message: 'No pricing values provided' } });
    return;
  }

  const adminIdentifier = req.headers['x-api-key'] as string || 'unknown';
  const ipAddress = req.ip || req.socket.remoteAddress;

  // Update display settings in site_settings table
  const results = await settingsService.updateSettings(updates, adminIdentifier, ipAddress);

  // IMPORTANT: Also update the actual payment price in seat_inventory
  // This ensures the price charged via Razorpay matches the displayed offer price
  if (offerPrice !== undefined) {
    try {
      await seatService.updateTierPrice(tier as TierType, offerPrice);
      logger.info('Seat inventory price synced with tier pricing', { tier, priceInr: offerPrice });
    } catch (error) {
      logger.error('Failed to sync seat inventory price', {
        tier,
        offerPrice,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Still return success for settings update, but warn about sync failure
      res.json({
        success: true,
        message: `${tier} pricing updated (warning: seat inventory sync failed)`,
        settings: results,
        warning: 'Display price updated but payment price sync failed. Please check seat_inventory table.',
      });
      return;
    }
  }

  logger.info('Tier pricing updated', { tier, adminIdentifier });

  res.json({
    success: true,
    message: `${tier} pricing updated`,
    settings: results,
  });
}

/**
 * Get settings change history (admin only)
 */
export async function getSettingsHistory(req: Request, res: Response): Promise<void> {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = await settingsService.getSettingsHistory(limit);

  res.json({ history });
}

/**
 * Generate AI promo suggestions (admin only)
 */
export async function aiGeneratePromo(req: Request, res: Response): Promise<void> {
  const { occasion } = req.body;

  if (!occasion || !occasion.trim()) {
    res.status(400).json({
      success: false,
      error: { message: 'Occasion/theme is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const suggestions = await openAIService.generatePromoSuggestions(occasion.trim());

  logger.info('AI promo suggestions generated', { occasion: occasion.trim(), count: suggestions.length });
  res.json({ success: true, data: { suggestions, occasion: occasion.trim() } });
}
