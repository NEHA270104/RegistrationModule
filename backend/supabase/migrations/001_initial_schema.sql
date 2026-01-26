-- ============================================
-- AI for MSME Summit Registration Database Schema
-- Version: 1.0.0
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM Types
-- ============================================
CREATE TYPE tier_type AS ENUM ('vip', 'standard', 'basic', 'waitlist');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'confirmed', 'failed', 'refunded', 'expired');
CREATE TYPE registration_status AS ENUM ('pending', 'confirmed', 'cancelled', 'waitlisted');

-- ============================================
-- Seat Inventory Table
-- ============================================
CREATE TABLE seat_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier_name tier_type NOT NULL UNIQUE,
    display_name VARCHAR(50) NOT NULL,
    total_seats INTEGER NOT NULL CHECK (total_seats >= 0),
    sold_seats INTEGER NOT NULL DEFAULT 0 CHECK (sold_seats >= 0),
    held_seats INTEGER NOT NULL DEFAULT 0 CHECK (held_seats >= 0),
    price_inr INTEGER NOT NULL CHECK (price_inr > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    benefits JSONB DEFAULT '[]'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_seat_count CHECK (sold_seats + held_seats <= total_seats)
);

-- Index for quick tier lookups
CREATE INDEX idx_seat_inventory_tier ON seat_inventory(tier_name);
CREATE INDEX idx_seat_inventory_active ON seat_inventory(is_active) WHERE is_active = true;

-- ============================================
-- Registrations Table
-- ============================================
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id VARCHAR(20) NOT NULL UNIQUE,

    -- Personal Details
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL,

    -- Business Details
    business_name VARCHAR(200),
    industry VARCHAR(100),
    revenue_range VARCHAR(50),
    employee_count VARCHAR(50),

    -- Booking Details
    tier tier_type NOT NULL,
    amount_paid INTEGER NOT NULL CHECK (amount_paid >= 0),
    payment_status payment_status NOT NULL DEFAULT 'pending',
    registration_status registration_status NOT NULL DEFAULT 'pending',

    -- Razorpay Details
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),

    -- Timestamps
    payment_initiated_at TIMESTAMPTZ,
    payment_confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Metadata
    ip_address INET,
    user_agent TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    referrer TEXT,

    -- Confirmation Details
    confirmation_email_sent BOOLEAN DEFAULT false,
    confirmation_whatsapp_sent BOOLEAN DEFAULT false,
    ticket_downloaded BOOLEAN DEFAULT false
);

-- Indexes for registrations
CREATE INDEX idx_registrations_email ON registrations(email);
CREATE INDEX idx_registrations_phone ON registrations(phone);
CREATE INDEX idx_registrations_booking_id ON registrations(booking_id);
CREATE INDEX idx_registrations_tier ON registrations(tier);
CREATE INDEX idx_registrations_payment_status ON registrations(payment_status);
CREATE INDEX idx_registrations_created_at ON registrations(created_at DESC);
CREATE INDEX idx_registrations_razorpay_order ON registrations(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

-- Composite index for common queries
CREATE INDEX idx_registrations_tier_status ON registrations(tier, payment_status);

-- ============================================
-- Waitlist Table
-- ============================================
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Personal Details
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL,

    -- Business Details
    business_name VARCHAR(200),
    industry VARCHAR(100),

    -- Preferred Tier
    preferred_tier tier_type NOT NULL DEFAULT 'standard',

    -- Waitlist Details
    position INTEGER NOT NULL,
    is_notified BOOLEAN DEFAULT false,
    notified_at TIMESTAMPTZ,

    -- Converted to registration
    converted_to_registration_id UUID REFERENCES registrations(id),
    converted_at TIMESTAMPTZ,

    -- Live Stream Access (for waitlist payment)
    has_livestream_access BOOLEAN DEFAULT false,
    livestream_payment_id VARCHAR(100),
    livestream_amount INTEGER DEFAULT 699,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Metadata
    ip_address INET,
    utm_source VARCHAR(100)
);

-- Indexes for waitlist
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_phone ON waitlist(phone);
CREATE INDEX idx_waitlist_position ON waitlist(position);
CREATE INDEX idx_waitlist_converted ON waitlist(converted_to_registration_id) WHERE converted_to_registration_id IS NOT NULL;

-- ============================================
-- Pending Orders Table (for payment timeout handling)
-- ============================================
CREATE TABLE pending_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,
    tier tier_type NOT NULL,
    amount INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    name VARCHAR(100) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_pending_orders_status ON pending_orders(status);
