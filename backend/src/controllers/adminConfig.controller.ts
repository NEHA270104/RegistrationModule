import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/admin/coupons
 * Retrieve all platform coupons
 */
export async function getCoupons(req: Request, res: Response): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('platform_coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch coupons:', error.message);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch coupons: ' + error.message }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error) {
    logger.error('Unexpected error in getCoupons:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while fetching coupons' }
    });
  }
}

/**
 * POST /api/admin/coupons
 * Create a new platform coupon
 */
export async function createCoupon(req: Request, res: Response): Promise<void> {
  try {
    const { code, discount_percent, expiry_date } = req.body;

    if (!code || discount_percent === undefined || !expiry_date) {
      res.status(400).json({
        success: false,
        error: { message: 'code, discount_percent, and expiry_date are required' }
      });
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
      logger.error('Failed to create coupon:', error.message);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to create coupon: ' + error.message }
      });
      return;
    }

    // Log admin activity
    try {
      const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
      await supabase
        .from('admin_activity_log')
        .insert({
          action: 'Create Coupon',
          actor_email: actorEmail,
          tenant_name: code.toUpperCase()
        });
    } catch (logErr: any) {
      logger.warn('Failed to log coupon creation activity:', logErr.message);
    }

    res.status(201).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Unexpected error in createCoupon:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while creating coupon' }
    });
  }
}

/**
 * GET /api/admin/global-settings
 * Retrieve all global settings keys & values
 */
export async function getGlobalSettings(req: Request, res: Response): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('*');

    if (error) {
      logger.error('Failed to fetch global settings:', error.message);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch global settings: ' + error.message }
      });
      return;
    }

    const settings: Record<string, any> = {};
    (data || []).forEach(item => {
      settings[item.key] = item.value;
    });

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Unexpected error in getGlobalSettings:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while fetching global settings' }
    });
  }
}

/**
 * POST /api/admin/global-settings
 * Update multiple global settings keys
 */
export async function updateGlobalSettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({
        success: false,
        error: { message: 'Settings object is required' }
      });
      return;
    }

    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      const { data, error } = await supabase
        .from('global_settings')
        .upsert({
          key,
          value,
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        logger.error(`Failed to upsert global setting ${key}:`, error.message);
        res.status(500).json({
          success: false,
          error: { message: `Failed to update global setting ${key}: ` + error.message }
        });
        return;
      }
      results.push(data);
    }

    // Log admin activity
    try {
      const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
      await supabase
        .from('admin_activity_log')
        .insert({
          action: 'Update Global Settings',
          actor_email: actorEmail
        });
    } catch (logErr: any) {
      logger.warn('Failed to log global settings update activity:', logErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Global settings updated successfully',
      data: results
    });
  } catch (error) {
    logger.error('Unexpected error in updateGlobalSettings:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while updating global settings' }
    });
  }
}
