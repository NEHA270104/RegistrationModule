-- Domain verification columns (custom_domain and domain_verified already exist from migration 015)
ALTER TABLE tenants ADD COLUMN domain_verification_token VARCHAR(64);
ALTER TABLE tenants ADD COLUMN domain_verified_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN ssl_provisioned BOOLEAN DEFAULT false;

-- Index for domain routing lookups
CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;
