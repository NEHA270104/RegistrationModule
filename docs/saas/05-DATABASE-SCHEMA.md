# Database Schema Reference

Complete schema for the SaaS multi-tenant Registration Form platform.

---

## Entity Relationship Diagram

```
tenants ──────────────────────────────────────────────────┐
  │                                                        │
  ├── registrations (tenant_id)                           │
  ├── seat_inventory (tenant_id)                          │
  ├── waitlist (tenant_id)                                │
  ├── site_settings (tenant_id)                           │
  ├── guests (tenant_id)                                  │
  ├── msme_benefits (tenant_id)                           │
  ├── payment_abandonments (tenant_id)                    │
  ├── payment_webhook_logs (tenant_id)                    │
  ├── subscriptions (tenant_id)                           │
  ├── rebrand_requests (tenant_id)                        │
  ├── flyers (tenant_id)                                  │
  ├── email_templates (tenant_id)                         │
  ├── admin_notifications (tenant_id)                     │
  ├── audit_log (tenant_id)                               │
  ├── legal_acceptances (tenant_id)                       │
  ├── churn_offers (tenant_id)                            │
  ├── tenant_api_keys (tenant_id)                         │
  │                                                        │
  ├── referrals (referrer_tenant_id, referred_tenant_id)  │
  ├── commission_ledger (referrer_tenant_id)              │
  └── referral_clicks (referrer_tenant_id)               │
                                                           │
                                     referred_by_tenant_id ┘
```

---

## New Tables (SaaS-Specific)

### `tenants`

The core multi-tenancy table. Every other table references this.

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  company_name VARCHAR(255),

  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#667eea',
  secondary_color VARCHAR(7) DEFAULT '#764ba2',
  favicon_url TEXT,

  -- Subscription
  subscription_plan VARCHAR(20) DEFAULT 'trial',
    -- Values: trial | launchpad | scaleup_pro
  subscription_status VARCHAR(20) DEFAULT 'trialing',
    -- Values: trialing | active | past_due | cancelling | cancelled
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),

  -- Rebrand
  is_rebranded BOOLEAN DEFAULT false,
  rebrand_approved_at TIMESTAMPTZ,
  rebrand_fee_paid BOOLEAN DEFAULT false,

  -- Referral
  referral_code VARCHAR(20) UNIQUE,
  referred_by_tenant_id UUID REFERENCES tenants(id),

  -- API Access
  api_key_hash TEXT,

  -- Custom Domain
  custom_domain VARCHAR(255),
  domain_verified BOOLEAN DEFAULT false,
  domain_verified_at TIMESTAMPTZ,
  domain_verification_token VARCHAR(64),
  ssl_provisioned BOOLEAN DEFAULT false,

  -- Agent Studio Integration
  agent_studio_org_id VARCHAR(255) UNIQUE,
  agent_studio_user_id VARCHAR(255),

  -- Churn
  cancellation_requested_at TIMESTAMPTZ,
  cancellation_effective_at TIMESTAMPTZ,
  data_deletion_scheduled_at TIMESTAMPTZ,
  churn_reason TEXT,
  churn_feedback TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_email ON tenants(email);
CREATE INDEX idx_tenants_referral_code ON tenants(referral_code);
CREATE INDEX idx_tenants_subscription ON tenants(subscription_plan, subscription_status);
CREATE INDEX idx_tenants_agent_studio ON tenants(agent_studio_org_id);
CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;
```

---

### `subscriptions`

Tracks Razorpay subscription lifecycle per tenant.

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  plan_name VARCHAR(20) NOT NULL,         -- launchpad | scaleup_pro
  billing_cycle VARCHAR(10) NOT NULL,     -- monthly | yearly
  amount INTEGER NOT NULL,                -- in paise
  currency VARCHAR(3) DEFAULT 'INR',

  status VARCHAR(20) DEFAULT 'created',
    -- Values: created | authenticated | active | past_due | halted | cancelled

  -- Razorpay
  razorpay_subscription_id VARCHAR(255),
  razorpay_plan_id VARCHAR(255),

  -- Billing periods
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_razorpay ON subscriptions(razorpay_subscription_id);
```

