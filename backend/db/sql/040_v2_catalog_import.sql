-- ===================================================================
-- 040_v2_catalog_import.sql
-- Asella Organic — catalog_import (staging + audit for catalog imports)
--
-- Records every row ingested by the catalog import script so imports
-- are auditable and re-runnable. Populated by import-catalog.cjs.
--
-- Charset: utf8 / utf8_unicode_ci.
-- ===================================================================

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

INSERT IGNORE INTO migrations_log (filename) VALUES ('040_v2_catalog_import.sql');

SELECT '040_v2_catalog_import.sql applied' AS result;
