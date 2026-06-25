-- Per-student section assignment scoped by branch + batch
CREATE TABLE IF NOT EXISTS student_sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  branch_id INT NOT NULL,
  batch VARCHAR(32) NOT NULL DEFAULT '',
  section_name VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student (student_id),
  INDEX idx_branch_batch_section (branch_id, batch, section_name),
  INDEX idx_branch_batch (branch_id, batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
