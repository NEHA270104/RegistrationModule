-- ============================================
-- Settings Table Migration
-- For dynamic configuration management
-- ============================================

-- ============================================
-- Site Settings Table
-- ============================================
CREATE TABLE site_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) NOT NULL DEFAULT 'string', -- string, number, boolean, date, json
    category VARCHAR(50) NOT NULL DEFAULT 'general', -- offer, event, registration, display
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- If true, can be fetched by public API
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_site_settings_key ON site_settings(setting_key);
CREATE INDEX idx_site_settings_category ON site_settings(category);
CREATE INDEX idx_site_settings_public ON site_settings(is_public) WHERE is_public = true;

-- Trigger for updated_at
CREATE TRIGGER update_site_settings_updated_at
    BEFORE UPDATE ON site_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on site_settings"
    ON site_settings FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Anon can read public settings"
    ON site_settings FOR SELECT
    USING (is_public = true);

-- ============================================
-- Insert Default Settings
-- ============================================

-- Offer Settings
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
('offer_start_date', '"2026-01-26T00:00:00+05:30"', 'date', 'offer', 'Start date of the early bird offer (ISO 8601 format)', true),
('offer_duration_days', '3', 'number', 'offer', 'Number of days the offer runs', true),
('offer_discount_amount', '1000', 'number', 'offer', 'Discount amount in INR', true),
('offer_is_active', 'true', 'boolean', 'offer', 'Toggle offer on/off', true);

-- Event Settings
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
('event_name', '"AI for MSME Business Summit 2026"', 'string', 'event', 'Name of the event', true),
('event_date', '"7th Feb 2026"', 'string', 'event', 'Event date display string', true),
('event_time', '"10:00 AM - 5:00 PM IST"', 'string', 'event', 'Event time display string', true),
('event_venue', '"Ashish Plaza, opposite Fergusson college campus road, Shivajinagar, Pune, Maharashtra 411004"', 'string', 'event', 'Event venue address', true);

-- Registration Settings
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
('registration_open', 'true', 'boolean', 'registration', 'Is registration currently open', true),
('registration_close_date', '"2026-02-06T23:59:59+05:30"', 'date', 'registration', 'Date when registration closes', true),
('waitlist_enabled', 'true', 'boolean', 'registration', 'Allow waitlist signup when sold out', true);

-- Tier Pricing Settings (offer prices - original prices are in seat_inventory)
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
('tier_vip_offer_price', '2499', 'number', 'pricing', 'VIP tier offer price in INR', true),
('tier_vip_original_price', '3499', 'number', 'pricing', 'VIP tier original price in INR', true),
('tier_standard_offer_price', '1499', 'number', 'pricing', 'Standard tier offer price in INR', true),
('tier_standard_original_price', '2499', 'number', 'pricing', 'Standard tier original price in INR', true),
('tier_basic_offer_price', '999', 'number', 'pricing', 'Basic tier offer price in INR', true),
('tier_basic_original_price', '1999', 'number', 'pricing', 'Basic tier original price in INR', true),
('tier_waitlist_price', '699', 'number', 'pricing', 'Waitlist/Livestream price in INR', true);

-- Display Settings
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
('show_live_counter', 'true', 'boolean', 'display', 'Show live seat counter', true),
('show_offer_banner', 'true', 'boolean', 'display', 'Show offer countdown banner', true),
('seat_poll_interval', '30000', 'number', 'display', 'Seat polling interval in milliseconds', true);

-- ============================================
-- Function to get all public settings
-- ============================================
CREATE OR REPLACE FUNCTION get_public_settings()
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}';
    setting RECORD;
BEGIN
    FOR setting IN
        SELECT setting_key, setting_value, setting_type
        FROM site_settings
        WHERE is_public = true
    LOOP
        result := result || jsonb_build_object(setting.setting_key, setting.setting_value);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function to update a setting
-- ============================================
CREATE OR REPLACE FUNCTION update_setting(
    p_key VARCHAR(100),
    p_value JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_old_value JSONB;
BEGIN
    SELECT setting_value INTO v_old_value
    FROM site_settings
    WHERE setting_key = p_key;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Setting not found');
    END IF;

    UPDATE site_settings
    SET setting_value = p_value,
        updated_at = NOW()
    WHERE setting_key = p_key;

    RETURN jsonb_build_object(
        'success', true,
        'old_value', v_old_value,
        'new_value', p_value
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Settings Change Log
-- ============================================
CREATE TABLE settings_change_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by VARCHAR(255),
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_log_key ON settings_change_log(setting_key);
CREATE INDEX idx_settings_log_created ON settings_change_log(created_at DESC);

-- RLS for settings change log
ALTER TABLE settings_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on settings_change_log"
    ON settings_change_log FOR ALL
    USING (auth.role() = 'service_role');
