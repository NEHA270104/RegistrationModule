-- Migration: 032_enable_subscriptions_rls.sql
-- Enable Row Level Security (RLS) on subscriptions table to prevent anonymous public access

-- 1. Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Tenant isolation policy for authenticated tenant users
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  FOR ALL USING (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::UUID);
