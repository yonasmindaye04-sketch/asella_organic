-- ===================================================================
-- 048_fix_inventory_summary_value.sql
-- Asella Organic -- Inventory valuation consistency
-- ===================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- 043_v2_views.sql defined vw_inventory_summary.total_stock_value as
--   SUM(inventory_quantity * price)
-- i.e. the RETAIL value of stock on hand.
--
-- The application's stock KPI (/api/stock/summary) uses
--   SUM(inventory_quantity * COALESCE(unit_cost, 0))
-- i.e. the COST value. The two figures therefore disagree by the
-- markup (currently ~236,770 ETB), which makes it look as though
-- stock value jumped whenever someone compares the view with the UI.
--
-- This migration aligns the view with the application's definition.
-- The retail figure remains available from
--   SUM(inventory_quantity * price)
-- for anyone who needs it, but it is no longer labelled "stock value".
--
-- Idempotent: CREATE OR REPLACE VIEW.
-- ===================================================================

CREATE OR REPLACE VIEW vw_inventory_summary AS
SELECT
    COUNT(*)                                                                         AS total_products,
    SUM(inventory_quantity)                                                          AS total_units,
    SUM(CASE WHEN inventory_quantity = 0                        THEN 1 ELSE 0 END)  AS out_of_stock_count,
    SUM(CASE WHEN inventory_quantity > 0
              AND inventory_quantity <= low_stock_threshold / 2 THEN 1 ELSE 0 END)  AS critical_count,
    SUM(CASE WHEN inventory_quantity > low_stock_threshold / 2
              AND inventory_quantity <= low_stock_threshold      THEN 1 ELSE 0 END)  AS low_count,
    SUM(CASE WHEN inventory_quantity > low_stock_threshold       THEN 1 ELSE 0 END)  AS ok_count,
    SUM(inventory_quantity * COALESCE(unit_cost, 0))                                 AS total_stock_value
FROM products
WHERE active = TRUE;
