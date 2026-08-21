-- Migration: 031_create_plans_table.sql
-- Create plans table and add selected_plan and status columns to tenants

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL, -- basic | pro | enterprise
  price_monthly INTEGER NOT NULL, -- in INR (e.g. 1499, 2100, 2999)
  guest_limit INTEGER NOT NULL, -- limit of guest registrations (e.g. 500, 2500, 10000)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed plans
INSERT INTO plans (name, price_monthly, guest_limit) VALUES
  ('basic', 1499, 500),
  ('pro', 2100, 2500),
  ('enterprise', 2999, 10000)
ON CONFLICT (name) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  guest_limit = EXCLUDED.guest_limit;

-- Alter tenants table to add selected_plan and status columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS selected_plan VARCHAR(50) DEFAULT 'trial';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
