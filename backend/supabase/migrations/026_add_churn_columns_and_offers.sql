-- Add churn lifecycle columns to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancellation_effective_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS data_deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS churn_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS churn_feedback TEXT;

-- Churn retention offers
CREATE TABLE churn_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  offer_type VARCHAR(50) NOT NULL,         -- discount | pause | plan_downgrade | feature_unlock
  offer_details JSONB NOT NULL,            -- { discount_percent: 30, months: 3 }
  status VARCHAR(20) DEFAULT 'pending',    -- pending | accepted | rejected | expired
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_churn_offers_tenant ON churn_offers(tenant_id);
CREATE INDEX idx_churn_offers_status ON churn_offers(status, expires_at);

-- RLS
ALTER TABLE churn_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_churn_offers ON churn_offers
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
