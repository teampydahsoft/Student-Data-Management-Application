-- Allow semester calendar rows without configured start/end dates (skeleton seeding)

ALTER TABLE semesters MODIFY COLUMN start_date DATE NULL;
ALTER TABLE semesters MODIFY COLUMN end_date DATE NULL;
