-- ===================================================================
-- 06_validate.sql
-- Read-only validation for the v2 database.
--
-- Run after 035-043 migrations, import-catalog.cjs, map-order-items.cjs,
-- and 042_v2_order_item_fk.sql.
-- Every "must be empty" query should return zero rows.
-- ===================================================================

SELECT '1. Catalog size' AS check_name;
SELECT
  (SELECT COUNT(*) FROM product_groups) AS groups_total,
  (SELECT COUNT(*) FROM product_groups WHERE active = 1) AS groups_active,
  (SELECT COUNT(*) FROM products WHERE product_group_id IS NOT NULL) AS catalog_variants,
  (SELECT COUNT(*) FROM products WHERE product_group_id IS NULL) AS legacy_variants,
  (SELECT COUNT(*) FROM products WHERE active = 1) AS active_variants,
  (SELECT COUNT(DISTINCT product_group_id) FROM products WHERE active = 1) AS active_groups_with_variants,
  (SELECT SUM(inventory_quantity) FROM products WHERE active = 1) AS active_units;

SELECT '2. Active variants without a group (must be empty)' AS check_name;
SELECT id, name, package_size, active
FROM products
WHERE active = 1 AND product_group_id IS NULL;

SELECT '3. Duplicate active group/size variants (must be empty)' AS check_name;
SELECT product_group_id, package_size, COUNT(*) AS duplicate_count
FROM products
WHERE active = 1
GROUP BY product_group_id, package_size
HAVING COUNT(*) > 1;

SELECT '4. Active groups with no active variant' AS check_name;
SELECT g.id, g.name, g.slug
FROM product_groups g
LEFT JOIN products p ON p.product_group_id = g.id AND p.active = 1
WHERE g.active = 1 AND p.id IS NULL
ORDER BY g.name;

SELECT '5. Stock ledger drift (must be empty)' AS check_name;
SELECT *
FROM (
  SELECT
    p.id, p.name, p.package_size,
    p.inventory_quantity AS current_qty,
    COALESCE(SUM(m.change_amount), 0) AS ledger_qty,
    p.inventory_quantity - COALESCE(SUM(m.change_amount), 0) AS drift
  FROM products p
  LEFT JOIN inventory_movements m ON m.product_id = p.id
  WHERE p.active = 1
  GROUP BY p.id, p.name, p.package_size, p.inventory_quantity
) x
WHERE x.drift <> 0
ORDER BY ABS(x.drift) DESC;

SELECT '6. Stock snapshot mismatch (must be empty)' AS check_name;
SELECT p.id, p.name, p.package_size, p.inventory_quantity, s.current_quantity
FROM products p
LEFT JOIN stock_snapshots s ON s.product_id = p.id
WHERE p.active = 1
  AND (s.product_id IS NULL OR s.current_quantity <> p.inventory_quantity)
ORDER BY p.name, p.package_size;

-- Check 7: Order items without an active variant.
-- This intentionally counts items linked to inactive variants (historical
-- accuracy) as well as genuinely unlinked items. The count is informational;
-- it is not a hard failure because inactive-linked history is expected.
SELECT '7. Order items without an active variant (informational)' AS check_name;
SELECT COUNT(*) AS remaining_unlinked
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id AND p.active = 1
WHERE p.id IS NULL;

SELECT '8. Remaining unlinked by legacy name/size' AS check_name;
SELECT oi.item_name, oi.package_size, COUNT(*) AS items
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id AND p.active = 1
WHERE p.id IS NULL
GROUP BY oi.item_name, oi.package_size
ORDER BY items DESC;

SELECT '9. Order-item mapping status' AS check_name;
SELECT
  COALESCE(oi.product_match_type, 'none') AS match_type,
  COUNT(*) AS items,
  SUM(oi.product_id IS NULL) AS null_product_id,
  SUM(p.active = 1) AS active_link
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
GROUP BY COALESCE(oi.product_match_type, 'none')
ORDER BY items DESC;

