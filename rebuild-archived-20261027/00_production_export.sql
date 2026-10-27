-- ===================================================================
-- 00_production_export.sql
-- Read-only exports for the Asella Organic clean rebuild.
--
-- Run each numbered block separately in phpMyAdmin on
-- asellafs_organic. Export the result grid as CSV where indicated.
-- Do not run 026_repair_catalog.sql.
-- ===================================================================

-- -------------------------------------------------------------------
-- 1. ACTIVE CATALOG -> export as catalog-active.csv
--
-- One row per active variant. After export:
--   * correct price, unit_cost, opening_stock, low_stock_threshold
--   * set verified = 1
--   * leave product_id in place so existing IDs are preserved
-- -------------------------------------------------------------------
SELECT
  p.id                              AS product_id,
  p.name                            AS group_name,
  ''                                AS group_slug,
  COALESCE(p.description, '')       AS group_description,
  COALESCE(p.image_url, '')         AS group_image_url,
  p.featured                        AS group_featured,
  COALESCE(p.tag, '')               AS group_tag,
  1                                 AS group_active,
  p.name                            AS variant_name,
  p.package_size                    AS package_size,
  ''                                AS sku,
  p.price                           AS price,
  p.unit_cost                       AS unit_cost,
  p.inventory_quantity              AS opening_stock,
  p.low_stock_threshold             AS low_stock_threshold,
  p.active                          AS variant_active,
  ''                                AS aliases,
  'production_export'               AS source,
  0                                 AS verified,
  ''                                AS notes
FROM products p
WHERE p.active = 1
ORDER BY p.name, p.package_size;

-- -------------------------------------------------------------------
-- 1b. FULL CANONICAL CATALOG (active + inactive) -> catalog-active.csv
--
-- Recommended over query 1 because it includes every active product
-- (including the two non-canonical IDs) plus the seven inactive
-- canonical products, so their groups and product IDs survive.
-- Set variant_active = 0 for the seven inactive rows, then set
-- verified = 1 after correcting price, cost, and stock.
-- -------------------------------------------------------------------
SELECT
  p.id                              AS product_id,
  p.name                            AS group_name,
  ''                                AS group_slug,
  COALESCE(p.description, '')       AS group_description,
  COALESCE(p.image_url, '')         AS group_image_url,
  p.featured                        AS group_featured,
  COALESCE(p.tag, '')               AS group_tag,
  CASE WHEN EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.name = p.name AND p2.active = 1
  ) THEN 1 ELSE 0 END               AS group_active,
  p.name                            AS variant_name,
  p.package_size                    AS package_size,
  ''                                AS sku,
  p.price                           AS price,
  p.unit_cost                       AS unit_cost,
  p.inventory_quantity              AS opening_stock,
  p.low_stock_threshold             AS low_stock_threshold,
  p.active                          AS variant_active,
  ''                                AS aliases,
  'production_export'               AS source,
  0                                 AS verified,
  CASE WHEN p.active = 0 THEN 'INACTIVE canonical variant - keep inactive unless business approves' ELSE '' END AS notes
FROM products p
WHERE p.active = 1
   OR p.id LIKE '11111111-0001-0001-0001-%'
ORDER BY p.name, p.package_size;

-- -------------------------------------------------------------------
-- 2. INACTIVE CANONICAL PRODUCTS
--
-- These are the seven canonical products production deactivated.
-- Do not reactivate them without a business decision.
-- -------------------------------------------------------------------
SELECT
  id, name, package_size, price, unit_cost,
  inventory_quantity, low_stock_threshold, active, deleted_at
FROM products
WHERE id LIKE '11111111-0001-0001-0001-%'
  AND active = 0
ORDER BY name, package_size;

-- -------------------------------------------------------------------
-- 3. LEGACY ORDER-ITEM DECISIONS -> export as legacy-source.csv
--
-- One row per distinct (item_name, package_size) in order_items.
-- `not_active` includes NULL product_id, inactive products, and
-- products whose active flag is NULL.
-- -------------------------------------------------------------------
SELECT
  oi.item_name                                   AS legacy_name,
  oi.package_size                                AS legacy_size,
  COUNT(*)                                       AS items,
  SUM(oi.product_id IS NULL)                     AS null_pid,
  SUM(p.active = 1)                              AS active_pid,
  SUM(p.active = 0)                              AS inactive_pid,
  COUNT(*) - SUM(oi.product_id IS NULL) - COALESCE(SUM(p.active = 1), 0) AS not_active
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
GROUP BY oi.item_name, oi.package_size
ORDER BY items DESC, legacy_name, legacy_size;

