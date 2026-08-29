-- Per-student, per-year merit status (yes / no)
USE student_database;

CREATE TABLE IF NOT EXISTS student_merit_status (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  student_year INT NOT NULL,
  merit_status ENUM('yes', 'no') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_year (student_id, student_year),
  INDEX idx_student_id (student_id),
  CONSTRAINT fk_merit_status_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
