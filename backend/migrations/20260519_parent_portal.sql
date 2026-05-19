CREATE TABLE IF NOT EXISTS parent_engagement (
  student_id INT PRIMARY KEY,
  profile_view_count INT NOT NULL DEFAULT 0,
  attendance_view_count INT NOT NULL DEFAULT 0,
  last_viewed_at DATETIME NULL,
  last_parent_mobile VARCHAR(20) NULL,
  last_login_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_parent_engagement_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parent_view_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  parent_mobile VARCHAR(20) NOT NULL,
  page VARCHAR(32) NOT NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parent_view_student (student_id),
  INDEX idx_parent_view_mobile (parent_mobile),
  INDEX idx_parent_view_viewed_at (viewed_at),
  CONSTRAINT fk_parent_view_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
