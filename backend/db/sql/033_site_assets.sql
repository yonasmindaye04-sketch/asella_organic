-- 033_site_assets.sql
-- Admin-overridable images for storefront "site chrome" (category cards,
-- daily highlights, hero art, ...).
--
-- Design: a row exists ONLY when an admin has replaced the hardcoded default
-- shipped in the frontend (frontend/src/constants/siteAssets.ts). Absence of
-- a row is the normal, healthy state and means "render the frontend default",
-- so this table stays empty until someone actually overrides something.
--
-- The `url` points at Cloudinary (or any https URL) after an upload through
-- POST /api/media/:key — replacing an asset never requires a redeploy.

CREATE TABLE IF NOT EXISTS site_assets (
  asset_key  VARCHAR(191) NOT NULL PRIMARY KEY,
  url        TEXT         NOT NULL,
  alt_text   VARCHAR(255) NULL,
  updated_by CHAR(36)     NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Default lookups are "all overrides", so give MySQL something to cover.
--
-- MariaDB has no `CREATE INDEX IF NOT EXISTS`, and a bare CREATE INDEX
-- aborts the whole migration if the index already exists. That matters
-- because this file was originally numbered 028_site_assets.sql: on any
-- database where the old number already ran, migrations_log has no
-- 033 entry, so the runner replays this file and dies on
-- "Duplicate key name 'idx_site_assets_updated_at'".
--
-- The guard below mirrors the pattern already used by
-- 018_unique_product_constraint.sql, so a re-run is a no-op instead of
-- a hard failure.
DROP PROCEDURE IF EXISTS ensure_site_assets_index;
DELIMITER //
CREATE PROCEDURE ensure_site_assets_index()
BEGIN
    DECLARE n INT;
    SELECT COUNT(*) INTO n
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'site_assets'
      AND index_name   = 'idx_site_assets_updated_at';
    IF n = 0 THEN
        CREATE INDEX idx_site_assets_updated_at ON site_assets(updated_at);
    END IF;
END//
DELIMITER ;
CALL ensure_site_assets_index();
DROP PROCEDURE ensure_site_assets_index;

INSERT IGNORE INTO migrations_log (filename) VALUES ('033_site_assets.sql');