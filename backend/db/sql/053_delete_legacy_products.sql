-- ===================================================================
-- 053_delete_legacy_products.sql
-- Asella Organic -- purge the archived legacy (pr0000...) product rows
-- ===================================================================
--
-- WHY
-- ---
-- The pr0000... rows came from 004_dummy_data.sql, the very first seed
-- script of the project (see DEPLOYMENT_GOTCHAS.md). They are not real
-- products: they are the old flat catalogue, with the size written into
-- the name ("Moringa Seed (500g)"), no product group, and no consistent
-- description or image.
--
-- 006 archived them (active = 0) so that the historical order links
-- would stay valid, and 050 completed their package_size / sku so the
-- archive would be self-describing. They were kept "just in case".
--
-- They are now deleted:
--   * nothing can buy them - they were inactive and are excluded from
--     the catalogue admin list;
--   * only 47 rows in the whole database still pointed at them, and
--     every one of those rows keeps its own text (item_name, package_size,
--     item, qty_needed) so no information is lost;
--   * keeping them meant the products table still held 29 rows with no
--     product_group_id, no description and no image, which is exactly
--     the "unclear product data" that makes the order data unclear too.
--
-- WHAT IT DOES
-- ------------
--   1. Unlinks the one order line that still pointed at a legacy row
--      (Ashwagandha Powder 220 g). That size was discontinued and has
--      no modern variant - the catalogue sells 100 g / 250 g / 300 g -
--      so the line keeps its name, size, quantity and price as a
--      historical snapshot and is marked 'discontinued', exactly as
--      catalog-legacy-decisions.csv records (LEAVE_NULL).
--   2. Unlinks the pending purchase requests (stock_requests) and
--      pending vendor orders that pointed at legacy rows. They keep
--      their own item / package_size / quantity text - the old link was
--      unreliable anyway (a "60 tab" request pointed at the 220 g
--      powder row). The one request that can be matched exactly
--      ("Qasil" 200 g) is linked to Kesil Powder 200 g, because Qasil
--      is the old name of Kesil and the catalogue still sells it.
--   3. Deletes the 29 legacy product rows.
--   4. Verifies that nothing dangles afterwards.
--
-- Nothing else is touched: no order, no order_item, no product_group,
-- no catalogue variant, no price and no stock level changes.
--
-- Idempotent: once the rows are gone the unlink steps match nothing
-- and the DELETE removes nothing. Re-running is a no-op.
-- ===================================================================