---

### `rebrand_requests`

Tracks white-label rebrand requests and approval workflow.

```sql
CREATE TABLE rebrand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Requested branding
  requested_brand_name VARCHAR(255) NOT NULL,
  requested_logo_url TEXT,
  requested_primary_color VARCHAR(7),
  requested_secondary_color VARCHAR(7),
  requested_favicon_url TEXT,
  requested_domain VARCHAR(255),

  -- Approval
  status VARCHAR(20) DEFAULT 'pending',
    -- Values: pending | approved | rejected | setup_pending | completed
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Payment
  setup_fee INTEGER DEFAULT 999900,     -- INR 9,999 in paise
  setup_fee_paid BOOLEAN DEFAULT false,
  setup_payment_id VARCHAR(255),
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rebrand_requests_tenant ON rebrand_requests(tenant_id);
CREATE INDEX idx_rebrand_requests_status ON rebrand_requests(status);
```

---

### `referrals`

Links referrer tenant to referred tenant.

```sql
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  referred_tenant_id UUID NOT NULL REFERENCES tenants(id),
  referral_code VARCHAR(20) NOT NULL,

  commission_percent DECIMAL(5,2) DEFAULT 10.00,
  total_commission_earned INTEGER DEFAULT 0,  -- lifetime, in paise
  total_commission_paid INTEGER DEFAULT 0,    -- paid out, in paise

  status VARCHAR(20) DEFAULT 'active',
    -- Values: active | churned | migrated

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(referrer_tenant_id, referred_tenant_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_tenant_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_tenant_id);
```

---

### `commission_ledger`

Every subscription charge for a referred tenant generates a commission entry.

```sql
CREATE TABLE commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),

  subscription_payment_id VARCHAR(255),
  payment_amount INTEGER NOT NULL,         -- original payment in paise
  commission_percent DECIMAL(5,2) NOT NULL,
  commission_amount INTEGER NOT NULL,      -- commission in paise

  status VARCHAR(20) DEFAULT 'pending',
    -- Values: pending | approved | paid

  paid_at TIMESTAMPTZ,
  payout_reference VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_referrer ON commission_ledger(referrer_tenant_id);
CREATE INDEX idx_commission_status ON commission_ledger(status);
```

---

### `referral_clicks`

Tracks link clicks for conversion analytics.

```sql
CREATE TABLE referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code VARCHAR(20) NOT NULL,
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  ip_address INET,
  user_agent TEXT,
  converted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referral_clicks_code ON referral_clicks(referral_code);
CREATE INDEX idx_referral_clicks_referrer ON referral_clicks(referrer_tenant_id);
```

---

### `flyers`

Stores generated flyer metadata and URLs.

```sql
CREATE TABLE flyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  template_id VARCHAR(50) NOT NULL,
  template_data JSONB,
  generated_image_url TEXT,
  format VARCHAR(10) DEFAULT 'png',
  dimensions VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flyers_tenant ON flyers(tenant_id);
```

---

### `email_templates`

Per-tenant email template overrides.

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL = default template
  template_type VARCHAR(50) NOT NULL,
    -- Values: welcome | registration_confirmation | payment_receipt |
    --         recovery_link | waitlist_confirmation | subscription_invoice |
    --         trial_expiring | subscription_cancelled
  subject VARCHAR(255) NOT NULL,
  html_body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, template_type)
);

CREATE INDEX idx_email_templates_tenant ON email_templates(tenant_id);
```

---

### `admin_notifications`

Notifications for super admin and tenant admins.

```sql
CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
    -- Values: rebrand_request | subscription_event | usage_alert |
    --         referral_signup | churn_risk | system_alert
  title VARCHAR(255) NOT NULL,
  message TEXT,
  tenant_id UUID REFERENCES tenants(id),
  reference_id UUID,
  target_role VARCHAR(20) DEFAULT 'super_admin',
    -- Values: super_admin | tenant_admin
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON admin_notifications(target_role, is_read)
  WHERE is_read = false;
