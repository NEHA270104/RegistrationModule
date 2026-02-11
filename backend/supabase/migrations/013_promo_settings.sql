-- Migration: 013_promo_settings.sql
-- Add configurable offer banner messaging and hero promo section settings

-- Offer banner messaging
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'offer_label',
    '"Early Bird Special!"',
    'string',
    'offer',
    'The offer banner title/label shown in registration modal',
    true
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'offer_description',
    '"Save on all passes"',
    'string',
    'offer',
    'The offer banner description text below the label',
    true
)
ON CONFLICT (setting_key) DO NOTHING;

-- Hero promo section
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'promo_enabled',
    'false',
    'boolean',
    'promo',
    'Toggle hero promo section visibility on registration page',
    true
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'promo_value_prop',
    '""',
    'string',
    'promo',
    'Hero promo value proposition text',
    true
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'promo_whatsapp_keyword',
    '""',
    'string',
    'promo',
    'WhatsApp keyword for promo CTA (e.g., VALENTINE)',
    true
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'promo_urgency_text',
    '""',
    'string',
    'promo',
    'Urgency line text for hero promo section',
    true
)
ON CONFLICT (setting_key) DO NOTHING;
