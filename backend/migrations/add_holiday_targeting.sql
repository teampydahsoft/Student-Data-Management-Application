-- Migration: Add targeting columns to custom_holidays for scoped institute holidays
-- Empty/NULL target columns mean "all students" for that dimension.
-- Migration runner ignores ER_DUP_FIELDNAME if columns already exist.

ALTER TABLE custom_holidays ADD COLUMN target_college TEXT NULL;

ALTER TABLE custom_holidays ADD COLUMN target_batch TEXT NULL;

ALTER TABLE custom_holidays ADD COLUMN target_course TEXT NULL;

ALTER TABLE custom_holidays ADD COLUMN target_branch TEXT NULL;

ALTER TABLE custom_holidays ADD COLUMN target_year TEXT NULL;

ALTER TABLE custom_holidays ADD COLUMN target_semester TEXT NULL;

-- Remove single-date uniqueness so multiple scoped holidays can exist on the same day
ALTER TABLE custom_holidays DROP INDEX holiday_date;

CREATE INDEX idx_custom_holidays_date ON custom_holidays (holiday_date);
