-- Migration: 033_enable_site_settings_update_policy.sql
-- Ensure site_settings table has a dedicated UPDATE policy allowing authenticated tenants to modify their own settings records.

DROP POLICY IF EXISTS tenant_update_settings ON site_settings;
CREATE POLICY tenant_update_settings ON site_settings
  FOR UPDATE
  USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID)
  WITH CHECK (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);
