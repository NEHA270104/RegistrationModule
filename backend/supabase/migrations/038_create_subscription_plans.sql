-- Migration: 038_create_subscription_plans.sql
-- Create subscription_plans and global_settings tables, and add added_by_admin to tenants.

-- 1. Add added_by_admin column to tenants table if not exists
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS added_by_admin BOOLEAN DEFAULT false;

-- 2. Create subscription_plans table
DROP TABLE IF EXISTS subscription_plans CASCADE;
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  price_monthly INTEGER NOT NULL, -- in INR, e.g. 1999
  features TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default plans
INSERT INTO subscription_plans (name, price_monthly, features) VALUES
  ('Starter', 0, ARRAY['1 event', 'Up to 50 registrations', 'Basic dashboard', 'Email confirmations', 'Standard support']),
  ('LaunchPad', 1999, ARRAY['1 concurrent event', 'Up to 500 registrations', 'Full analytics dashboard', 'Email notifications', 'Custom branding', 'Standard support']),
  ('ScaleUp Pro', 4999, ARRAY['Unlimited events', 'Up to 10,000 registrations', 'Advanced analytics & exports', 'Custom domain support', 'Priority support & onboarding', 'API access', 'Team collaboration'])
ON CONFLICT (name) DO UPDATE SET
  price_monthly = EXCLUDED.price_monthly,
  features = EXCLUDED.features;

-- 3. Create global_settings table
CREATE TABLE IF NOT EXISTS global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default global settings
INSERT INTO global_settings (key, value) VALUES
  ('maintenance_mode', 'false'::jsonb),
  ('support_email', '"support@eventregplatform.com"'::jsonb)
ON CONFLICT (key) DO NOTHING;
