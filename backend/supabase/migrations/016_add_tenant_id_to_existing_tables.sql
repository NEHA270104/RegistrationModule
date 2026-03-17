-- ============================================
-- Step 1: Insert default BRTNeura tenant
-- ============================================
INSERT INTO tenants (id, name, slug, email, phone, company_name, subscription_plan, subscription_status, trial_ends_at, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'BRTNeura',
  'brtneura',
  'support@bizflowai.in',
  '+918188050895',
  'BRTNeura Technologies',
  'scaleup_pro',
  'active',
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Step 2: Add tenant_id to every existing table
-- ============================================
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE seat_inventory ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE payment_abandonments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE guests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE msme_benefits ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';

-- ============================================
-- Step 3: Backfill existing rows with default tenant
-- ============================================
UPDATE registrations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE seat_inventory SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE waitlist SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE payment_abandonments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE site_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE guests SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE msme_benefits SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ============================================
-- Step 4: Create indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_registrations_tenant ON registrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_seat_inventory_tenant ON seat_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_tenant ON waitlist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_settings_tenant ON site_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guests_tenant ON guests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_msme_benefits_tenant ON msme_benefits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_abandonments_tenant ON payment_abandonments(tenant_id);
