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
DROP PROCEDURE check_active_duplicates;

-- 2. Add virtual column and unique constraint
-- We add `active_unique` which maps active=1 to 1 and active=0 to NULL.
-- Since unique constraints ignore NULLs in MySQL/MariaDB, this effectively
-- creates a partial unique index on (name, package_size) where active = 1.

ALTER TABLE products 
ADD COLUMN active_unique TINYINT AS (IF(active = 1, 1, NULL)) VIRTUAL;

ALTER TABLE products 
ADD UNIQUE INDEX idx_unique_active_product (name, package_size, active_unique);