CREATE INDEX idx_pending_orders_expires ON pending_orders(expires_at) WHERE status = 'pending';
CREATE INDEX idx_pending_orders_razorpay ON pending_orders(razorpay_order_id);

-- ============================================
-- Admin Activity Log
-- ============================================
CREATE TABLE admin_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(100) NOT NULL,
    admin_identifier VARCHAR(255),
    entity_type VARCHAR(50),
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_log_action ON admin_activity_log(action);
CREATE INDEX idx_admin_log_created ON admin_activity_log(created_at DESC);

-- ============================================
-- Payment Webhook Log (for idempotency)
-- ============================================
CREATE TABLE payment_webhook_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    razorpay_payment_id VARCHAR(100),
    razorpay_order_id VARCHAR(100),
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_log_payment ON payment_webhook_log(razorpay_payment_id);
CREATE INDEX idx_webhook_log_processed ON payment_webhook_log(processed);

-- ============================================
-- Functions
-- ============================================

-- Function to generate booking ID
CREATE OR REPLACE FUNCTION generate_booking_id()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_id VARCHAR(20);
    counter INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(booking_id FROM 9) AS INTEGER)), 0) + 1
    INTO counter
    FROM registrations
    WHERE booking_id LIKE 'BF-2026-%';

    new_id := 'BF-2026-' || LPAD(counter::TEXT, 6, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Atomic function to reserve a seat (prevents race conditions)
CREATE OR REPLACE FUNCTION reserve_seat(p_tier tier_type)
RETURNS JSONB AS $$
DECLARE
    v_available INTEGER;
    v_result JSONB;
BEGIN
    -- Lock the row for update
    SELECT total_seats - sold_seats - held_seats
    INTO v_available
    FROM seat_inventory
    WHERE tier_name = p_tier AND is_active = true
    FOR UPDATE;

    IF v_available IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tier not found or inactive'
        );
    END IF;

    IF v_available <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No seats available',
            'available', 0
        );
    END IF;

    -- Reserve the seat
    UPDATE seat_inventory
    SET held_seats = held_seats + 1,
        updated_at = NOW()
    WHERE tier_name = p_tier;

    RETURN jsonb_build_object(
        'success', true,
        'available', v_available - 1
    );
END;
$$ LANGUAGE plpgsql;

-- Atomic function to confirm seat (move from held to sold)
CREATE OR REPLACE FUNCTION confirm_seat(p_tier tier_type)
RETURNS JSONB AS $$
BEGIN
    UPDATE seat_inventory
    SET held_seats = GREATEST(held_seats - 1, 0),
        sold_seats = sold_seats + 1,
        updated_at = NOW()
    WHERE tier_name = p_tier;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tier not found');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Function to release held seat (on payment timeout)
CREATE OR REPLACE FUNCTION release_held_seat(p_tier tier_type)
RETURNS JSONB AS $$
BEGIN
    UPDATE seat_inventory
    SET held_seats = GREATEST(held_seats - 1, 0),
        updated_at = NOW()
    WHERE tier_name = p_tier AND held_seats > 0;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No held seats to release');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- Function to get next waitlist position
CREATE OR REPLACE FUNCTION get_next_waitlist_position()
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT MAX(position) + 1 FROM waitlist WHERE converted_to_registration_id IS NULL),
        1
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if all seats are sold
CREATE OR REPLACE FUNCTION check_all_seats_sold()
RETURNS BOOLEAN AS $$
DECLARE
    v_total INTEGER;
    v_sold INTEGER;
BEGIN
    SELECT
        SUM(total_seats),
        SUM(sold_seats + held_seats)
    INTO v_total, v_sold
    FROM seat_inventory
    WHERE tier_name != 'waitlist' AND is_active = true;

    RETURN v_sold >= v_total;
END;
$$ LANGUAGE plpgsql;

