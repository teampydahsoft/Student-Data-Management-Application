-- Migration: Add 'pending' to attendance_records.status ENUM
-- Pending = system auto-marked at 4 PM IST for unmarked students; must be resolved next day.

ALTER TABLE attendance_records
MODIFY COLUMN status ENUM('present','absent','holiday','pending') NOT NULL;
