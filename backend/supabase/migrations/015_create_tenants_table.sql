-- Core tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  company_name VARCHAR(255),

  -- Branding (default BRTNeura)
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#667eea',
  secondary_color VARCHAR(7) DEFAULT '#764ba2',
  favicon_url TEXT,

  -- Subscription
  subscription_plan VARCHAR(20) DEFAULT 'trial',  -- trial | launchpad | scaleup_pro
  subscription_status VARCHAR(20) DEFAULT 'trialing', -- trialing | active | past_due | cancelled
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

  -- Domain
  custom_domain VARCHAR(255),
  domain_verified BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_referral_code ON tenants(referral_code);
CREATE INDEX idx_tenants_subscription ON tenants(subscription_plan, subscription_status);
