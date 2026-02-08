-- Migration: 011_msme_benefits.sql
-- Create msme_benefits table for "What MSME Owners Would Get" section

DROP TABLE IF EXISTS msme_benefits;

CREATE TABLE msme_benefits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT DEFAULT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for public query (active benefits sorted by order)
CREATE INDEX idx_msme_benefits_active_sort ON msme_benefits (is_active, sort_order) WHERE is_active = true;
