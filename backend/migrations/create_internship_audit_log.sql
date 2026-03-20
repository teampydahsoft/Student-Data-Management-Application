-- Migration: Create internship attendance audit log table
CREATE TABLE IF NOT EXISTS internship_attendance_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  internship_attendance_id INT NULL,
  student_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  old_status VARCHAR(30) NULL,
  new_status VARCHAR(30) NOT NULL,
  changed_by INT NOT NULL,
  changed_by_name VARCHAR(120) NOT NULL,
  reason TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_audit (student_id, attendance_date),
  INDEX idx_changed_by (changed_by),
  INDEX idx_changed_at (changed_at)
);
