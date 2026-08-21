-- Migration: 030_add_industry_to_tenants.sql
-- Add industry column to tenants table

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS industry TEXT;
