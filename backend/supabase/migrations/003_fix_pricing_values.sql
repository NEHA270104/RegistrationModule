-- ============================================
-- Fix Pricing Values Migration
-- Run this to update incorrect pricing in existing database
-- ============================================

-- Update offer dates (27-30 Jan 2026)
UPDATE site_settings SET setting_value = '"2026-01-27T00:00:00+05:30"', updated_at = NOW()
WHERE setting_key = 'offer_start_date';

UPDATE site_settings SET setting_value = '4', updated_at = NOW()
WHERE setting_key = 'offer_duration_days';

-- Update tier original prices to correct values
UPDATE site_settings SET setting_value = '4999', updated_at = NOW()
WHERE setting_key = 'tier_vip_original_price';

UPDATE site_settings SET setting_value = '2999', updated_at = NOW()
WHERE setting_key = 'tier_standard_original_price';

-- Verify the updates
SELECT setting_key, setting_value, updated_at
FROM site_settings
WHERE setting_key IN (
    'offer_start_date',
    'offer_duration_days',
    'tier_vip_original_price',
    'tier_vip_offer_price',
    'tier_standard_original_price',
    'tier_standard_offer_price',
    'tier_basic_original_price',
    'tier_basic_offer_price'
)
ORDER BY setting_key;
