-- Migration: 036_cascade_delete.sql
-- Drop old foreign key constraints referencing tenants and re-create them with ON DELETE CASCADE.
-- Also initialize the admin_activity_log table for auditing.

-- Create admin_activity_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  tenant_id UUID,
  tenant_name VARCHAR(255),
  actor_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop and recreate constraints with ON DELETE CASCADE

-- 1. site_settings
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_tenant_id_fkey;
ALTER TABLE site_settings ADD CONSTRAINT site_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 2. registrations
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_tenant_id_fkey;
ALTER TABLE registrations ADD CONSTRAINT registrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 3. seat_inventory
ALTER TABLE seat_inventory DROP CONSTRAINT IF EXISTS seat_inventory_tenant_id_fkey;
ALTER TABLE seat_inventory ADD CONSTRAINT seat_inventory_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 4. waitlist
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_tenant_id_fkey;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 5. payment_abandonments
ALTER TABLE payment_abandonments DROP CONSTRAINT IF EXISTS payment_abandonments_tenant_id_fkey;
ALTER TABLE payment_abandonments ADD CONSTRAINT payment_abandonments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 6. guests
ALTER TABLE guests DROP CONSTRAINT IF EXISTS guests_tenant_id_fkey;
ALTER TABLE guests ADD CONSTRAINT guests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 7. msme_benefits
ALTER TABLE msme_benefits DROP CONSTRAINT IF EXISTS msme_benefits_tenant_id_fkey;
ALTER TABLE msme_benefits ADD CONSTRAINT msme_benefits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 8. subscriptions
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tenant_id_fkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 9. rebrand_requests
ALTER TABLE rebrand_requests DROP CONSTRAINT IF EXISTS rebrand_requests_tenant_id_fkey;
ALTER TABLE rebrand_requests ADD CONSTRAINT rebrand_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 10. admin_notifications
ALTER TABLE admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_tenant_id_fkey;
ALTER TABLE admin_notifications ADD CONSTRAINT admin_notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 11. referrals (referrer and referred)
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referrer_tenant_id_fkey;
ALTER TABLE referrals ADD CONSTRAINT referrals_referrer_tenant_id_fkey FOREIGN KEY (referrer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referred_tenant_id_fkey;
ALTER TABLE referrals ADD CONSTRAINT referrals_referred_tenant_id_fkey FOREIGN KEY (referred_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 12. commission_ledger
ALTER TABLE commission_ledger DROP CONSTRAINT IF EXISTS commission_ledger_referrer_tenant_id_fkey;
ALTER TABLE commission_ledger ADD CONSTRAINT commission_ledger_referrer_tenant_id_fkey FOREIGN KEY (referrer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 13. referral_clicks
ALTER TABLE referral_clicks DROP CONSTRAINT IF EXISTS referral_clicks_referrer_tenant_id_fkey;
ALTER TABLE referral_clicks ADD CONSTRAINT referral_clicks_referrer_tenant_id_fkey FOREIGN KEY (referrer_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 14. flyers
ALTER TABLE flyers DROP CONSTRAINT IF EXISTS flyers_tenant_id_fkey;
ALTER TABLE flyers ADD CONSTRAINT flyers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 15. email_templates
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_tenant_id_fkey;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 16. audit_log
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_tenant_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 17. legal_acceptances
ALTER TABLE legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_tenant_id_fkey;
ALTER TABLE legal_acceptances ADD CONSTRAINT legal_acceptances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 18. tenant_api_keys
ALTER TABLE tenant_api_keys DROP CONSTRAINT IF EXISTS tenant_api_keys_tenant_id_fkey;
ALTER TABLE tenant_api_keys ADD CONSTRAINT tenant_api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 19. payments
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_tenant_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 20. flyer_config
ALTER TABLE flyer_config DROP CONSTRAINT IF EXISTS flyer_config_tenant_id_fkey;
ALTER TABLE flyer_config ADD CONSTRAINT flyer_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
