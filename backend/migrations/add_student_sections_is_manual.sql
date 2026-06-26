-- Track manual Section Partition assignments vs auto-sequential assignment (A/B/C by PIN order)
ALTER TABLE student_sections
  ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER section_name;
