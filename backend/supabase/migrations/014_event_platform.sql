-- Migration: 014_event_platform.sql
-- Add configurable event platform name and visibility toggle

INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'event_platform',
    '"Zoom"',
    'string',
    'event',
    'Event platform name (e.g., Zoom, Google Meet, Offline)',
    true
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'event_platform_visible',
    'true',
    'boolean',
    'event',
    'Toggle visibility of event platform info on registration page',
    true
)
ON CONFLICT (setting_key) DO NOTHING;
