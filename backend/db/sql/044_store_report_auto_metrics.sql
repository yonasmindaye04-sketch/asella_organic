-- 044_store_report_auto_metrics.sql
-- Store reports are now derived from the orders a sub-store manager placed.
-- Persist the full calculated breakdown and flag reports submitted for a date
-- other than the day they were entered (backdated submissions are also written
-- to audit_log with the included order IDs).

ALTER TABLE store_reports
  ADD COLUMN total_orders    INT          NOT NULL DEFAULT 0 AFTER report_date,
  ADD COLUMN delivery_orders INT          NOT NULL DEFAULT 0 AFTER pickup_orders,
  ADD COLUMN is_backdated    TINYINT(1)   NOT NULL DEFAULT 0 AFTER total_sales,
  ADD COLUMN submitted_on    DATE         NULL AFTER is_backdated;

UPDATE store_reports
SET submitted_on = DATE(submitted_at)
WHERE submitted_on IS NULL;
