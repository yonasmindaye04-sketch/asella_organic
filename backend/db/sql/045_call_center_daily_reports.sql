-- 045_call_center_daily_reports.sql
-- Replaces one-click call logging with one aggregated daily report per agent.
--
-- The agent enters total calls, orders placed and rejected calls. The delivery /
-- pickup and location / sales breakdowns are calculated from the orders the
-- agent actually created on that date and stored alongside the manual counts.

CREATE TABLE IF NOT EXISTS call_center_daily_reports (
    id                  CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    staff_id            CHAR(36)      NOT NULL,
    report_date         DATE          NOT NULL,
    calls_received      INT           NOT NULL DEFAULT 0,
    calls_ordered       INT           NOT NULL DEFAULT 0,
    calls_rejected      INT           NOT NULL DEFAULT 0,
    system_orders       INT           NOT NULL DEFAULT 0,
    delivery_orders     INT           NOT NULL DEFAULT 0,
    pickup_orders       INT           NOT NULL DEFAULT 0,
    other_type_orders   INT           NOT NULL DEFAULT 0,
    addis_orders        INT           NOT NULL DEFAULT 0,
    other_region_orders INT           NOT NULL DEFAULT 0,
    abroad_orders       INT           NOT NULL DEFAULT 0,
    total_sales         DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes               VARCHAR(500)  NULL,
    is_backdated        TINYINT(1)    NOT NULL DEFAULT 0,
    submitted_on        DATE          NULL,
    submitted_at        DATETIME      DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_call_center_daily_report (staff_id, report_date),
    KEY idx_call_center_daily_report_date (report_date),
    CONSTRAINT fk_call_center_daily_report_staff
        FOREIGN KEY (staff_id) REFERENCES staff_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;
