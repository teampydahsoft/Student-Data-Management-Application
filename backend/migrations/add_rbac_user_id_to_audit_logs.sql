-- Add rbac_user_id to audit_logs to track RBAC users (principal, AO, cashier, etc.)
-- These users live in rbac_users table, not the admins table.
ALTER TABLE audit_logs ADD COLUMN rbac_user_id INT NULL AFTER admin_id;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_rbac_user FOREIGN KEY (rbac_user_id) REFERENCES rbac_users(id) ON DELETE SET NULL;
CREATE INDEX idx_audit_rbac_user ON audit_logs (rbac_user_id);
