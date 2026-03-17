-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE msme_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_abandonments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Service role bypass: service_role key bypasses RLS
-- (Supabase does this automatically, but explicit for clarity)
-- ============================================

-- ============================================
-- Tenant isolation policies (for authenticated tenant users)
-- Uses user_metadata.tenant_id from Supabase Auth JWT
-- ============================================
CREATE POLICY tenant_isolation_registrations ON registrations
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

CREATE POLICY tenant_isolation_seats ON seat_inventory
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

CREATE POLICY tenant_isolation_waitlist ON waitlist
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

CREATE POLICY tenant_isolation_settings ON site_settings
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

CREATE POLICY tenant_isolation_guests ON guests
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

CREATE POLICY tenant_isolation_benefits ON msme_benefits
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

CREATE POLICY tenant_isolation_abandonments ON payment_abandonments
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

-- Tenant can view own tenant record
CREATE POLICY tenant_view_own ON tenants
  FOR SELECT USING (id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);

-- ============================================
-- Public read policies (no auth needed for public registration form)
-- ============================================
CREATE POLICY public_read_settings ON site_settings
  FOR SELECT USING (true);

CREATE POLICY public_read_seats ON seat_inventory
  FOR SELECT USING (true);

CREATE POLICY public_read_guests ON guests
  FOR SELECT USING (is_active = true);

CREATE POLICY public_read_benefits ON msme_benefits
  FOR SELECT USING (is_active = true);

-- Public can read active tenant info (for branding on registration form)
CREATE POLICY public_read_tenants ON tenants
  FOR SELECT USING (is_active = true);

-- ============================================
-- Public insert policy for registrations (users register without auth)
-- ============================================
CREATE POLICY public_insert_registrations ON registrations
  FOR INSERT WITH CHECK (true);

CREATE POLICY public_read_registrations ON registrations
  FOR SELECT USING (true);

-- Public insert for waitlist
CREATE POLICY public_insert_waitlist ON waitlist
  FOR INSERT WITH CHECK (true);
