-- Migration 021: Create flyers table

CREATE TABLE flyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  template_id VARCHAR(50) NOT NULL,
  template_data JSONB,           -- snapshot of settings used
  generated_image_url TEXT,
  format VARCHAR(10) DEFAULT 'png',
  dimensions VARCHAR(20),        -- '1080x1920', '1080x1080'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flyers_tenant ON flyers(tenant_id);

ALTER TABLE flyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_flyers ON flyers
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
