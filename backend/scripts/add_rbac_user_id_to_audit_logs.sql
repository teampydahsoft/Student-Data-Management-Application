-- Migration: Add rbac_user_id column to audit_logs
-- This allows tracking actions performed by RBAC users (principal, AO, cashier, etc.)
-- who are stored in rbac_users table, not the legacy admins table.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS rbac_user_id INT NULL AFTER admin_id,
  ADD CONSTRAINT fk_audit_logs_rbac_user
    FOREIGN KEY (rbac_user_id) REFERENCES rbac_users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_rbac_user_id ON audit_logs (rbac_user_id);
