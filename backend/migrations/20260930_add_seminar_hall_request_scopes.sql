ALTER TABLE seminar_hall_requests
  ADD COLUMN request_type ENUM('club', 'college') NOT NULL DEFAULT 'club',
  ADD COLUMN college_id INT NULL,
  ADD COLUMN course_id INT NULL,
  ADD COLUMN branch_id INT NULL,
  MODIFY COLUMN club_id INT NULL;