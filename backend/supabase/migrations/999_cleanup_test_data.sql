-- ============================================
-- CLEANUP TEST DATA
-- Run this after testing to remove all test entries
-- ============================================

-- 1. Delete abandonments first (references registrations via foreign key)
DELETE FROM payment_abandonments
WHERE email LIKE '%@test.example.com';

-- 2. Delete test registrations
DELETE FROM registrations
WHERE email LIKE '%@test.example.com';

-- 3. Delete test waitlist entries
DELETE FROM waitlist
WHERE email LIKE '%@test.example.com';

-- 4. Reset seat inventory back to actual counts
UPDATE seat_inventory SET
    sold_seats = (SELECT COUNT(*) FROM registrations WHERE tier = seat_inventory.tier_name AND payment_status = 'confirmed'),
    held_seats = (SELECT COUNT(*) FROM registrations WHERE tier = seat_inventory.tier_name AND payment_status = 'pending'),
    updated_at = NOW();

-- 5. Verify cleanup
SELECT 'REGISTRATIONS' as table_name, COUNT(*) as remaining
FROM registrations WHERE email LIKE '%@test.example.com'
UNION ALL
SELECT 'WAITLIST', COUNT(*) FROM waitlist WHERE email LIKE '%@test.example.com'
UNION ALL
SELECT 'ABANDONMENTS', COUNT(*) FROM payment_abandonments WHERE email LIKE '%@test.example.com';