CREATE INDEX idx_notifications_tenant ON admin_notifications(tenant_id);
```

---

### `audit_log`

Cross-tenant audit trail.

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),

  actor_id UUID,
  actor_email VARCHAR(255),
  actor_role VARCHAR(20),

  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,

  ip_address INET,
  user_agent TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, resource_type);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

---

### `tenant_api_keys`

API keys for programmatic access.

```sql
CREATE TABLE tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,       -- First 8 chars (for identification)
  key_hash TEXT NOT NULL,               -- bcrypt hash of full key
  scopes JSONB DEFAULT '["read"]',      -- read | write | admin
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON tenant_api_keys(key_prefix);
```

---

### `legal_acceptances`

Tracks consent for legal documents.

```sql
CREATE TABLE legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  document_type VARCHAR(50) NOT NULL,
  document_version VARCHAR(10) NOT NULL,
  accepted_by_email VARCHAR(255) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_legal_tenant ON legal_acceptances(tenant_id);
```

---

### `churn_offers`

Retention offers for cancelling tenants.

```sql
CREATE TABLE churn_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  offer_type VARCHAR(50) NOT NULL,
    -- Values: discount | plan_change | pause | feature_unlock
  offer_details JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
    -- Values: pending | accepted | rejected | expired
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_churn_offers_tenant ON churn_offers(tenant_id);
```

---

## Modified Existing Tables

All existing tables receive a `tenant_id` column:

```sql
ALTER TABLE registrations     ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE seat_inventory    ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE waitlist          ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE payment_abandonments ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE payment_webhook_logs ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE site_settings     ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE guests            ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE msme_benefits     ADD COLUMN tenant_id UUID REFERENCES tenants(id);
```

---

## RLS Policies Summary

Every table with `tenant_id` gets:

```sql
-- Enable RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- Tenant can only access own data (authenticated)
CREATE POLICY tenant_isolation_{table} ON {table_name}
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Public read where applicable (registration form pages)
CREATE POLICY public_read_{table} ON {table_name}
  FOR SELECT USING ({condition});  -- e.g., is_active = true
```

### Public Read Policies

| Table | Condition | Why |
|-------|-----------|-----|
| site_settings | `true` | Public form needs settings |
| seat_inventory | `true` | Public form shows seat counts |
| guests | `is_active = true` | Public form shows speakers |
| msme_benefits | `is_active = true` | Public form shows benefits |

### Service Role Bypass

Super admin operations use `supabaseAdmin` client (service_role key), which bypasses all RLS policies. This is used for:
- Cross-tenant queries
- Tenant management
- Global analytics
- Audit log reads

---

## Migration Order

```
015_create_tenants_table.sql
016_add_tenant_id_to_existing_tables.sql
017_enable_rls_policies.sql
018_create_subscriptions_table.sql
019_create_rebrand_requests_table.sql
020_create_referral_tables.sql          -- referrals, commission_ledger, referral_clicks
021_create_flyers_table.sql
022_create_email_templates_table.sql
023_create_notifications_table.sql
024_create_audit_log_table.sql
025_create_tenant_api_keys_table.sql
026_create_legal_acceptances_table.sql
027_create_churn_offers_table.sql
028_backfill_default_tenant.sql         -- Migrate existing data to default tenant
```

---

## Backfill Script: `028_backfill_default_tenant.sql`

```sql
-- Create default tenant for existing BRTNeura data
INSERT INTO tenants (id, name, slug, email, company_name, subscription_plan, subscription_status, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'BRTNeura',
  'brtneura',
  'admin@brtneura.com',
  'BRTNeura Technologies',
  'scaleup_pro',
  'active',
  true
);

-- Backfill all existing records
UPDATE registrations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE seat_inventory SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE waitlist SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE payment_abandonments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE payment_webhook_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE site_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE guests SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE msme_benefits SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE registrations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE seat_inventory ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE waitlist ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payment_abandonments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE payment_webhook_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE site_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE guests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE msme_benefits ALTER COLUMN tenant_id SET NOT NULL;
```