SELECT '10. Legacy map decisions' AS check_name;
SELECT decision, match_type, confidence, COUNT(*) AS rows_count
FROM legacy_sku_map
GROUP BY decision, match_type, confidence
ORDER BY decision, match_type, confidence;

SELECT '11. MAP rows without a target (must be empty)' AS check_name;
SELECT legacy_name, legacy_size, target_group_name, target_package_size
FROM legacy_sku_map
WHERE decision = 'MAP' AND target_product_id IS NULL;

SELECT '12. Order-total audit summary' AS check_name;
SELECT status, COUNT(*) AS orders, ROUND(SUM(old_total), 2) AS old_total,
       ROUND(SUM(line_total), 2) AS line_total,
       ROUND(SUM(line_total - old_total), 2) AS net_diff
FROM order_total_audit
GROUP BY status;

SELECT '13. Order-total audit detail' AS check_name;
SELECT order_id, old_total, line_total, ROUND(line_total - old_total, 2) AS diff, status
FROM order_total_audit
ORDER BY ABS(line_total - old_total) DESC
LIMIT 50;

SELECT '14. Zero-cost active variants' AS check_name;
SELECT id, name, package_size, price, unit_cost, inventory_quantity
FROM products
WHERE active = 1 AND (unit_cost = 0 OR unit_cost IS NULL)
ORDER BY name, package_size;

SELECT '15. Duplicate non-null SKUs (must be empty)' AS check_name;
SELECT sku, COUNT(*) AS duplicate_count
FROM products
WHERE sku IS NOT NULL AND sku <> ''
GROUP BY sku
HAVING COUNT(*) > 1;

SELECT '16. Variant name differs from group name' AS check_name;
SELECT p.id, p.name AS variant_name, g.name AS group_name, p.package_size
FROM products p
JOIN product_groups g ON g.id = p.product_group_id
WHERE p.active = 1 AND p.name <> g.name
ORDER BY g.name, p.package_size;

SELECT '17. Orders without items' AS check_name;
SELECT COUNT(*) AS orders_without_items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE oi.id IS NULL;

SELECT '18. Orphan order-item product IDs (must be empty)' AS check_name;
SELECT oi.id, oi.order_id, oi.product_id, oi.item_name, oi.package_size
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
WHERE oi.product_id IS NOT NULL AND p.id IS NULL
LIMIT 100;

SELECT '19. Inventory movements without a product (must be empty)' AS check_name;
SELECT m.id, m.product_id, m.movement_type, m.change_amount
FROM inventory_movements m
LEFT JOIN products p ON p.id = m.product_id
WHERE p.id IS NULL
LIMIT 100;

SELECT '20. Group/variant price range' AS check_name;
SELECT
  g.name AS group_name,
  COUNT(p.id) AS variants,
  MIN(p.price) AS min_price,
  MAX(p.price) AS max_price,
  SUM(p.inventory_quantity) AS units
FROM product_groups g
LEFT JOIN products p ON p.product_group_id = g.id AND p.active = 1
GROUP BY g.id, g.name
ORDER BY g.name;

SELECT '21. order_items product FK present (fk_count must be 1, delete_rule SET NULL)' AS check_name;
SELECT
  COUNT(*) AS fk_count,
  MIN(DELETE_RULE) AS delete_rule
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'order_items'
  AND CONSTRAINT_NAME = 'fk_order_items_product';

SELECT '22. Application views present (table_type must be VIEW)' AS check_name;
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'vw_affiliate_dashboard', 'vw_customer_insights',
    'vw_inventory_summary', 'vw_low_stock'
  )
ORDER BY TABLE_NAME;

SELECT '23. Application view row counts' AS check_name;
SELECT
  (SELECT COUNT(*) FROM vw_affiliate_dashboard) AS affiliate_dashboard_rows,
  (SELECT COUNT(*) FROM vw_customer_insights) AS customer_insights_rows,
  (SELECT COUNT(*) FROM vw_inventory_summary) AS inventory_summary_rows,
  (SELECT COUNT(*) FROM vw_low_stock) AS low_stock_rows;
