import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service.js';
import { logger } from '../utils/logger.js';

/**
 * Get public settings (for frontend dynamic config)
 * Public endpoint - no authentication required
 */
export async function getPublicSettings(req: Request, res: Response): Promise<void> {
  const settings = await settingsService.getPublicSettings();

  // Transform into frontend-friendly format
  const config = {
    offer: {
      startDate: settings.offer_start_date,
      durationDays: settings.offer_duration_days,
      discountAmount: settings.offer_discount_amount,
      isActive: settings.offer_is_active,
    },
    event: {
      name: settings.event_name,
      date: settings.event_date,
      time: settings.event_time,
      venue: settings.event_venue,
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

  const results = await settingsService.updateSettings(updates, adminIdentifier, ipAddress);

  logger.info('Multiple settings updated via API', {
    count: updates.length,
    keys: updates.map((u: { key: string }) => u.key),
    adminIdentifier,
  });

  res.json({
    success: true,
    updated: results.length,
    settings: results,
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

  const results = await settingsService.updateSettings(updates, adminIdentifier, ipAddress);

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
