-- Migration: 025_create_tenant_api_keys_table.sql
-- API keys for programmatic access per tenant

CREATE TABLE tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSONB DEFAULT '["read"]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON tenant_api_keys(key_prefix);

-- RLS
ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_api_keys ON tenant_api_keys
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
