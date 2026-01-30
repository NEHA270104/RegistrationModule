    -- ============================================
    -- Add Support Contact Settings
    -- ============================================
    -- Adds admin-configurable support email and phone

    -- Insert support contact settings
    INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public) VALUES
    ('support_email', '"support@bizflowai.in"', 'string', 'support', 'Support email address', true),
    ('support_phone', '"+91 8188050895"', 'string', 'support', 'Support phone number', true),
    ('support_whatsapp', '"918188050895"', 'string', 'support', 'WhatsApp number (digits only for wa.me link)', true)
    ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW();

    -- Update event settings to correct values
    UPDATE site_settings SET setting_value = '"21st February 2026"', updated_at = NOW() WHERE setting_key = 'event_date';
    UPDATE site_settings SET setting_value = '"9:00 AM - 5:00 PM IST"', updated_at = NOW() WHERE setting_key = 'event_time';
    UPDATE site_settings SET setting_value = '"TBD soon"', updated_at = NOW() WHERE setting_key = 'event_venue';
