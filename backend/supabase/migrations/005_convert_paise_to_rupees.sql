-- ============================================
-- Migration: Convert all amounts from PAISE to RUPEES
-- This ensures users and admins always see amounts in rupees
-- The system will handle paise conversion internally for Razorpay
-- ============================================

-- Step 1: Convert seat_inventory prices from paise to rupees
UPDATE seat_inventory
SET price_inr = price_inr / 100
WHERE price_inr >= 100;  -- Only convert if looks like paise (>= ₹1)

-- Step 2: Convert existing registration amounts from paise to rupees
UPDATE registrations
SET amount_paid = amount_paid / 100
WHERE amount_paid >= 100;  -- Only convert if looks like paise (>= ₹1)

-- Step 3: Convert pending_orders amounts from paise to rupees
UPDATE pending_orders
SET amount = amount / 100
WHERE amount >= 100;  -- Only convert if looks like paise (>= ₹1)

-- Step 4: Convert waitlist livestream amount from paise to rupees
UPDATE waitlist
SET livestream_amount = livestream_amount / 100
WHERE livestream_amount >= 100;

-- Step 5: Convert payment_abandonments amounts from paise to rupees
UPDATE payment_abandonments
SET amount = amount / 100
WHERE amount >= 100;

-- Add comments to clarify the storage format
COMMENT ON COLUMN seat_inventory.price_inr IS 'Price in RUPEES (not paise). System converts to paise for Razorpay internally.';
COMMENT ON COLUMN registrations.amount_paid IS 'Amount paid in RUPEES (not paise).';
COMMENT ON COLUMN pending_orders.amount IS 'Amount in RUPEES (not paise).';
COMMENT ON COLUMN waitlist.livestream_amount IS 'Livestream price in RUPEES (not paise).';

-- Verify the conversion (optional - run separately to check)
-- SELECT tier_name, price_inr FROM seat_inventory;
-- Expected: vip=2499, standard=1499, basic=999, waitlist=699
