-- Migration: Add attendance report email tracking table
-- Purpose: Prevent duplicate day-end report emails to principals/HODs
-- Date: 2026-02-17

CREATE TABLE IF NOT EXISTS attendance_report_emails_sent (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_date DATE NOT NULL,
    college VARCHAR(255) NOT NULL,
    course VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_type ENUM('principal', 'hod', 'super_admin') NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_daily_report (report_date, college, course, recipient_email),
    INDEX idx_report_date (report_date),
    INDEX idx_recipient (recipient_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
