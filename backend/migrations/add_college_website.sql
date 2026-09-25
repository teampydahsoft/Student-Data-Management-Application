-- Migration: Add website column to colleges table
-- Migration runner ignores ER_DUP_FIELDNAME if column already exists.

ALTER TABLE colleges ADD COLUMN website VARCHAR(255) NULL AFTER address;
