import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface SiteSetting {
  id: string;
  setting_key: string;
  setting_value: unknown;
  setting_type: string;
  category: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface SettingUpdate {
  key: string;
  value: unknown;
}

export class SettingsService {
  /**
   * Get all public settings (for frontend config)
   */
  async getPublicSettings(): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('setting_key, setting_value, setting_type')
        .eq('is_public', true);

      if (error) {
        logger.error('Error fetching public settings', { error: error.message });
        throw new AppError('Failed to fetch settings', 500, 'SETTINGS_FETCH_ERROR');
      }

      // Convert to key-value object
      const settings: Record<string, unknown> = {};
      for (const setting of data || []) {
        // Parse the JSON value based on type
        settings[setting.setting_key] = setting.setting_value;
      }

      return settings;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getPublicSettings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get all settings (for admin)
   */
  async getAllSettings(): Promise<SiteSetting[]> {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .order('category')
        .order('setting_key');

      if (error) {
        logger.error('Error fetching all settings', { error: error.message });
        throw new AppError('Failed to fetch settings', 500, 'SETTINGS_FETCH_ERROR');
      }

      return data as SiteSetting[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getAllSettings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get settings by category (for admin)
   */
  async getSettingsByCategory(category: string): Promise<SiteSetting[]> {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('category', category)
        .order('setting_key');

      if (error) {
        logger.error('Error fetching settings by category', { category, error: error.message });
        throw new AppError('Failed to fetch settings', 500, 'SETTINGS_FETCH_ERROR');
      }

      return data as SiteSetting[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get a single setting
   */
  async getSetting(key: string): Promise<SiteSetting | null> {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('setting_key', key)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Error fetching setting', { key, error: error.message });
        throw new AppError('Failed to fetch setting', 500, 'SETTING_FETCH_ERROR');
      }

      return data as SiteSetting;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update a single setting
   */
  async updateSetting(
    key: string,
    value: unknown,
    adminIdentifier?: string,
    ipAddress?: string
  ): Promise<SiteSetting> {
    try {
      // Get the current value for logging
      const currentSetting = await this.getSetting(key);
      if (!currentSetting) {
        throw new AppError(`Setting '${key}' not found`, 404, 'SETTING_NOT_FOUND');
      }

      const oldValue = currentSetting.setting_value;

      // Update the setting
      const { data, error } = await supabase
        .from('site_settings')
        .update({
          setting_value: value,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', key)
        .select()
        .single();

      if (error) {
        logger.error('Error updating setting', { key, error: error.message });
        throw new AppError('Failed to update setting', 500, 'SETTING_UPDATE_ERROR');
      }

      // Log the change
      await this.logSettingChange(key, oldValue, value, adminIdentifier, ipAddress);

      logger.info('Setting updated', {
        key,
        oldValue,
        newValue: value,
        updatedBy: adminIdentifier,
      });

      return data as SiteSetting;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in updateSetting', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(
    updates: SettingUpdate[],
    adminIdentifier?: string,
    ipAddress?: string
  ): Promise<SiteSetting[]> {
    const results: SiteSetting[] = [];

    for (const update of updates) {
      const result = await this.updateSetting(update.key, update.value, adminIdentifier, ipAddress);
      results.push(result);
    }

    return results;
  }

  /**
   * Log a setting change
   */
  private async logSettingChange(
    key: string,
    oldValue: unknown,
    newValue: unknown,
    changedBy?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      await supabase.from('settings_change_log').insert({
        setting_key: key,
        old_value: oldValue,
        new_value: newValue,
        changed_by: changedBy,
        ip_address: ipAddress,
      });
    } catch (error) {
      // Don't throw on log failure, just warn
      logger.warn('Failed to log setting change', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get settings change history
   */
  async getSettingsHistory(limit = 50): Promise<unknown[]> {
    try {
      const { data, error } = await supabase
        .from('settings_change_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching settings history', { error: error.message });
        throw new AppError('Failed to fetch settings history', 500, 'HISTORY_FETCH_ERROR');
      }

      return data || [];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get offer configuration (convenience method)
   */
  async getOfferConfig(): Promise<{
    startDate: string;
    durationDays: number;
    discountAmount: number;
    discountVip: number;
    discountStandard: number;
    discountBasic: number;
    isActive: boolean;
  }> {
    const settings = await this.getPublicSettings();

    // Default discount amount for backward compatibility
    const defaultDiscount = settings.offer_discount_amount as number || 1000;

    return {
      startDate: settings.offer_start_date as string || '2026-01-26T00:00:00+05:30',
      durationDays: settings.offer_duration_days as number || 3,
      discountAmount: defaultDiscount,
      // Tier-specific discounts (fall back to default if not set)
      discountVip: settings.offer_discount_vip as number || defaultDiscount,
      discountStandard: settings.offer_discount_standard as number || defaultDiscount,
      discountBasic: settings.offer_discount_basic as number || defaultDiscount,
      isActive: settings.offer_is_active as boolean ?? true,
    };
  }

  /**
   * Update offer dates (convenience method)
   */
  async updateOfferDates(
    startDate: string,
    durationDays: number,
    adminIdentifier?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.updateSettings(
      [
        { key: 'offer_start_date', value: startDate },
        { key: 'offer_duration_days', value: durationDays },
      ],
      adminIdentifier,
      ipAddress
    );
  }

  /**
   * Toggle offer active status
   */
  async toggleOffer(
    isActive: boolean,
    adminIdentifier?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.updateSetting('offer_is_active', isActive, adminIdentifier, ipAddress);
  }
}

export const settingsService = new SettingsService();
