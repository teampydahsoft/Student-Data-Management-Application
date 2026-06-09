-- Migration: Add address column to colleges table
-- Migration runner ignores ER_DUP_FIELDNAME if column already exists.

ALTER TABLE colleges ADD COLUMN address TEXT NULL AFTER code;
