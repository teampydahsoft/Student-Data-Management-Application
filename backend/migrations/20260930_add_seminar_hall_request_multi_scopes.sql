ALTER TABLE seminar_hall_requests
  ADD COLUMN club_ids JSON NULL,
  ADD COLUMN college_ids JSON NULL,
  ADD COLUMN course_ids JSON NULL,
  ADD COLUMN branch_ids JSON NULL;