-- Migration 008: soft-delete audit columns
--
-- Adds `deleted_by`, `deleted_at_ip`, and `deleted_reason` columns to
-- soft-deletable tables. These let the team answer "who deleted this
-- order, from what IP, and why" — important for compliance, abuse
-- investigation, and accidental-delete recovery.
--
-- 008_soft_delete_audit.sql

-- Orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_by      CHAR(36)     NULL,
  ADD COLUMN IF NOT EXISTS deleted_at_ip   VARCHAR(45)  NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason  VARCHAR(500) NULL,
  ADD CONSTRAINT fk_orders_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES staff_users(id)
    ON DELETE SET NULL;

-- Staff users (used for staff-side deletions)
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS deleted_by      CHAR(36)     NULL,
  ADD COLUMN IF NOT EXISTS deleted_at_ip   VARCHAR(45)  NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason  VARCHAR(500) NULL;

-- Vendor orders
ALTER TABLE vendor_orders
  ADD COLUMN IF NOT EXISTS deleted_by      CHAR(36)     NULL,
  ADD COLUMN IF NOT EXISTS deleted_at_ip   VARCHAR(45)  NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason  VARCHAR(500) NULL;
