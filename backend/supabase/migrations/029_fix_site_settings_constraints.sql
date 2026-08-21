-- Migration: 029_fix_site_settings_constraints.sql
-- Fix UNIQUE constraints to allow multi-tenant settings and seat inventory

-- 1. site_settings constraints
-- Drop the single-column unique constraint on setting_key (which would prevent different tenants from having the same setting)
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_setting_key_key;
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_setting_key_idx;

-- Add a composite UNIQUE constraint on (tenant_id, setting_key) to isolate settings per tenant
ALTER TABLE site_settings ADD CONSTRAINT site_settings_tenant_id_setting_key_key UNIQUE (tenant_id, setting_key);

-- 2. seat_inventory constraints
-- Drop the single-column unique constraint on tier_name
ALTER TABLE seat_inventory DROP CONSTRAINT IF EXISTS seat_inventory_tier_name_key;
ALTER TABLE seat_inventory DROP CONSTRAINT IF EXISTS seat_inventory_tier_name_idx;

-- Add a composite UNIQUE constraint on (tenant_id, tier_name) to isolate tiers per tenant
ALTER TABLE seat_inventory ADD CONSTRAINT seat_inventory_tenant_id_tier_name_key UNIQUE (tenant_id, tier_name);
