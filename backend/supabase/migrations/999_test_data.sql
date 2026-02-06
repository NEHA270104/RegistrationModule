    -- ============================================
    -- TEST DATA SCRIPT
    -- AI Summit for MSME Business Owners 2026
    -- Run this ONLY in development/testing environment
    -- ============================================

    -- WARNING: This will insert test data. DO NOT run in production!

    -- ============================================
    -- Clear existing test data (optional - uncomment if needed)
    -- ============================================
    -- DELETE FROM payment_abandonments WHERE email LIKE '%@test.example.com';
    -- DELETE FROM registrations WHERE email LIKE '%@test.example.com';
    -- DELETE FROM waitlist WHERE email LIKE '%@test.example.com';

    -- ============================================
    -- Reset Seat Inventory to Default
    -- ============================================
    UPDATE seat_inventory SET
        sold_seats = 0,
        held_seats = 0,
        updated_at = NOW()
    WHERE tier_name IN ('vip', 'standard', 'basic');

    -- ============================================
    -- TEST REGISTRATIONS - Various Statuses
    -- ============================================

    -- 1. CONFIRMED Registrations (Successful Payments)
    INSERT INTO registrations (
        booking_id, name, email, phone, business_name, industry, revenue_range,
        tier, amount_paid, payment_status, registration_status,
        razorpay_order_id, razorpay_payment_id, payment_confirmed_at,
        utm_source, utm_campaign, created_at
    ) VALUES
    -- VIP/Executive Tier - Confirmed
    ('BF-2026-T00001', 'Rajesh Kumar', 'rajesh.kumar@test.example.com', '9876543001', 'Kumar Industries Pvt Ltd', 'manufacturing', '1cr_5cr', 'vip', 2499, 'confirmed', 'confirmed', 'order_test_001', 'pay_test_001', NOW() - INTERVAL '5 days', 'google', 'summit2026', NOW() - INTERVAL '5 days'),
    ('BF-2026-T00002', 'Priya Sharma', 'priya.sharma@test.example.com', '9876543002', 'Sharma Tech Solutions', 'it_services', '50l_1cr', 'vip', 2499, 'confirmed', 'confirmed', 'order_test_002', 'pay_test_002', NOW() - INTERVAL '4 days', 'linkedin', 'earlybird', NOW() - INTERVAL '4 days'),

    -- Standard/Business Tier - Confirmed
    ('BF-2026-T00003', 'Amit Patel', 'amit.patel@test.example.com', '9876543003', 'Patel Trading Co', 'retail', '10l_50l', 'standard', 1499, 'confirmed', 'confirmed', 'order_test_003', 'pay_test_003', NOW() - INTERVAL '3 days', 'facebook', 'summit2026', NOW() - INTERVAL '3 days'),
    ('BF-2026-T00004', 'Sneha Reddy', 'sneha.reddy@test.example.com', '9876543004', 'Reddy Foods', 'food', '1cr_5cr', 'standard', 1499, 'confirmed', 'confirmed', 'order_test_004', 'pay_test_004', NOW() - INTERVAL '3 days', 'instagram', NULL, NOW() - INTERVAL '3 days'),
    ('BF-2026-T00005', 'Vikram Singh', 'vikram.singh@test.example.com', '9876543005', 'Singh Healthcare', 'healthcare', '50l_1cr', 'standard', 1499, 'confirmed', 'confirmed', 'order_test_005', 'pay_test_005', NOW() - INTERVAL '2 days', 'google', 'summit2026', NOW() - INTERVAL '2 days'),

    -- Basic/Growth Tier - Confirmed
    ('BF-2026-T00006', 'Meera Joshi', 'meera.joshi@test.example.com', '9876543006', 'Joshi Consultancy', 'finance', '10l_50l', 'basic', 999, 'confirmed', 'confirmed', 'order_test_006', 'pay_test_006', NOW() - INTERVAL '2 days', 'twitter', 'earlybird', NOW() - INTERVAL '2 days'),
    ('BF-2026-T00007', 'Arjun Nair', 'arjun.nair@test.example.com', '9876543007', 'Nair Exports', 'manufacturing', 'below_10l', 'basic', 999, 'confirmed', 'confirmed', 'order_test_007', 'pay_test_007', NOW() - INTERVAL '1 day', 'referral', NULL, NOW() - INTERVAL '1 day'),

    -- 2. PENDING Registrations (Awaiting Payment - Held Seats)
    ('BF-2026-T00008', 'Kiran Desai', 'kiran.desai@test.example.com', '9876543008', 'Desai Textiles', 'manufacturing', '1cr_5cr', 'vip', 2499, 'pending', 'pending', 'order_test_008', NULL, NULL, 'google', 'summit2026', NOW() - INTERVAL '30 minutes'),
    ('BF-2026-T00009', 'Ananya Gupta', 'ananya.gupta@test.example.com', '9876543009', 'Gupta Enterprises', 'retail', '50l_1cr', 'standard', 1499, 'pending', 'pending', 'order_test_009', NULL, NULL, 'facebook', NULL, NOW() - INTERVAL '45 minutes'),
    ('BF-2026-T00010', 'Rohan Mehta', 'rohan.mehta@test.example.com', '9876543010', 'Mehta Solutions', 'it_services', '10l_50l', 'basic', 999, 'pending', 'pending', 'order_test_010', NULL, NULL, 'linkedin', 'earlybird', NOW() - INTERVAL '20 minutes'),

    -- 3. PENDING Registrations (EXPIRED - older than 1 hour, should show as expired)
    ('BF-2026-T00011', 'Sanjay Verma', 'sanjay.verma@test.example.com', '9876543011', 'Verma Motors', 'retail', '5cr_above', 'vip', 2499, 'pending', 'pending', 'order_test_011', NULL, NULL, 'google', 'summit2026', NOW() - INTERVAL '2 hours'),
    ('BF-2026-T00012', 'Deepa Iyer', 'deepa.iyer@test.example.com', '9876543012', 'Iyer Analytics', 'it_services', '50l_1cr', 'standard', 1499, 'pending', 'pending', 'order_test_012', NULL, NULL, 'linkedin', NULL, NOW() - INTERVAL '90 minutes'),

    -- 4. FAILED Registrations (Payment Failed - Need Follow-up Call)
    ('BF-2026-T00013', 'Nitin Agarwal', 'nitin.agarwal@test.example.com', '9876543013', 'Agarwal Steels', 'manufacturing', '1cr_5cr', 'vip', 2499, 'failed', 'cancelled', 'order_test_013', NULL, NULL, 'google', 'summit2026', NOW() - INTERVAL '1 day'),
    ('BF-2026-T00014', 'Kavita Rao', 'kavita.rao@test.example.com', '9876543014', 'Rao Pharma', 'healthcare', '50l_1cr', 'standard', 1499, 'failed', 'cancelled', 'order_test_014', NULL, NULL, 'facebook', 'earlybird', NOW() - INTERVAL '12 hours'),
    ('BF-2026-T00015', 'Suresh Menon', 'suresh.menon@test.example.com', '9876543015', 'Menon Logistics', 'retail', '10l_50l', 'basic', 999, 'failed', 'cancelled', 'order_test_015', NULL, NULL, 'instagram', NULL, NOW() - INTERVAL '6 hours')

    ON CONFLICT (booking_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        payment_status = EXCLUDED.payment_status,
        updated_at = NOW();

    -- ============================================
    -- Update Seat Inventory based on registrations
    -- ============================================
    -- VIP: 2 confirmed + 2 pending (1 active + 1 expired) + 1 failed
    UPDATE seat_inventory SET
        sold_seats = 2,
        held_seats = 2,
        updated_at = NOW()
    WHERE tier_name = 'vip';

    -- Standard: 3 confirmed + 2 pending (1 active + 1 expired) + 1 failed
    UPDATE seat_inventory SET
        sold_seats = 3,
        held_seats = 2,
        updated_at = NOW()
    WHERE tier_name = 'standard';

    -- Basic: 2 confirmed + 1 pending + 1 failed
    UPDATE seat_inventory SET
        sold_seats = 2,
        held_seats = 1,
        updated_at = NOW()
    WHERE tier_name = 'basic';

    -- ============================================
    -- TEST ABANDONMENTS (if table exists)
    -- ============================================
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_abandonments') THEN
            INSERT INTO payment_abandonments (
                registration_id, razorpay_order_id, name, email, phone, business_name,
                tier, amount, abandonment_type, abandonment_reason, followup_status,
                followup_attempts, abandoned_at, created_at
            )
            SELECT
                r.id, r.razorpay_order_id, r.name, r.email, r.phone, r.business_name,
                r.tier, r.amount_paid,
                CASE
                    WHEN r.booking_id = 'BF-2026-T00013' THEN 'failed'::abandonment_type
                    WHEN r.booking_id = 'BF-2026-T00014' THEN 'cancelled'::abandonment_type
                    ELSE 'timeout'::abandonment_type
                END,
                CASE
                    WHEN r.booking_id = 'BF-2026-T00013' THEN 'Razorpay payment failed - card declined'
                    WHEN r.booking_id = 'BF-2026-T00014' THEN 'User cancelled payment modal'
                    ELSE 'Payment not completed within 1 hour'
                END,
                'pending'::followup_status,
                0,
                r.created_at + INTERVAL '5 minutes',
                r.created_at + INTERVAL '5 minutes'
            FROM registrations r
            WHERE r.booking_id IN ('BF-2026-T00013', 'BF-2026-T00014', 'BF-2026-T00015')
            ON CONFLICT DO NOTHING;

            RAISE NOTICE 'Abandonments table populated';
        ELSE
            RAISE NOTICE 'Abandonments table does not exist - skipping';
        END IF;
    END $$;

    -- ============================================
    -- TEST WAITLIST ENTRIES
    -- ============================================
    DELETE FROM waitlist WHERE email LIKE '%@test.example.com';

    INSERT INTO waitlist (
        name, email, phone, business_name, industry,
        preferred_tier, position, has_livestream_access, created_at
    ) VALUES
    ('Pooja Saxena', 'pooja.saxena@test.example.com', '9876543020', 'Saxena Media', 'education', 'vip', 1, false, NOW() - INTERVAL '3 days'),
    ('Rahul Kapoor', 'rahul.kapoor@test.example.com', '9876543021', 'Kapoor Films', 'other', 'standard', 2, true, NOW() - INTERVAL '2 days'),
    ('Divya Bhat', 'divya.bhat@test.example.com', '9876543022', 'Bhat Designs', 'it_services', 'basic', 3, false, NOW() - INTERVAL '1 day');

    -- ============================================
    -- Verification Query
    -- ============================================
    SELECT 'REGISTRATIONS' as table_name, payment_status::TEXT as detail, COUNT(*)::INTEGER as count
    FROM registrations
    WHERE email LIKE '%@test.example.com'
    GROUP BY payment_status

    UNION ALL

    SELECT 'SEAT_INVENTORY', tier_name::TEXT, (sold_seats + held_seats)::INTEGER
    FROM seat_inventory

    UNION ALL

    SELECT 'WAITLIST', 'total', COUNT(*)::INTEGER
    FROM waitlist
    WHERE email LIKE '%@test.example.com';
