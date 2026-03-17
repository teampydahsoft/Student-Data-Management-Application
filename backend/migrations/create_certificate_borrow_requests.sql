-- Create certificate_borrow_requests table
CREATE TABLE IF NOT EXISTS certificate_borrow_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admission_number VARCHAR(100) NOT NULL,
  certificate_key VARCHAR(100) NOT NULL,
  certificate_name VARCHAR(255) NOT NULL,
  purpose TEXT,
  return_date DATE NOT NULL,
  status ENUM('pending', 'approved', 'issued', 'returned', 'rejected') DEFAULT 'pending',
  admin_remarks TEXT,
  request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  issued_at TIMESTAMP NULL,
  returned_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admission_number (admission_number),
  INDEX idx_status (status)
);
