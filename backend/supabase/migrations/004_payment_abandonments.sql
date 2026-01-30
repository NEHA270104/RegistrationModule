-- ============================================
-- Payment Abandonment Tracking Schema
-- Version: 1.0.0
-- ============================================

-- ============================================
-- ENUM Types
-- ============================================
CREATE TYPE abandonment_type AS ENUM ('cancelled', 'failed', 'timeout');
CREATE TYPE followup_status AS ENUM ('pending', 'email_sent', 'contacted', 'converted', 'declined', 'unresponsive');

-- ============================================
-- Payment Abandonments Table
-- ============================================
CREATE TABLE payment_abandonments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Link to registration (optional, as registration may be deleted)
    registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
    razorpay_order_id VARCHAR(100),

    -- Contact Info (denormalized for quick admin access)
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    business_name VARCHAR(200),

    -- Abandonment Details
    tier tier_type NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    abandonment_type abandonment_type NOT NULL,
    abandonment_reason TEXT,

    -- Follow-up Tracking
    followup_status followup_status NOT NULL DEFAULT 'pending',
    followup_attempts INTEGER DEFAULT 0,
    last_followup_at TIMESTAMPTZ,
    assigned_to VARCHAR(100),
    admin_notes TEXT,

    -- Recovery Link
    recovery_token VARCHAR(64) UNIQUE,
    recovery_link_expires_at TIMESTAMPTZ,
    recovery_link_used BOOLEAN DEFAULT false,

    -- Conversion Tracking
    converted_at TIMESTAMPTZ,
    converted_registration_id UUID REFERENCES registrations(id),

    -- Timestamps
    abandoned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Metadata
    ip_address INET,
    user_agent TEXT,
    utm_source VARCHAR(100),
    utm_campaign VARCHAR(100)
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_abandonments_email ON payment_abandonments(email);
CREATE INDEX idx_abandonments_phone ON payment_abandonments(phone);
CREATE INDEX idx_abandonments_followup ON payment_abandonments(followup_status);
CREATE INDEX idx_abandonments_created ON payment_abandonments(created_at DESC);
CREATE INDEX idx_abandonments_recovery_token ON payment_abandonments(recovery_token) WHERE recovery_token IS NOT NULL;
CREATE INDEX idx_abandonments_type ON payment_abandonments(abandonment_type);
CREATE INDEX idx_abandonments_tier ON payment_abandonments(tier);
CREATE INDEX idx_abandonments_razorpay_order ON payment_abandonments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

-- Composite index for common admin queries
CREATE INDEX idx_abandonments_status_created ON payment_abandonments(followup_status, created_at DESC);

-- ============================================
-- Triggers
-- ============================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_payment_abandonments_updated_at
    BEFORE UPDATE ON payment_abandonments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE payment_abandonments ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend API)
CREATE POLICY "Service role full access on payment_abandonments"
    ON payment_abandonments FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- Views for Analytics
-- ============================================

CREATE OR REPLACE VIEW v_abandonment_stats AS
SELECT
    abandonment_type,
    followup_status,
    tier,
    COUNT(*) as count,
    SUM(amount) as total_lost_revenue
FROM payment_abandonments
GROUP BY abandonment_type, followup_status, tier;

CREATE OR REPLACE VIEW v_daily_abandonments AS
SELECT
    DATE(abandoned_at) as abandonment_date,
    tier,
    abandonment_type,
    COUNT(*) as abandonments,
    SUM(amount) as potential_revenue
FROM payment_abandonments
GROUP BY DATE(abandoned_at), tier, abandonment_type
ORDER BY abandonment_date DESC;

-- ============================================
-- Functions
-- ============================================

-- Function to generate secure recovery token
CREATE OR REPLACE FUNCTION generate_recovery_token()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to get abandonment stats for dashboard
CREATE OR REPLACE FUNCTION get_abandonment_stats()
RETURNS TABLE (
    total_abandonments BIGINT,
    pending_followup BIGINT,
    email_sent BIGINT,
    converted BIGINT,
    total_lost_revenue BIGINT,
    conversion_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_abandonments,
        COUNT(*) FILTER (WHERE followup_status = 'pending')::BIGINT as pending_followup,
        COUNT(*) FILTER (WHERE followup_status = 'email_sent')::BIGINT as email_sent,
        COUNT(*) FILTER (WHERE followup_status = 'converted')::BIGINT as converted,
        COALESCE(SUM(amount) FILTER (WHERE followup_status != 'converted'), 0)::BIGINT as total_lost_revenue,
        ROUND(
            (COUNT(*) FILTER (WHERE followup_status = 'converted')::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
            2
        ) as conversion_rate
    FROM payment_abandonments;
END;
$$ LANGUAGE plpgsql;
