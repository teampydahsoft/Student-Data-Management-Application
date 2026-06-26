-- Pydah Student Database Management System Schema

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS student_database;
USE student_database;

-- Admin users table
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Staff users table (non-admin operators)
CREATE TABLE IF NOT EXISTS staff_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  assigned_modules JSON NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Students table with fixed fields
CREATE TABLE IF NOT EXISTS students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admission_number VARCHAR(100) NULL,
  admission_no VARCHAR(100) NULL,
  pin_no VARCHAR(50),
  current_year TINYINT DEFAULT 1,
  current_semester TINYINT DEFAULT 1,
  batch VARCHAR(50),
  course VARCHAR(100),
  branch VARCHAR(100),
  section VARCHAR(100),
  stud_type VARCHAR(50),
  student_name VARCHAR(255) NOT NULL,
  student_status VARCHAR(50),
  scholar_status VARCHAR(50),
  student_mobile VARCHAR(20),
  parent_mobile1 VARCHAR(20),
  parent_mobile2 VARCHAR(20),
  caste VARCHAR(50),
  gender ENUM('M', 'F', 'Other'),
  father_name VARCHAR(255),
  dob VARCHAR(50),
  adhar_no VARCHAR(20),
  admission_date VARCHAR(50),
  student_address TEXT,
  city_village VARCHAR(100),
  mandal_name VARCHAR(100),
  district VARCHAR(100),
  previous_college VARCHAR(255),
  certificates_status VARCHAR(100),
  student_photo LONGTEXT,
  remarks TEXT,
  custom_fields JSON,
  student_data LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admission_number (admission_number),
  INDEX idx_admission_no (admission_no),
  INDEX idx_pin_no (pin_no),
  INDEX idx_batch (batch),
  INDEX idx_course (course),
  INDEX idx_branch (branch)
);

-- Attendance records table
CREATE TABLE IF NOT EXISTS attendance_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  admission_number VARCHAR(100),
  attendance_date DATE NOT NULL,
  year TINYINT UNSIGNED NULL COMMENT 'Academic year of study when attendance was marked',
  semester TINYINT UNSIGNED NULL COMMENT 'Semester when attendance was marked',
  status ENUM('present','absent') NOT NULL,
  marked_by INT NULL,
  remarks TEXT,
  sms_sent TINYINT(1) DEFAULT 0 COMMENT 'Indicates if SMS notification was sent (1 = sent, 0 = not sent)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_date (student_id, attendance_date),
  INDEX idx_attendance_date (attendance_date),
  INDEX idx_status (status),
  INDEX idx_sms_sent (sms_sent),
  INDEX idx_year_semester (year, semester),
  CONSTRAINT fk_attendance_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE
);

-- Course configuration tables
CREATE TABLE IF NOT EXISTS courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  college_id INT NULL,
  total_years TINYINT NOT NULL DEFAULT 4,
  semesters_per_year TINYINT NOT NULL DEFAULT 2,
  metadata JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_course_name_college (college_id, name),
  UNIQUE KEY unique_course_code (code),
  INDEX idx_college_id (college_id),
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS course_branches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  total_years TINYINT,
  semesters_per_year TINYINT,
  metadata JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_branch_per_course (course_id, name),
  UNIQUE KEY unique_branch_code_per_course (course_id, code),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Forms table
CREATE TABLE IF NOT EXISTS forms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  form_id VARCHAR(100) UNIQUE NOT NULL,
  form_name VARCHAR(255) NOT NULL,
  form_description TEXT,
  form_fields JSON NOT NULL,
  qr_code_data LONGTEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_form_id (form_id),
  INDEX idx_is_active (is_active)
);

-- Form submissions table
CREATE TABLE IF NOT EXISTS form_submissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  submission_id VARCHAR(100) UNIQUE NOT NULL,
  form_id VARCHAR(100) NOT NULL,
  admission_number VARCHAR(100),
  submission_data LONGTEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  submitted_by ENUM('student', 'admin') DEFAULT 'student',
  submitted_by_admin INT NULL,
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES forms(form_id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by_admin) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_submission_id (submission_id),
  INDEX idx_form_id (form_id),
  INDEX idx_status (status),
  INDEX idx_admission_number (admission_number)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  admin_id INT,
  details JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_action (action_type),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created (created_at)
);

-- Filter fields configuration table
CREATE TABLE IF NOT EXISTS filter_fields (
  id INT PRIMARY KEY AUTO_INCREMENT,
  field_name VARCHAR(255) UNIQUE NOT NULL,
  field_type VARCHAR(50) DEFAULT 'text',
  enabled BOOLEAN DEFAULT TRUE,
  required BOOLEAN DEFAULT FALSE,
  options JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_field_name (field_name),
  INDEX idx_enabled (enabled)
);

-- Clubs Table (Single Table Architecture)
CREATE TABLE IF NOT EXISTS clubs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  image_url VARCHAR(255),
  form_fields JSON, -- Configuration for the joining form
  members JSON, -- Array of objects: { student_id, student_name, admission_number, status, submission_data, joined_at }
  activities JSON, -- Array of objects: { id, title, description, image_url, posted_by, posted_at }
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- Transport Requests Table (course/semester-wise academic context)
CREATE TABLE IF NOT EXISTS transport_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admission_number VARCHAR(100),
  student_name VARCHAR(255),
  route_id VARCHAR(100),
  route_name VARCHAR(255),
  stage_name VARCHAR(255),
  bus_id VARCHAR(100),
  fare DECIMAL(10, 2),
  status ENUM('pending', 'approved', 'rejected', 'expired') DEFAULT 'pending',
  request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  semester_id INT NULL,
  semester_start_date DATE NULL,
  semester_end_date DATE NULL,
  academic_year_id INT NULL,
  year_of_study TINYINT NULL,
  semester_number TINYINT NULL,
  INDEX idx_admission_number (admission_number),
  INDEX idx_semester_id (semester_id),
  INDEX idx_academic_year_id (academic_year_id)
);
