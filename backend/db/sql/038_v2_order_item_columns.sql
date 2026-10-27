-- ===================================================================
-- 038_v2_order_item_columns.sql
-- Asella Organic — order-item mapping metadata columns
--
-- Adds product_match_type, product_match_confidence, product_match_note
-- to order_items so every historical line carries its mapping status.
-- Idempotent. Does not rewrite item_name, package_size, quantity,
-- unit_price, unit_cost, or orders.total.
--
-- Charset: utf8 / utf8_unicode_ci.
-- ===================================================================

DROP PROCEDURE IF EXISTS add_v2_order_item_columns;
DELIMITER //
CREATE PROCEDURE add_v2_order_item_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
      AND COLUMN_NAME = 'product_match_type'
  ) THEN
    ALTER TABLE order_items
      ADD COLUMN product_match_type
        ENUM('exact','normalized','rename','size_substitution',
             'manual','ambiguous','discontinued','custom','unmapped')
        NULL AFTER product_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
      AND COLUMN_NAME = 'product_match_confidence'
  ) THEN
    ALTER TABLE order_items
      ADD COLUMN product_match_confidence
        ENUM('high','medium','low') NULL AFTER product_match_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
      AND COLUMN_NAME = 'product_match_note'
  ) THEN
    ALTER TABLE order_items
      ADD COLUMN product_match_note VARCHAR(255) NULL AFTER product_match_confidence;
  END IF;
END//
DELIMITER ;
CALL add_v2_order_item_columns();
DROP PROCEDURE IF EXISTS add_v2_order_item_columns;

INSERT IGNORE INTO migrations_log (filename) VALUES ('038_v2_order_item_columns.sql');

SELECT '038_v2_order_item_columns.sql applied' AS result;
