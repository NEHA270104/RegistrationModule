-- Migration: 034_update_subscription_plans.sql
-- Rename 'pro' to 'standard', update limits, and add manual_admin_entry to guests

-- 1. Rename 'pro' to 'standard' (or insert standard if not present)
UPDATE plans 
SET name = 'standard', guest_limit = 100 
WHERE name = 'pro';

-- Ensure standard plan exists (in case pro wasn't already in DB, or for clean seed)
INSERT INTO plans (name, price_monthly, guest_limit)
VALUES ('standard', 2100, 100)
ON CONFLICT (name) DO UPDATE SET guest_limit = 100;

-- 2. Update basic plan limit to 0
UPDATE plans 
SET guest_limit = 0 
WHERE name = 'basic';

-- Ensure basic plan exists
INSERT INTO plans (name, price_monthly, guest_limit)
VALUES ('basic', 1499, 0)
ON CONFLICT (name) DO UPDATE SET guest_limit = 0;

-- 3. Update enterprise plan limit to 500
UPDATE plans 
SET guest_limit = 500 
WHERE name = 'enterprise';

-- Ensure enterprise plan exists
INSERT INTO plans (name, price_monthly, guest_limit)
VALUES ('enterprise', 2999, 500)
ON CONFLICT (name) DO UPDATE SET guest_limit = 500;

-- 4. Update existing tenants referencing 'pro' to 'standard'
UPDATE tenants 
SET subscription_plan = 'standard' 
WHERE subscription_plan = 'pro';

UPDATE tenants 
SET selected_plan = 'standard' 
WHERE selected_plan = 'pro';

-- 5. Update existing subscriptions referencing 'pro' to 'standard'
UPDATE subscriptions 
SET plan_name = 'standard' 
WHERE plan_name = 'pro';

-- 6. Add manual_admin_entry to guests table
ALTER TABLE guests 
ADD COLUMN IF NOT EXISTS manual_admin_entry BOOLEAN DEFAULT false;
