-- ===================================================================
-- 050_complete_legacy_product_sizes.sql
-- Asella Organic -- fill in package_size / size_value / size_unit / sku
--                  for the archived legacy (pr0000...) product rows
-- ===================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The legacy pr0000... rows came from the original production dump. That
-- data model had no package_size column: the size was written into the
-- product NAME, e.g.
--     "Moringa Seed (500g)"      "Myrrh  Kerebe  Oil (30 ml)"
--     "hibiscus Kerkede Leafe (100 g)"   "Ashewagenda (Himalya) 120Tablet"
--
-- The v2 catalog model splits that into product_groups.name (the product)
-- and products.package_size + size_value + size_unit (the variant). The
-- 36 current catalog rows were migrated by import-catalog.cjs and have all
-- of those columns filled in, but the 29 archived legacy rows were left
-- with package_size = '' and size_value / size_unit / sku = NULL.
--
-- This migration fills them in from the name, so the archived rows are
-- complete and self-describing instead of half-empty.
--
-- WHAT IT DOES NOT DO
-- -------------------
--   * product_group_id stays NULL. The legacy rows are NOT catalog
--     variants - they are the shadow of the old flat catalog. Attaching
--     them to a modern group would create 15 duplicate (group, size)
--     pairs, because most of them are the archived twin of a live
--     variant ("Coffee (500 g)" vs "Coffee" / 500g).
--   * active stays 0. They never appear on the storefront.
--   * Nothing is deleted, and no order data is touched.
--
-- The sizes are written out explicitly rather than parsed with SQL
-- regexes: this is a frozen historical set of 29 rows, and an explicit
-- table is reviewable and deterministic.
--
-- Two rows have no size in their name. Their sizes come from the
-- historical order lines:
--     "Shilajit Gummies" -> "Shilajit Gummies 30 Gummies"
--     "Shilajit Oil"     -> "Shilajit Oil 30ml"
--
-- Idempotent: re-running it produces the same result.
-- ===================================================================

DROP PROCEDURE IF EXISTS complete_legacy_product_sizes;
DELIMITER //
CREATE PROCEDURE complete_legacy_product_sizes()
BEGIN
  DECLARE dup_count   INT DEFAULT 0;
  DECLARE incomplete INT DEFAULT 0;

  UPDATE products p
  JOIN (
              SELECT 'pr000001-0000-0000-0000-000000000001' AS id, '500g'        AS package_size, 500 AS size_value, 'g'       AS size_unit
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000002',        '220g',        220, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000005',        '30 Gummies',   30, 'gummies'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000007',        '60 Tablet',    60, 'tablet'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000008',        '250g',        250, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000009',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000010',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000011',        '30ml',         30, 'ml'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000012',        '30ml',         30, 'ml'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000013',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000015',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000016',        '30ml',         30, 'ml'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000018',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000019',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000001-0000-0000-0000-000000000020',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000021-0000-0000-0000-000000000021',        '200g',        200, 'g'
    UNION ALL SELECT 'pr000022-0000-0000-0000-000000000022',        '120 Tablet',  120, 'tablet'
    UNION ALL SELECT 'pr000023-0000-0000-0000-000000000023',        '60 Tablet',   60, 'tablet'
    UNION ALL SELECT 'pr000024-0000-0000-0000-000000000024',        '30ml',         30, 'ml'
    UNION ALL SELECT 'pr000025-0000-0000-0000-000000000025',        '1kg',           1, 'kg'
    UNION ALL SELECT 'pr000026-0000-0000-0000-000000000026',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000027-0000-0000-0000-000000000027',        '200g',        200, 'g'
    UNION ALL SELECT 'pr000028-0000-0000-0000-000000000028',        '200g',        200, 'g'
    UNION ALL SELECT 'pr000029-0000-0000-0000-000000000029',        '500g',        500, 'g'
    UNION ALL SELECT 'pr000030-0000-0000-0000-000000000030',        '200g',        200, 'g'
    UNION ALL SELECT 'pr000031-0000-0000-0000-000000000031',        '60ml',         60, 'ml'
    UNION ALL SELECT 'pr000032-0000-0000-0000-000000000032',        '60ml',         60, 'ml'
    UNION ALL SELECT 'pr000033-0000-0000-0000-000000000033',        '100g',        100, 'g'
    UNION ALL SELECT 'pr000034-0000-0000-0000-000000000034',        '300g',        300, 'g'
  ) m ON m.id = p.id
  SET p.package_size = m.package_size,
      p.size_value   = m.size_value,
      p.size_unit    = m.size_unit,
      -- The first id segment ("pr000001") is shared by many rows, so the
      -- unique trailing digits are used: pr000001-...-0001 -> LEG-00000001.
      p.sku          = CONCAT('LEG-',
                              RIGHT(UPPER(REPLACE(p.id, '-', '')), 8),
                              '-',
                              UPPER(REPLACE(m.package_size, ' ', '')))
  WHERE p.id LIKE 'pr0000%'
    AND p.product_group_id IS NULL;

  -- The sku must be unique (check 15 in the validation suite).
  SELECT COUNT(*) INTO dup_count
    FROM (SELECT sku FROM products WHERE sku IS NOT NULL GROUP BY sku HAVING COUNT(*) > 1) d;
  IF dup_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '050_complete_legacy_product_sizes: duplicate SKUs after the update';
  END IF;

  -- Every archived row must now have a size.
  SELECT COUNT(*) INTO incomplete
    FROM products
   WHERE id LIKE 'pr0000%'
     AND (package_size IS NULL OR package_size = ''
          OR size_value IS NULL OR size_unit IS NULL OR sku IS NULL);
  IF incomplete > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '050_complete_legacy_product_sizes: some archived rows are still incomplete';
  END IF;

  SELECT CONCAT('050_complete_legacy_product_sizes: completed ', 29 - incomplete, ' archived rows') AS result;
END//
DELIMITER ;
CALL complete_legacy_product_sizes();
DROP PROCEDURE IF EXISTS complete_legacy_product_sizes;

INSERT IGNORE INTO migrations_log (filename) VALUES ('050_complete_legacy_product_sizes.sql');

SELECT '050_complete_legacy_product_sizes.sql applied' AS result;
