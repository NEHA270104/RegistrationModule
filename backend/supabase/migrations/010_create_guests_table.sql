-- Migration: 010_create_guests_table.sql
-- Create guests table for managing event speakers/guests

-- Drop existing table if it was partially created from a previous attempt
DROP TABLE IF EXISTS guests;

CREATE TABLE guests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    title VARCHAR(300) NOT NULL,
    bio TEXT NOT NULL,
    photo_url TEXT,
    photo_storage_path TEXT,
    session_heading VARCHAR(500) DEFAULT 'In this session, you''ll learn:',
    session_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for public query (active guests sorted by order)
CREATE INDEX idx_guests_active_sort ON guests (is_active, sort_order) WHERE is_active = true;

-- Insert the global session heading as a site_setting
INSERT INTO site_settings (setting_key, setting_value, setting_type, category, description, is_public)
VALUES (
    'guest_session_heading',
    '"In this session, you''ll learn:"',
    'string',
    'guests',
    'Default session heading displayed for all guest cards',
    true
)
ON CONFLICT (setting_key) DO NOTHING;
