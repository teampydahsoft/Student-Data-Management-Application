CREATE TABLE IF NOT EXISTS seminar_halls (
  id INT PRIMARY KEY AUTO_INCREMENT,
  hall_name VARCHAR(255) NOT NULL,
  location VARCHAR(255) NULL,
  capacity INT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_seminar_hall_name (hall_name),
  INDEX idx_seminar_halls_active (is_active)
);