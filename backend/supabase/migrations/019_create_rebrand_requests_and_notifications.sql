-- Migration 019: Create rebrand_requests and admin_notifications tables

-- =============================================
-- Rebrand Requests
-- =============================================
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

  -- Approval workflow
  status VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected | setup_pending | completed
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Payment
  setup_fee INTEGER DEFAULT 999900,  -- INR 9,999 in paise
  setup_fee_paid BOOLEAN DEFAULT false,
  setup_payment_id VARCHAR(255),
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rebrand_requests_tenant ON rebrand_requests(tenant_id);
CREATE INDEX idx_rebrand_requests_status ON rebrand_requests(status);

-- Enable RLS
ALTER TABLE rebrand_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_rebrand ON rebrand_requests
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- =============================================
-- Admin Notifications
-- =============================================
CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,        -- rebrand_request | subscription_event | referral_signup | payout_request
  title VARCHAR(255) NOT NULL,
  message TEXT,
  tenant_id UUID REFERENCES tenants(id),
  reference_id UUID,                -- ID of related record
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_notifications_read ON admin_notifications(is_read);
CREATE INDEX idx_admin_notifications_type ON admin_notifications(type);
CREATE INDEX idx_admin_notifications_created ON admin_notifications(created_at DESC);