-- Function to get seat availability
CREATE OR REPLACE FUNCTION get_seat_availability()
RETURNS TABLE (
    tier_name tier_type,
    display_name VARCHAR,
    total_seats INTEGER,
    available_seats INTEGER,
    price_inr INTEGER,
    is_active BOOLEAN,
    is_sold_out BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        si.tier_name,
        si.display_name,
        si.total_seats,
        si.total_seats - si.sold_seats - si.held_seats AS available_seats,
        si.price_inr,
        si.is_active,
        (si.sold_seats + si.held_seats >= si.total_seats) AS is_sold_out
    FROM seat_inventory si
    WHERE si.tier_name != 'waitlist'
    ORDER BY si.sort_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_registrations_updated_at
    BEFORE UPDATE ON registrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_seat_inventory_updated_at
    BEFORE UPDATE ON seat_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_waitlist_updated_at
    BEFORE UPDATE ON waitlist
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Auto-generate booking ID
CREATE OR REPLACE FUNCTION auto_generate_booking_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.booking_id IS NULL OR NEW.booking_id = '' THEN
        NEW.booking_id := generate_booking_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_booking_id
    BEFORE INSERT ON registrations
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_booking_id();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend API)
CREATE POLICY "Service role full access on registrations"
    ON registrations FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on seat_inventory"
    ON seat_inventory FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on waitlist"
    ON waitlist FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on pending_orders"
    ON pending_orders FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on payment_webhook_log"
    ON payment_webhook_log FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on admin_activity_log"
    ON admin_activity_log FOR ALL
    USING (auth.role() = 'service_role');

-- Anon users can read seat availability
CREATE POLICY "Anon can read seat inventory"
    ON seat_inventory FOR SELECT
    USING (true);

-- ============================================
-- Initial Data
-- ============================================

-- Insert seat inventory
INSERT INTO seat_inventory (tier_name, display_name, total_seats, price_inr, description, benefits, sort_order)
VALUES
    ('vip', 'VIP Pass', 30, 249900, 'Premium VIP experience with exclusive benefits',
     '["Priority seating in front rows", "Exclusive networking session with speakers", "VIP badge and welcome kit", "Premium lunch and refreshments", "1-on-1 AI business consultation (15 mins)", "Certificate of participation", "Recording access for 30 days"]'::jsonb, 1),

    ('standard', 'Standard Pass', 50, 149900, 'Full summit access with great value',
     '["Reserved seating", "Networking opportunities", "Summit badge", "Lunch and refreshments", "Certificate of participation", "Recording access for 7 days"]'::jsonb, 2),

    ('basic', 'Basic Pass', 40, 99900, 'Essential summit experience',
     '["General seating", "Summit badge", "Light refreshments", "Certificate of participation"]'::jsonb, 3),

    ('waitlist', 'Waitlist - Live Stream', 9999, 69900, 'Live stream access when in-person seats are sold out',
     '["Full live stream access", "Chat with participants", "Recording access for 3 days", "Digital certificate"]'::jsonb, 4);

-- ============================================
-- Scheduled Jobs (for cron-based cleanup)
-- ============================================

-- Note: Run this via Supabase Edge Function or external cron
-- This function expires pending orders after 10 minutes
CREATE OR REPLACE FUNCTION cleanup_expired_orders()
RETURNS void AS $$
DECLARE
    expired_order RECORD;
BEGIN
    FOR expired_order IN
        SELECT * FROM pending_orders
        WHERE status = 'pending' AND expires_at < NOW()
    LOOP
        -- Release the held seat
        PERFORM release_held_seat(expired_order.tier);

        -- Mark order as expired
        UPDATE pending_orders
        SET status = 'expired'
        WHERE id = expired_order.id;

        -- Update registration if exists
        UPDATE registrations
        SET payment_status = 'expired',
            registration_status = 'cancelled'
        WHERE razorpay_order_id = expired_order.razorpay_order_id
          AND payment_status = 'pending';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Views for Analytics
-- ============================================

CREATE OR REPLACE VIEW v_registration_stats AS
SELECT
    tier,
    payment_status,
    COUNT(*) as count,
    SUM(amount_paid) as total_revenue
FROM registrations
GROUP BY tier, payment_status;

CREATE OR REPLACE VIEW v_daily_registrations AS
SELECT
    DATE(created_at) as registration_date,
    tier,
    COUNT(*) as registrations,
    SUM(CASE WHEN payment_status = 'confirmed' THEN amount_paid ELSE 0 END) as revenue
FROM registrations
GROUP BY DATE(created_at), tier
ORDER BY registration_date DESC;

CREATE OR REPLACE VIEW v_seat_status AS
SELECT
    tier_name,
    display_name,
    total_seats,
    sold_seats,
    held_seats,
    (total_seats - sold_seats - held_seats) as available_seats,
    ROUND((sold_seats::NUMERIC / total_seats) * 100, 2) as sold_percentage,
    price_inr,
    is_active
FROM seat_inventory
ORDER BY sort_order;
