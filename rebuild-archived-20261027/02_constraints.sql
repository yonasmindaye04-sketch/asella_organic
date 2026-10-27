-- ===================================================================
-- 02_constraints.sql
-- Add the unique active-variant constraint after the catalog import.
--
-- Run this only after:
--   1. every active variant has product_group_id
--   2. no duplicate active (product_group_id, package_size) exists
--   3. duplicate SKUs have been resolved
--
-- The virtual column maps active=1 to 1 and active=0 to NULL.
-- Unique indexes ignore NULLs, so inactive history can coexist.
-- ===================================================================

-- Guard: every active variant must have a group.
DROP PROCEDURE IF EXISTS assert_v2_groups;
DELIMITER //
CREATE PROCEDURE assert_v2_groups()
BEGIN
  DECLARE missing INT;

  SELECT COUNT(*) INTO missing
  FROM products
  WHERE active = 1 AND product_group_id IS NULL;

  IF missing > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot add constraint: active variants without product_group_id exist';
  END IF;
END//
DELIMITER ;
CALL assert_v2_groups();
DROP PROCEDURE IF EXISTS assert_v2_groups;

-- Guard: no duplicate active variants per group/size.
DROP PROCEDURE IF EXISTS assert_v2_unique_variants;
DELIMITER //
CREATE PROCEDURE assert_v2_unique_variants()
BEGIN
  DECLARE duplicates INT;

  SELECT COUNT(*) INTO duplicates
  FROM (
    SELECT product_group_id, package_size
    FROM products
    WHERE active = 1
    GROUP BY product_group_id, package_size
    HAVING COUNT(*) > 1
  ) d;

  IF duplicates > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot add constraint: duplicate active group/size variants exist';
  END IF;
END//
DELIMITER ;
CALL assert_v2_unique_variants();
DROP PROCEDURE IF EXISTS assert_v2_unique_variants;

-- Guard: no duplicate non-null SKUs.
DROP PROCEDURE IF EXISTS assert_v2_unique_skus;
DELIMITER //
CREATE PROCEDURE assert_v2_unique_skus()
BEGIN
  DECLARE duplicates INT;

  SELECT COUNT(*) INTO duplicates
  FROM (
    SELECT sku
    FROM products
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku
    HAVING COUNT(*) > 1
  ) d;

  IF duplicates > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cannot add constraint: duplicate SKUs exist';
  END IF;
END//
DELIMITER ;
CALL assert_v2_unique_skus();
DROP PROCEDURE IF EXISTS assert_v2_unique_skus;

-- Add the virtual column if it is not already present.
DROP PROCEDURE IF EXISTS add_v2_active_unique;
DELIMITER //
CREATE PROCEDURE add_v2_active_unique()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'active_unique'
  ) THEN
    ALTER TABLE products
      ADD COLUMN active_unique TINYINT AS (IF(active = 1, 1, NULL)) VIRTUAL;
  END IF;
END//
DELIMITER ;
CALL add_v2_active_unique();
DROP PROCEDURE IF EXISTS add_v2_active_unique;

-- Add the unique group/size constraint if it is not already present.
DROP PROCEDURE IF EXISTS add_v2_variant_index;
DELIMITER //
CREATE PROCEDURE add_v2_variant_index()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND INDEX_NAME = 'uq_products_group_size_active'
  ) THEN
    ALTER TABLE products
      ADD UNIQUE INDEX uq_products_group_size_active
        (product_group_id, package_size, active_unique);
  END IF;
END//
DELIMITER ;
CALL add_v2_variant_index();
DROP PROCEDURE IF EXISTS add_v2_variant_index;

-- Add the unique SKU index if it is not already present.
DROP PROCEDURE IF EXISTS add_v2_sku_index;
DELIMITER //
CREATE PROCEDURE add_v2_sku_index()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND INDEX_NAME = 'uq_products_sku'
  ) THEN
    ALTER TABLE products
      ADD UNIQUE INDEX uq_products_sku (sku);
  END IF;
END//
DELIMITER ;
CALL add_v2_sku_index();
DROP PROCEDURE IF EXISTS add_v2_sku_index;

SELECT 'v2 constraints applied' AS result;
