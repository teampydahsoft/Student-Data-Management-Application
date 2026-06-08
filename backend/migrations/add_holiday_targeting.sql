-- Migration: Add targeting columns to custom_holidays for scoped institute holidays
-- Empty/NULL target columns mean "all students" for that dimension.

ALTER TABLE custom_holidays
  ADD COLUMN IF NOT EXISTS target_college TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_batch TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_course TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_branch TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_year TEXT NULL,
  ADD COLUMN IF NOT EXISTS target_semester TEXT NULL;

-- Remove single-date uniqueness so multiple scoped holidays can exist on the same day
ALTER TABLE custom_holidays DROP INDEX holiday_date;
CREATE INDEX idx_custom_holidays_date ON custom_holidays (holiday_date);
