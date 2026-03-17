-- Migration 020: Create referral tables

-- =============================================
-- Referrals
-- =============================================
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  referred_tenant_id UUID NOT NULL REFERENCES tenants(id),
  referral_code VARCHAR(20) NOT NULL,

  -- Commission
  commission_percent DECIMAL(5,2) DEFAULT 10.00,
  total_commission_earned INTEGER DEFAULT 0,  -- in paise, lifetime
  total_commission_paid INTEGER DEFAULT 0,    -- in paise, paid out

  status VARCHAR(20) DEFAULT 'active',  -- active | churned | migrated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_tenant_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_tenant_id);
CREATE UNIQUE INDEX idx_referrals_unique_pair ON referrals(referrer_tenant_id, referred_tenant_id);

-- =============================================
-- Commission Ledger
-- =============================================
CREATE TABLE commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  subscription_payment_id VARCHAR(255),
  payment_amount INTEGER NOT NULL,       -- original payment in paise
  commission_percent DECIMAL(5,2) NOT NULL,
  commission_amount INTEGER NOT NULL,    -- commission in paise
  status VARCHAR(20) DEFAULT 'pending',  -- pending | approved | paid
  paid_at TIMESTAMPTZ,
  payout_reference VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_ledger_referrer ON commission_ledger(referrer_tenant_id);
CREATE INDEX idx_commission_ledger_status ON commission_ledger(status);

-- =============================================
-- Referral Clicks Tracking
-- =============================================
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

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrer_access ON referrals
  USING (referrer_tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY referrer_commission ON commission_ledger
  USING (referrer_tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
