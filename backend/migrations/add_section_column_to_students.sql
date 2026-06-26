-- Add section column to students table when missing (no-op if column already exists)
SET @has_section_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'students'
    AND COLUMN_NAME = 'section'
);

SET @add_section_sql := IF(
  @has_section_col = 0,
  'ALTER TABLE students ADD COLUMN section VARCHAR(100) NULL DEFAULT NULL AFTER branch',
  'SELECT 1'
);

PREPARE add_section_stmt FROM @add_section_sql;
EXECUTE add_section_stmt;
DEALLOCATE PREPARE add_section_stmt;
