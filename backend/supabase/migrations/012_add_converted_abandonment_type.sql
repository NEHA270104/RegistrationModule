-- ============================================
-- Add 'converted' to abandonment_type enum
-- ============================================
-- The abandonment_type enum was missing 'converted' value,
-- which is needed when a user completes payment through a recovery link.

ALTER TYPE abandonment_type ADD VALUE IF NOT EXISTS 'converted';
