-- Migration: Update role column to VARCHAR
-- Purpose: Support dynamic and additional roles (faculty, support_staff, etc.)
-- Date: 2025-03-11

-- 1. Backup existing roles (optional, but good practice)
-- SELECT id, role FROM rbac_users;

-- 2. Modify column type from ENUM to VARCHAR(64)
-- We use VARCHAR(64) to provide enough space for any dynamic role keys
ALTER TABLE rbac_users MODIFY COLUMN role VARCHAR(64) NOT NULL;

-- 3. Verify the change
-- DESCRIBE rbac_users;
