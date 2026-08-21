-- Migration: 037_cascade_delete_remaining.sql
-- Drop old foreign key constraints referencing tenants on remaining tables and recreate them.

-- 1. churn_offers table (ON DELETE CASCADE)
ALTER TABLE churn_offers DROP CONSTRAINT IF EXISTS churn_offers_tenant_id_fkey;
ALTER TABLE churn_offers ADD CONSTRAINT churn_offers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 2. tenants table self-reference referred_by_tenant_id (ON DELETE SET NULL)
-- Note: Setting to SET NULL prevents deleting a referrer from cascade-deleting referred active tenants.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_referred_by_tenant_id_fkey;
ALTER TABLE tenants ADD CONSTRAINT tenants_referred_by_tenant_id_fkey FOREIGN KEY (referred_by_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
