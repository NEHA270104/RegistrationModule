-- ============================================
-- Fix booking_id generation:
-- 1. Handle non-numeric suffixes (e.g., test data with BF-2026-T00001)
-- 2. Add locking to prevent race conditions on concurrent inserts
-- ============================================

CREATE OR REPLACE FUNCTION generate_booking_id()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_id VARCHAR(20);
    counter INTEGER;
BEGIN
    -- Lock registrations table to prevent concurrent reads of the same max counter
    LOCK TABLE registrations IN SHARE ROW EXCLUSIVE MODE;

    -- Only consider booking IDs with purely numeric suffixes (skip test data like T00001)
    SELECT COALESCE(MAX(CAST(SUBSTRING(booking_id FROM 9) AS INTEGER)), 0) + 1
    INTO counter
    FROM registrations
    WHERE booking_id LIKE 'BF-2026-%'
      AND SUBSTRING(booking_id FROM 9) ~ '^\d+$';

    new_id := 'BF-2026-' || LPAD(counter::TEXT, 6, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;
