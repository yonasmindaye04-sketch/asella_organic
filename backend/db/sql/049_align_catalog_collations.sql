-- ===================================================================
-- 049_align_catalog_collations.sql
-- Asella Organic -- normalise the collation of the v2 catalog tables
-- ===================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- 035_v2_product_groups.sql and 036_v2_product_aliases.sql originally
-- ended with
--     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- and added products.product_group_id with an explicit
-- utf8mb4_unicode_ci collation.
--
-- The CHARSET clause was later removed from those files so the v2 tables
-- inherit the database default, which is what the rest of the schema
-- (products, orders, order_items, ...) uses.
--
-- But a database that ALREADY ran the old 035/036 keeps the old
-- collation, so it ends up with a split:
--     products          utf8mb4_general_ci   (database default)
--     product_groups    utf8mb4_unicode_ci   (from the old 035)
--     product_aliases   utf8mb4_unicode_ci   (from the old 036)
--     products.product_group_id  utf8mb4_unicode_ci
--
-- Comparing a product name with a group name then fails:
--     ER_CANT_AGGREGATE_2COLLATIONS
--     Illegal mix of collations (utf8mb4_general_ci,IMPLICIT) and
--     (utf8mb4_unicode_ci,IMPLICIT) for operation '<>'
--
-- WHAT IT DOES
-- ------------
-- Aligns product_groups, product_aliases and products.product_group_id
-- with the collation of the products table (the database default), so
-- every string in the catalog compares cleanly.
--
-- The two foreign keys are dropped and re-created around the conversion,
-- because a foreign key requires both sides to use the same collation.
--
-- Idempotent: re-running it is a no-op once everything matches.
-- It does not change any data.
-- ===================================================================

DROP PROCEDURE IF EXISTS align_catalog_collations;
DELIMITER //
CREATE PROCEDURE align_catalog_collations()
BEGIN
  DECLARE target_collation VARCHAR(64);
  DECLARE needs_fix        INT DEFAULT 0;

  -- The collation the products table (and therefore the whole core
  -- schema) uses. Everything in the catalog is aligned to this.
  SELECT TABLE_COLLATION INTO target_collation
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products';

  IF target_collation IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'align_catalog_collations: products table not found';
  END IF;

  -- Do we still have a split?
  SELECT COUNT(*) INTO needs_fix
    FROM information_schema.TABLES t
   WHERE t.TABLE_SCHEMA = DATABASE()
     AND t.TABLE_NAME IN ('product_groups', 'product_aliases')
     AND t.TABLE_COLLATION <> target_collation;

  SELECT COUNT(*) INTO needs_fix
    FROM information_schema.COLUMNS c
   WHERE c.TABLE_SCHEMA = DATABASE()
     AND c.TABLE_NAME = 'products'
     AND c.COLUMN_NAME = 'product_group_id'
     AND c.COLLATION_NAME <> target_collation;

  IF needs_fix = 0 THEN
    SELECT '049_align_catalog_collations: already aligned' AS result;
  ELSE
    -- ── 1. Drop the foreign keys (they need matching collations) ─────
    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'products'
                  AND CONSTRAINT_NAME = 'fk_products_group') THEN
      ALTER TABLE products DROP FOREIGN KEY fk_products_group;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'product_aliases'
                  AND CONSTRAINT_NAME = 'fk_product_alias_group') THEN
      ALTER TABLE product_aliases DROP FOREIGN KEY fk_product_alias_group;
    END IF;

    -- ── 2. Align the group tables with the products collation ───────
    IF EXISTS (SELECT 1 FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_groups') THEN
      SET @s = CONCAT('ALTER TABLE product_groups CONVERT TO CHARACTER SET utf8mb4 COLLATE ', target_collation);
      PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_aliases') THEN
      SET @s = CONCAT('ALTER TABLE product_aliases CONVERT TO CHARACTER SET utf8mb4 COLLATE ', target_collation);
      PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;

    -- products.product_group_id must use the same collation as
    -- product_groups.id for the foreign key to be accepted.
    IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'products'
                  AND COLUMN_NAME = 'product_group_id') THEN
      SET @s = CONCAT('ALTER TABLE products MODIFY product_group_id CHAR(36) ',
                       'CHARACTER SET utf8mb4 COLLATE ', target_collation, ' NULL');
      PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;

    -- ── 3. Re-create the foreign keys ───────────────────────────────
    IF EXISTS (SELECT 1 FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_groups')
       AND EXISTS (SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'products'
                      AND COLUMN_NAME = 'product_group_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                        WHERE CONSTRAINT_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'products'
                          AND CONSTRAINT_NAME = 'fk_products_group') THEN
      ALTER TABLE products
        ADD CONSTRAINT fk_products_group
        FOREIGN KEY (product_group_id) REFERENCES product_groups(id)
        ON DELETE RESTRICT;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_aliases')
       AND EXISTS (SELECT 1 FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_groups')
       AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                        WHERE CONSTRAINT_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'product_aliases'
                          AND CONSTRAINT_NAME = 'fk_product_alias_group') THEN
      ALTER TABLE product_aliases
        ADD CONSTRAINT fk_product_alias_group
        FOREIGN KEY (product_group_id) REFERENCES product_groups(id)
        ON DELETE CASCADE;
    END IF;

    SELECT CONCAT('049_align_catalog_collations: aligned to ', target_collation) AS result;
  END IF;
END//
DELIMITER ;
CALL align_catalog_collations();
DROP PROCEDURE IF EXISTS align_catalog_collations;

INSERT IGNORE INTO migrations_log (filename) VALUES ('049_align_catalog_collations.sql');

SELECT '049_align_catalog_collations.sql applied' AS result;
