-- Legal document acceptance tracking (ToS, DPA, Partner Agreement)
CREATE TABLE legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  document_type VARCHAR(50) NOT NULL,      -- tos | dpa | partner_agreement
  document_version VARCHAR(10) NOT NULL,   -- e.g. '1.0', '2.0'
  accepted_by_email VARCHAR(255) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_legal_acceptances_tenant ON legal_acceptances(tenant_id);

-- RLS
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_legal ON legal_acceptances
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
