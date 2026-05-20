-- Migration: Add student_quotas table for configurable admission quotas
USE student_database;

CREATE TABLE IF NOT EXISTS student_quotas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_quota_name (name),
  UNIQUE KEY unique_quota_code (code),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO student_quotas (name, code, sort_order) VALUES
  ('Convenor Quota', 'CONV', 1),
  ('Lateral Entry', 'LATER', 2),
  ('Lateral Spot', 'LSPOT', 3),
  ('Management Quota', 'MANG', 4),
  ('Spot Admission', 'SPOT', 5)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sort_order = VALUES(sort_order),
  updated_at = CURRENT_TIMESTAMP;