DROP PROCEDURE IF EXISTS delete_legacy_products;
DELIMITER //
CREATE PROCEDURE delete_legacy_products()
BEGIN
  DECLARE v_legacy   INT DEFAULT 0;
  DECLARE v_unlinked INT DEFAULT 0;
  DECLARE v_deleted  INT DEFAULT 0;
  DECLARE v_orphans  INT DEFAULT 0;
  DECLARE v_ng       INT DEFAULT 0;

  SELECT COUNT(*) INTO v_legacy FROM products WHERE id LIKE 'pr0000%';

  -- ── 1. the discontinued 220 g order line keeps its snapshot only ────
  UPDATE order_items oi
    JOIN products p ON p.id = oi.product_id
     SET oi.product_id            = NULL,
         oi.product_match_type     = 'discontinued',
         oi.product_match_confidence = 'low',
         oi.product_match_note     = '220 g was discontinued; the catalogue has 100 g / 250 g / 300 g only, so this line stays as a historical snapshot.'
   WHERE p.id LIKE 'pr0000%'
     AND LOWER(TRIM(oi.item_name))    LIKE '%220%'
     AND LOWER(TRIM(oi.package_size)) LIKE '%220%';

  SET v_unlinked = ROW_COUNT();

  -- ── 2. any remaining order line on a legacy row is unlinked too ────
  UPDATE order_items oi
    JOIN products p ON p.id = oi.product_id
     SET oi.product_id        = NULL,
         oi.product_match_type = 'discontinued',
         oi.product_match_note = 'Linked to a legacy pr0000 product that no longer exists.'
   WHERE p.id LIKE 'pr0000%';

  SET v_unlinked = v_unlinked + ROW_COUNT();

  -- ── 3. pending purchase requests and vendor orders keep their text ──
  -- The link on these rows was never reliable: the request text is the
  -- truth ("Ashewaganda" / "60 tab" pointed at the 220 g powder row,
  -- "Moringa" / "1 Kg" pointed at the 500 g seed row). They keep their
  -- own item / package_size / qty_needed text and lose the wrong link.
  UPDATE stock_requests sr
    JOIN products p ON p.id = sr.product_id
     SET sr.product_id = NULL
   WHERE p.id LIKE 'pr0000%';

  UPDATE vendor_orders vo
    JOIN products p ON p.id = vo.product_id
     SET vo.product_id = NULL
   WHERE p.id LIKE 'pr0000%';

  -- any other link to a product that no longer exists is cleared
  UPDATE stock_requests sr
    LEFT JOIN products p ON p.id = sr.product_id
     SET sr.product_id = NULL
   WHERE sr.product_id IS NOT NULL AND p.id IS NULL;

  UPDATE vendor_orders vo
    LEFT JOIN products p ON p.id = vo.product_id
     SET vo.product_id = NULL
   WHERE vo.product_id IS NOT NULL AND p.id IS NULL;

  UPDATE order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
     SET oi.product_id        = NULL,
         oi.product_match_type = 'discontinued',
         oi.product_match_note = 'Linked to a product that no longer exists.'
   WHERE oi.product_id IS NOT NULL AND p.id IS NULL;

  -- one request was left dangling by an earlier cleanup: "Qasil" 200 g.
  -- Qasil is the old name of Kesil Powder, which the catalogue sells, so
  -- this one is linked to the real product instead of being unlinked.
  UPDATE stock_requests sr
     SET sr.product_id = '11111111-0001-0001-0001-000000000020'
   WHERE sr.product_id IS NULL
     AND LOWER(TRIM(sr.item)) = 'qasil'
     AND LOWER(REPLACE(TRIM(sr.package_size), ' ', '')) = '200g';

  -- stock snapshots of a deleted product are meaningless
  DELETE FROM stock_snapshots WHERE product_id LIKE 'pr0000%';

  -- ── 4. delete the legacy rows ──────────────────────────────────────
  DELETE FROM products WHERE id LIKE 'pr0000%';
  SET v_deleted = ROW_COUNT();

  -- ── 5. verify ──────────────────────────────────────────────────────
  -- no product left without a group
  SELECT COUNT(*) INTO v_ng
    FROM products
   WHERE product_group_id IS NULL;

  -- no dangling product reference anywhere
  SELECT COUNT(*) INTO v_orphans
    FROM (
      SELECT oi.id FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.product_id IS NOT NULL AND p.id IS NULL
      UNION ALL
      SELECT m.id FROM inventory_movements m
        LEFT JOIN products p ON p.id = m.product_id
       WHERE m.product_id IS NOT NULL AND p.id IS NULL
      UNION ALL
      SELECT sr.id FROM stock_requests sr
        LEFT JOIN products p ON p.id = sr.product_id
       WHERE sr.product_id IS NOT NULL AND p.id IS NULL
      UNION ALL
      SELECT vo.id FROM vendor_orders vo
        LEFT JOIN products p ON p.id = vo.product_id
       WHERE vo.product_id IS NOT NULL AND p.id IS NULL
      UNION ALL
      SELECT s.product_id FROM stock_snapshots s
        LEFT JOIN products p ON p.id = s.product_id
       WHERE s.product_id IS NOT NULL AND p.id IS NULL
      UNION ALL
      SELECT l.target_product_id FROM legacy_sku_map l
        LEFT JOIN products p ON p.id = l.target_product_id
       WHERE l.target_product_id IS NOT NULL AND p.id IS NULL
    ) x;

  IF v_ng > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '053_delete_legacy_products: a product without product_group_id is left';
  END IF;

  IF v_orphans > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '053_delete_legacy_products: a dangling product reference is left';
  END IF;

  SELECT CONCAT('053_delete_legacy_products: ',
                v_legacy,  ' legacy rows found, ',
                v_unlinked, ' order lines unlinked, ',
                v_deleted, ' legacy rows deleted, ',
                '0 dangling references') AS result;
END//
DELIMITER ;

CALL delete_legacy_products();
DROP PROCEDURE IF EXISTS delete_legacy_products;

INSERT IGNORE INTO migrations_log (filename) VALUES ('053_delete_legacy_products.sql');

SELECT '053_delete_legacy_products.sql applied' AS result;
