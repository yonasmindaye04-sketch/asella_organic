-- ===================================================================
-- 036_v2_product_aliases.sql
-- Asella Organic — product_aliases (legacy name / search synonyms)
--
-- Idempotent. Creates the alias table used to map legacy order-item
-- names to canonical product groups.
--
-- Charset: utf8 / utf8_unicode_ci.
-- ===================================================================

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

INSERT IGNORE INTO migrations_log (filename) VALUES ('036_v2_product_aliases.sql');

SELECT '036_v2_product_aliases.sql applied' AS result;
