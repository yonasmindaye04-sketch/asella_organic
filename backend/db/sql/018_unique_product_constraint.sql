-- ===================================================================
-- 018_unique_product_constraint.sql
-- Asella Organic -- Prevent duplicate active products
-- ===================================================================

-- 1. Assert no active duplicates currently exist
DELIMITER //
CREATE PROCEDURE check_active_duplicates()
BEGIN
    DECLARE duplicate_count INT;
    SELECT COUNT(*) INTO duplicate_count 
    FROM (
        SELECT name, package_size 
        FROM products 
        WHERE active = 1 
        GROUP BY name, package_size 
        HAVING COUNT(*) > 1
    ) AS dups;

    IF duplicate_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration aborted: Active duplicates found for (name, package_size)';
    END IF;
END//
DELIMITER ;

CALL check_active_duplicates();
DROP PROCEDURE IF EXISTS check_active_duplicates;

-- 2. Add virtual column if missing (idempotent)
DROP PROCEDURE IF EXISTS add_v2_active_unique_col;
DELIMITER //
CREATE PROCEDURE add_v2_active_unique_col()
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
CALL add_v2_active_unique_col();
DROP PROCEDURE IF EXISTS add_v2_active_unique_col;

-- 3. Add unique index if missing (idempotent)
DROP PROCEDURE IF EXISTS add_unique_active_product_idx;
DELIMITER //
CREATE PROCEDURE add_unique_active_product_idx()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND INDEX_NAME = 'idx_unique_active_product'
  ) THEN
    ALTER TABLE products
      ADD UNIQUE INDEX idx_unique_active_product (name, package_size, active_unique);
  END IF;
END//
DELIMITER ;
CALL add_unique_active_product_idx();
DROP PROCEDURE IF EXISTS add_unique_active_product_idx;

INSERT IGNORE INTO migrations_log (filename) VALUES ('018_unique_product_constraint.sql');

SELECT '018_unique_product_constraint.sql applied' AS result;
