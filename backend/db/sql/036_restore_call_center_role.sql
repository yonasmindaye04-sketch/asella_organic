-- 036_restore_call_center_role.sql
-- 035_store_manager.sql narrowed staff_users.role to an ENUM that omitted
-- 'call_center'. 034_call_center.sql deliberately made the column VARCHAR(30)
-- so new roles do not require an ENUM alteration. Restore that design.
--
-- Idempotent: safe to run on databases where 034 was already applied.

ALTER TABLE staff_users
  MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'employee';
