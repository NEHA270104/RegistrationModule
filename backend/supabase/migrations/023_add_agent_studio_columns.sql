-- Add Agent Studio integration columns to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_studio_org_id VARCHAR(255) UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_studio_user_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_tenants_agent_studio ON tenants(agent_studio_org_id);
