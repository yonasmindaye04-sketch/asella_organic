-- ===================================================================
-- 01_v2_schema.sql
-- Asella Organic -- product groups + package-size variants
--
-- Run once on a fresh copy of production (asellafs_organic_v2).
-- This script is additive: it does not delete products, orders,
-- order items, or inventory movements.
--
-- Charset note: the production core tables use utf8 / utf8_unicode_ci.
-- The new tables and columns deliberately match that charset so foreign
-- keys to products.id and orders.id remain valid.
-- ===================================================================

-- -------------------------------------------------------------------
-- 1. Parent products
-- -------------------------------------------------------------------
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

-- -------------------------------------------------------------------
-- 2. Variant columns on the existing products table
--
-- products.name stays for backward compatibility and order snapshots.
-- product_groups.name is the canonical display name.
-- -------------------------------------------------------------------
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

-- Group foreign key and lookup index.
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

-- -------------------------------------------------------------------
-- 3. Search aliases
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_aliases (
  id               CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  product_group_id CHAR(36)     NOT NULL,
  alias            VARCHAR(255) NOT NULL,
  alias_type       ENUM('legacy_name','search','synonym') NOT NULL DEFAULT 'legacy_name',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_alias (alias, alias_type),
  KEY idx_product_alias_group (product_group_id),
  CONSTRAINT fk_product_alias_group
    FOREIGN KEY (product_group_id) REFERENCES product_groups(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- -------------------------------------------------------------------
-- 4. Legacy order-item map
--
-- This is the audit trail for every distinct legacy name/size pair.
-- It is populated from catalog-legacy-decisions.csv.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_sku_map (
  legacy_name         VARCHAR(255) NOT NULL,
  legacy_size         VARCHAR(100) NOT NULL,
  target_product_id   CHAR(36)     NULL,
  target_group_name   VARCHAR(255) NULL,
  target_package_size VARCHAR(100) NULL,
  decision            ENUM('MAP','REVIEW','LEAVE_NULL','NO_ACTION') NOT NULL DEFAULT 'REVIEW',
  match_type          ENUM('exact','normalized','rename','size_substitution',
                           'manual','ambiguous','discontinued','custom','unmapped')
                      NOT NULL DEFAULT 'ambiguous',
  confidence          ENUM('high','medium','low') NOT NULL DEFAULT 'low',
  notes               TEXT         NULL,
  reviewed_by         CHAR(36)     NULL,
  reviewed_at         DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (legacy_name, legacy_size),
  KEY idx_legacy_sku_target (target_product_id),
  CONSTRAINT fk_legacy_sku_product
    FOREIGN KEY (target_product_id) REFERENCES products(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- -------------------------------------------------------------------
-- 5. Mapping metadata on order items
-- -------------------------------------------------------------------
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

-- -------------------------------------------------------------------
-- 6. Order-total audit
--
-- This table records mismatches. It does not change orders.total.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_total_audit (
  id             CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  order_id       VARCHAR(50)  NOT NULL,
  old_total      DECIMAL(12,2) NOT NULL,
  line_total     DECIMAL(12,2) NOT NULL,
  proposed_total DECIMAL(12,2) NULL,
  status         ENUM('open','approved','rejected','applied') NOT NULL DEFAULT 'open',
  reason         VARCHAR(255) NULL,
  reviewed_by    CHAR(36)     NULL,
  reviewed_at    DATETIME     NULL,
  applied_at     DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_total_audit_order (order_id),
  CONSTRAINT fk_order_total_audit_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- -------------------------------------------------------------------
-- 7. Catalog import staging / audit
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_import (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id          CHAR(36)     NULL,
  group_name          VARCHAR(255) NOT NULL,
  group_slug          VARCHAR(255) NOT NULL,
  group_description   TEXT         NULL,
  group_image_url     TEXT         NULL,
  group_featured      TINYINT(1)   NOT NULL DEFAULT 0,
  group_tag           VARCHAR(100) NOT NULL DEFAULT '',
  group_active        TINYINT(1)   NOT NULL DEFAULT 1,
  variant_name        VARCHAR(255) NOT NULL,
  package_size        VARCHAR(100) NOT NULL,
  sku                 VARCHAR(100) NULL,
  price               DECIMAL(12,2) NOT NULL,
  unit_cost           DECIMAL(12,2) NOT NULL DEFAULT 0,
  opening_stock       INT          NOT NULL DEFAULT 0,
  low_stock_threshold INT          NOT NULL DEFAULT 10,
  variant_active      TINYINT(1)   NOT NULL DEFAULT 1,
  aliases             TEXT         NULL,
  source              VARCHAR(100) NULL,
  verified            TINYINT(1)   NOT NULL DEFAULT 0,
  notes               TEXT         NULL,
  imported_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- -------------------------------------------------------------------
-- 8. Do not add the unique active-variant index yet.
--
-- 02_constraints.sql adds it after the catalog import and group
-- backfill have succeeded.
-- -------------------------------------------------------------------
