-- ===================================================================
-- 035_v2_product_groups.sql
-- Asella Organic — product groups + package-size variant columns
--
-- Migrates the flat products table to a parent/variant model:
--   product_groups  = the customer-facing product (e.g. "Moringa Powder")
--   products        = one row per variant/SKU (e.g. "200g", "500g", "1kg")
--
-- This migration is additive and idempotent. It does NOT delete or
-- modify any existing product, order, order item, or inventory data.
-- Existing foreign keys to products.id remain valid.
--
-- Charset: utf8 / utf8_unicode_ci to match production core tables.
-- ===================================================================

-- ── 1. product_groups (parent table) ────────────────────────────────

CREATE TABLE IF NOT EXISTS product_groups (
  id          CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  image_url   TEXT         NULL,
  featured    TINYINT(1)   NOT NULL DEFAULT 0,
  tag         VARCHAR(100) NOT NULL DEFAULT '',
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_groups_slug (slug),
  UNIQUE KEY uq_product_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- ── 2. Variant columns on the existing products table ───────────────

-- products.name stays for backward compatibility and order snapshots.
-- product_groups.name is the canonical display name.

DROP PROCEDURE IF EXISTS add_v2_product_columns;
DELIMITER //
CREATE PROCEDURE add_v2_product_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'product_group_id'
  ) THEN
    ALTER TABLE products
      ADD COLUMN product_group_id CHAR(36) NULL AFTER id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'sku'
  ) THEN
    ALTER TABLE products
      ADD COLUMN sku VARCHAR(100) NULL AFTER package_size;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'size_value'
  ) THEN
    ALTER TABLE products
      ADD COLUMN size_value DECIMAL(10,3) NULL AFTER sku;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'size_unit'
  ) THEN
    ALTER TABLE products
      ADD COLUMN size_unit VARCHAR(20) NULL AFTER size_value;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'sort_order'
  ) THEN
    ALTER TABLE products
      ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER size_unit;
  END IF;
END//
DELIMITER ;
CALL add_v2_product_columns();
DROP PROCEDURE IF EXISTS add_v2_product_columns;

-- ── 3. Group foreign key and lookup index ───────────────────────────

DROP PROCEDURE IF EXISTS add_v2_product_indexes;
DELIMITER //
CREATE PROCEDURE add_v2_product_indexes()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND INDEX_NAME = 'idx_products_group'
  ) THEN
    CREATE INDEX idx_products_group ON products(product_group_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
      AND CONSTRAINT_NAME = 'fk_products_group'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT fk_products_group
      FOREIGN KEY (product_group_id) REFERENCES product_groups(id)
      ON DELETE RESTRICT;
  END IF;
END//
DELIMITER ;
CALL add_v2_product_indexes();
DROP PROCEDURE IF EXISTS add_v2_product_indexes;

INSERT IGNORE INTO migrations_log (filename) VALUES ('035_v2_product_groups.sql');

SELECT '035_v2_product_groups.sql applied' AS result;
