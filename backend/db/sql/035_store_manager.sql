-- 035_store_manager.sql
-- Adds the 'store_manager' role to staff_users and the store_reports table
-- for the Sub Store Admin restricted dashboard feature.

-- ── Role column ───────────────────────────────────────────────────────
-- 034 widened this to VARCHAR(30) so non-ENUM roles such as call_center
-- fit without another schema change. Keep it as VARCHAR here.
ALTER TABLE staff_users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'employee';

-- ── Store Reports ─────────────────────────────────────────────────────
-- Sub store managers submit daily pickup/sales reports here. The admin is
-- notified via Telegram and an in-app notification.
CREATE TABLE IF NOT EXISTS store_reports (
    id            CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    store_id      CHAR(36)      NOT NULL,
    report_date   DATE          NOT NULL,
    pickup_orders INT           NOT NULL DEFAULT 0,
    total_sales   DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes         VARCHAR(500)  NULL,
    submitted_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_store_reports_store_date ON store_reports(store_id, report_date);
CREATE INDEX idx_store_reports_submitted  ON store_reports(submitted_at);