-- -------------------------------------------------------------------
-- 4. ORDER-TOTAL MISMATCHES
--
-- This is the audit set. Do not update orders.total from this query.
-- -------------------------------------------------------------------
SELECT *
FROM (
  SELECT
    o.id,
    o.total,
    ROUND(SUM(oi.quantity * oi.unit_price), 2) AS line_total,
    ROUND(o.total - SUM(oi.quantity * oi.unit_price), 2) AS diff,
    CASE
      WHEN COUNT(DISTINCT oi.unit_price) = 1 AND COUNT(*) > 1 THEN 'smeared'
      WHEN o.total > SUM(oi.quantity * oi.unit_price) THEN 'order_total_high'
      ELSE 'line_total_high'
    END AS pattern
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id, o.total
) x
WHERE ABS(x.diff) > 0.01
ORDER BY ABS(x.diff) DESC;

-- -------------------------------------------------------------------
-- 5. ORDER-TOTAL PATTERN SUMMARY
-- -------------------------------------------------------------------
SELECT
  x.pattern,
  COUNT(*) AS order_count,
  ROUND(SUM(x.diff), 2) AS net_diff,
  ROUND(MIN(x.diff), 2) AS min_diff,
  ROUND(MAX(x.diff), 2) AS max_diff
FROM (
  SELECT
    o.id,
    o.total - SUM(oi.quantity * oi.unit_price) AS diff,
    CASE
      WHEN COUNT(DISTINCT oi.unit_price) = 1 AND COUNT(*) > 1 THEN 'smeared'
      WHEN o.total > SUM(oi.quantity * oi.unit_price) THEN 'order_total_high'
      ELSE 'line_total_high'
    END AS pattern
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id, o.total
  HAVING ABS(o.total - SUM(oi.quantity * oi.unit_price)) > 0.01
) x
GROUP BY x.pattern;

-- -------------------------------------------------------------------
-- 6. ROW COUNTS
-- -------------------------------------------------------------------
SELECT 'products' AS table_name, COUNT(*) AS row_count FROM products
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
UNION ALL SELECT 'stock_snapshots', COUNT(*) FROM stock_snapshots
UNION ALL SELECT 'stock_requests', COUNT(*) FROM stock_requests
UNION ALL SELECT 'vendor_orders', COUNT(*) FROM vendor_orders
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'order_status_history', COUNT(*) FROM order_status_history
UNION ALL SELECT 'delivery_assignments', COUNT(*) FROM delivery_assignments
UNION ALL SELECT 'staff_users', COUNT(*) FROM staff_users
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;

-- -------------------------------------------------------------------
-- 7. PRODUCTS TABLE SHAPE
--
-- Compare this with the v2 schema before applying the migration.
-- -------------------------------------------------------------------
SELECT
  COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'products'
ORDER BY ORDINAL_POSITION;

-- -------------------------------------------------------------------
-- 8. ORDER_ITEMS TABLE SHAPE
-- -------------------------------------------------------------------
SELECT
  COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'order_items'
ORDER BY ORDINAL_POSITION;

-- -------------------------------------------------------------------
-- 9. ACTIVE FLAG DISTRIBUTION
--
-- NULL active flags explain rows that are neither active nor inactive.
-- -------------------------------------------------------------------
SELECT
  CASE
    WHEN active IS NULL THEN 'NULL'
    WHEN active = 1 THEN 'active'
    ELSE 'inactive'
  END AS active_state,
  COUNT(*) AS products,
  SUM(inventory_quantity) AS units
FROM products
GROUP BY active_state
ORDER BY active_state;

-- -------------------------------------------------------------------
-- 10. DUPLICATE ACTIVE VARIANTS
--
-- Must return zero rows before adding the unique index.
-- -------------------------------------------------------------------
SELECT name, package_size, COUNT(*) AS duplicate_count
FROM products
WHERE active = 1
GROUP BY name, package_size
HAVING COUNT(*) > 1;

-- -------------------------------------------------------------------
-- 11. ZERO-PRICE / ZERO-COST ACTIVE VARIANTS
-- -------------------------------------------------------------------
SELECT id, name, package_size, price, unit_cost, inventory_quantity
FROM products
WHERE active = 1
  AND (price = 0 OR unit_cost = 0 OR unit_cost IS NULL)
ORDER BY name, package_size;

-- -------------------------------------------------------------------
-- 12. ORDERS WITHOUT ITEMS
-- -------------------------------------------------------------------
SELECT COUNT(*) AS orders_without_items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE oi.id IS NULL;

-- -------------------------------------------------------------------
-- 13. ACTIVE LINKS WITH MISMATCHED SNAPSHOT TEXT
--
-- These links may be correct even when the text differs (renames).
-- They are a review list, not an automatic remap list.
-- -------------------------------------------------------------------
SELECT
  oi.item_name,
  oi.package_size,
  p.name AS linked_name,
  p.package_size AS linked_size,
  COUNT(*) AS items
FROM order_items oi
JOIN products p ON p.id = oi.product_id AND p.active = 1
WHERE LOWER(TRIM(oi.item_name)) <> LOWER(TRIM(p.name))
   OR REPLACE(LOWER(TRIM(oi.package_size)), ' ', '') <>
      REPLACE(LOWER(TRIM(p.package_size)), ' ', '')
GROUP BY oi.item_name, oi.package_size, p.name, p.package_size
ORDER BY items DESC;
