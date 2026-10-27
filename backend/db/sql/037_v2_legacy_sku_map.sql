-- ===================================================================
-- 037_v2_legacy_sku_map.sql
-- Asella Organic — legacy_sku_map (audit trail for legacy order items)
--
-- One row per distinct (legacy_name, legacy_size) pair found in
-- order_items. Populated from catalog-legacy-decisions.csv by the
-- map-order-items data migration script.
--
-- Idempotent. Does not modify any order data.
--
-- Charset: utf8 / utf8_unicode_ci.
-- ===================================================================

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

INSERT IGNORE INTO migrations_log (filename) VALUES ('037_v2_legacy_sku_map.sql');

SELECT '037_v2_legacy_sku_map.sql applied' AS result;
