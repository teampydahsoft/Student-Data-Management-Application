-- Add optional remarks column to student_merit_status (safe to re-run)
USE student_database;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'student_merit_status'
    AND COLUMN_NAME = 'remarks'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE student_merit_status ADD COLUMN remarks TEXT NULL AFTER merit_status',
  'SELECT ''remarks column already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
