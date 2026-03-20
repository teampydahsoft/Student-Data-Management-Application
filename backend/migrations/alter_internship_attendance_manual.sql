-- Migration: Add manual marking columns to internship_attendance
-- Compatible with all MySQL versions. Runner handles ER_DUP_FIELDNAME gracefully.

ALTER TABLE internship_attendance ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE internship_attendance ADD COLUMN marked_by INT NULL;

ALTER TABLE internship_attendance ADD COLUMN marked_by_name VARCHAR(120) NULL;

ALTER TABLE internship_attendance ADD COLUMN manual_reason TEXT NULL;
