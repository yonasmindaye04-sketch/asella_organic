-- ===================================================================
-- 042_v2_order_item_fk.sql
-- Asella Organic — order_items.product_id -> products.id foreign key
--
-- Run only after the order-item mapping script has cleared orphan
-- product_id values (--clear-orphans).
--
-- ON DELETE SET NULL preserves the order-item snapshot if a product
-- row is ever deleted. This constraint never rewrites item_name,
-- package_size, quantity, unit_price, unit_cost, or orders.total.
--
-- Idempotent. Safe to re-run.
--
-- Charset: utf8 / utf8_unicode_ci.
-- ===================================================================

-- Guard: every non-null product_id must exist in products.
DROP PROCEDURE IF EXISTS assert_order_item_products;
DELIMITER //
CREATE PROCEDURE assert_order_item_products()
BEGIN
  DECLARE orphan_count INT;
  SELECT COUNT(*) INTO orphan_count
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE oi.product_id IS NOT NULL AND p.id IS NULL;
  IF orphan_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot add FK: order_items has orphan product_id values; run the mapping script with --clear-orphans first';
  END IF;
END//
DELIMITER ;
CALL assert_order_item_products();
DROP PROCEDURE IF EXISTS assert_order_item_products;

-- Add the foreign key if not already present.
DROP PROCEDURE IF EXISTS add_order_items_product_fk;
DELIMITER //
CREATE PROCEDURE add_order_items_product_fk()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'order_items'
      AND CONSTRAINT_NAME = 'fk_order_items_product'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT fk_order_items_product
      FOREIGN KEY (product_id) REFERENCES products (id)
      ON DELETE SET NULL;
  END IF;
END//
DELIMITER ;
CALL add_order_items_product_fk();
DROP PROCEDURE IF EXISTS add_order_items_product_fk;

INSERT IGNORE INTO migrations_log (filename) VALUES ('042_v2_order_item_fk.sql');

SELECT '042_v2_order_item_fk.sql applied' AS result;
