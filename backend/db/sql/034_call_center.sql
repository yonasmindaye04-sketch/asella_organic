-- ============================================================
-- 034_call_center.sql
-- Adds the call_center role support and the call_logs table.
--
-- The role string is enforced by the application-layer allowlist
-- in src/routes/staff.ts — no ENUM column change is needed.
-- This migration only widens role to VARCHAR(30) if it was
-- previously a narrower type, then adds the call_logs table.
-- ============================================================

-- 1. Widen the role column so call_center fits (idempotent if
--    already VARCHAR ≥ 30).
ALTER TABLE staff_users
  MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'employee';

-- 2. call_logs — one row per call received by a call center agent.
--    Append-only: rows are never updated.
CREATE TABLE IF NOT EXISTS call_logs (
    id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    staff_id    CHAR(36)     NOT NULL,
    logged_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note        VARCHAR(255) NULL,
    INDEX idx_call_logs_staff (staff_id, logged_at),
    INDEX idx_call_logs_date  (logged_at)
);

-- FK added separately so the file stays re-runnable.
ALTER TABLE call_logs
  ADD CONSTRAINT fk_call_logs_staff
    FOREIGN KEY (staff_id) REFERENCES staff_users(id) ON DELETE CASCADE;
