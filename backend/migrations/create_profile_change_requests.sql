CREATE TABLE IF NOT EXISTS profile_change_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admission_number VARCHAR(50) NOT NULL,
    requested_changes JSON NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(50),
    comments TEXT,
    INDEX idx_admission_number (admission_number),
    INDEX idx_status (status)
);
