-- Fix foreign key constraint for internship_backdate_rights
-- It was incorrectly pointing to 'users' table, but should point to 'rbac_users'

-- 1. Identify and drop the existing constraint
-- The constraint name from the error message is 'internship_backdate_rights_ibfk_2'
ALTER TABLE internship_backdate_rights DROP FOREIGN KEY internship_backdate_rights_ibfk_2;

-- 2. Add the correct constraint pointing to rbac_users
ALTER TABLE internship_backdate_rights 
ADD CONSTRAINT fk_backdate_rights_granted_by 
FOREIGN KEY (granted_by) REFERENCES rbac_users(id);

-- Optional: Verify the change
-- SHOW CREATE TABLE internship_backdate_rights;
