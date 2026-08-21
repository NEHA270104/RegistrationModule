-- Migration: 024_create_audit_log_table.sql
-- Cross-tenant audit trail for compliance and debugging

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),

  -- Who
  actor_id UUID,
  actor_email VARCHAR(255),
  actor_role VARCHAR(20),

  -- What
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,

  -- Context
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,

  -- When
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, resource_type);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit_log ON audit_log
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
