-- ============================================
-- Add Tier-Specific Discount Settings
-- ============================================
-- Adds separate discount amounts for each tier in the Early Bird offer

-- Insert tier-specific discount settings
-- Default to 1000 INR (same as original offer_discount_amount)
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
('offer_discount_vip', '2499', 'number', 'offer', 'VIP tier discount amount in INR (Executive Experience)', true),
('offer_discount_standard', '1499', 'number', 'offer', 'Standard tier discount amount in INR (Business Builder)', true),
('offer_discount_basic', '999', 'number', 'offer', 'Basic tier discount amount in INR (Growth Starter)', true)
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();

-- Note: Waitlist/Livestream tier typically doesn't have a discount
-- The original offer_discount_amount is kept for backward compatibility
