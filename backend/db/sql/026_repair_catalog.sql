-- ===================================================================
-- 026_repair_catalog.sql
-- Asella Organic -- Catalog / Order-Item Linkage Repair
-- ===================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- 004_dummy_data.sql seeded 29 products with ids like pr000001-...
-- 006_clean_products.sql then ran `UPDATE products SET active=false`
-- and inserted a NEW canonical catalog with ids like 11111111-0001-...
-- Result on every database built from these migrations:
--
--   * all 31 active products have inventory_quantity = 0
--     -> the storefront shows "Out of Stock" for the entire catalog
--   * 0 of 631 order_items point at an active product
--   * deductOrderStock() (src/lib/inventory.ts:224-233) joins on
--       LOWER(oi.item_name) = LOWER(p.name) AND oi.package_size = p.package_size
--     so it IGNORES order_items.product_id entirely and silently skips
--     any line item that does not match the catalog string-for-string.
--     Legacy data used "250 g" / "60 capsules" / "Moringa Powder" while
--     the catalog uses "250g" / "60 Tablet" / "Moringa powder".
--     Result: marking any order Delivered deducts nothing at all.
--
-- This migration repairs the linkage so the inventory stream is real.
-- It is idempotent and safe to re-run.
-- ===================================================================

-- -----------------------------------------------------------------
-- 0. GUARD: the canonical catalog from 006 must exist
-- -----------------------------------------------------------------
DROP PROCEDURE IF EXISTS chk_catalog_present;
DELIMITER //
CREATE PROCEDURE chk_catalog_present()
BEGIN
    DECLARE n INT;
    SELECT COUNT(*) INTO n FROM products WHERE active = 1;
    IF n = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '026 aborted: no active products, run 006_clean_products.sql first';
    END IF;
END//
DELIMITER ;
CALL chk_catalog_present();
DROP PROCEDURE chk_catalog_present;

-- -----------------------------------------------------------------
-- 1. SKU MAP -- legacy line item -> canonical catalog product
--
-- Deliberately explicit rather than fuzzy: fuzzy matching would hide
-- genuine catalogue drift. One row per distinct (name, package_size)
-- pair that ever appears in order_items.
--
-- 'Himalayan Shilajit Jell' / '1 jar (20g)' is intentionally ABSENT:
-- it is a discontinued product with no catalog equivalent. Those line
-- items stay unlinked and product_id NULL, which exercises the
-- "product no longer sold" path in the UI.
-- -----------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_sku_map;
CREATE TEMPORARY TABLE tmp_sku_map (
    legacy_name VARCHAR(255) NOT NULL,
    legacy_size VARCHAR(100) NOT NULL,
    target_name VARCHAR(255) NOT NULL,
    target_size VARCHAR(100) NOT NULL,
    PRIMARY KEY (legacy_name, legacy_size)
);

INSERT INTO tmp_sku_map (legacy_name, legacy_size, target_name, target_size) VALUES
    -- MORINGA
    ('Moringa Powder',                  '1 kg',         'Moringa powder',   '1kg'),
    ('Moringa Powder',                  '500 g',        'Moringa powder',   '500g'),
    ('Moringa Powder',                  '200 g',        'Moringa powder',   '200g'),
    ('Moringa Seed',                    '200 g',        'Moringa Seed',     '200g'),
    -- ASHWAGANDA (legacy 220g/250g/100g all collapse onto the 300g SKU)
    ('Ashwagandha Tablet (Himalayan)',  '60 capsules',  'Ashewagenda (Himalya) Tablet', '60 Tablet'),
    ('Ashwagandha Tablet (Himalayan)',  '120 capsules', 'Ashewagenda (Himalya) Tablet', '120 Tablet'),
    ('Ashwagandha Powder',              '250 g',        'Ashewagenda powder', '300g'),
    ('Ashwagandha Powder',              '220 g',        'Ashewagenda powder', '300g'),
    ('Ashwagandha Powder',              '100 g',        'Ashewagenda powder', '300g'),
    ('Ashewagenda (300g) powder',       '300g',         'Ashewagenda powder', '300g'),
    ('Ashwegenda Powder',               '300g',         'Ashewagenda powder', '300g'),
    -- SHILAJIT
    ('Shilajit Capsules',               '60 capsules',  'Shilajit Tablet',   '60 Tablet'),
    ('Shilajit Gummies',                '30 gummies',   'Shilajit Gummies',  '30 Gummies'),
    -- CHIA
    ('Chia Seed',                       '250 g',        'Chia Seed',         '250g'),
    ('Chia Seed',                       '1 kg',         'Chia Seed',         '1kg'),
    -- KERBE / MYRRH POWDER + RAW
    ('Kerbe Powder',                    '100 g',        'Kerbe Powder',      '100g'),
    ('myrrh (Kerbe) Powder',            '100 g',        'Kerbe Powder',      '100g'),
    ('Kerbe Raw',                       '100 g',        'Asella Kerbe Raw',  '100g'),
    ('Asella Kerbe Raw',                '100 g',        'Asella Kerbe Raw',  '100g'),
    ('myrrh Kerbe Raw',                 '100 g',        'Asella Kerbe Raw',  '100g'),
    -- KERBE OIL (three legacy spellings)
    ('Kerebe (Myrrh )  Oil',            '30 ml',        'Kerebe (Myrrh) Oil', '30ml'),
    ('Kerebe (Myrrh )  Oil',            '60 ml',        'Kerebe (Myrrh) Oil', '60ml'),
    ('Myrrh  Kerebe  Oil',              '30 ml',        'Kerebe (Myrrh) Oil', '30ml'),
    ('Myrrh  Kerebe   Oil',             '60 ml',        'Kerebe (Myrrh) Oil', '60ml'),
    -- HIBISCUS / KERKEDE (four legacy spellings)
    ('Hibiscus Dry Leaf',               '100 g',        'Kerkede Leafe',     '100g'),
    ('Hibiscus Dry Leaf',               '200 g',        'Kerkede Leafe',     '200g'),
    ('Kerkede Leafe',                   '100 g',        'Kerkede Leafe',     '100g'),
    ('Kerkede Leafe',                   '200 g',        'Kerkede Leafe',     '200g'),
    ('hibiscus  Kerkede Leafe',         '200 g',        'Kerkede Leafe',     '200g'),
    ('hibiscus Kerkede Leafe',          '100 g',        'Kerkede Leafe',     '100g'),
    -- OTHERS
    ('Qasil Powder',                    '200 g',        'Kesil Powder',      '200g'),
    ('Kesil Powder',                    '200 g',        'Kesil Powder',      '200g'),
    ('Chebe Powder',                    '100 g',        'Chebe Powder',      '100g'),
    ('Turmeric Powder',                 '200 g',        'Erde',              '200g'),
    ('trumeric (Erde)',                 '200 g',        'Erde',              '200g'),
    ('Erde',                            '200 g',        'Erde',              '200g'),
    ('Frankincense Oil',                '30 ml',        'Frankincense Oil',  '30ml'),
    ('Blackseed Oil',                   '30 ml',        'Blackseed Oil',     '30ml'),
    ('Cinnamon',                        '100 g',        'Cinnamon',          '100g'),
    ('Pumpkin Seed',                    '100g',         'Pumpkin Seed',      '100g'),
    ('Cloves',                          '100g',         'Cloves',            '100g'),
    ('Clove',                           '100g',         'Cloves',            '100g'),
    ('Nila powder',                     '100g',         'Nila Powder',       '100g');

-- -----------------------------------------------------------------
-- 2. RE-POINT LINE ITEMS AT THE CATALOG
--
-- item_name and package_size are rewritten to the canonical spelling
-- because that string pair is the ONLY key deductOrderStock() uses.
-- product_id is set too, so the PATCH /orders/:id/items rebalance
-- path (which keys on product_id) also works.
--
-- Discontinued SKUs are deliberately left with product_id NULL.
-- -----------------------------------------------------------------
UPDATE order_items oi
JOIN tmp_sku_map m
  ON  m.legacy_name = oi.item_name
 AND  m.legacy_size = oi.package_size
JOIN products p
  ON  p.name          = m.target_name
 AND  p.package_size  = m.target_size
 AND  p.active        = 1
SET oi.product_id   = p.id,
    oi.item_name    = p.name,
    oi.package_size = p.package_size;

-- Unmatched legacy rows: make sure product_id is honest (NULL) rather
-- than pointing at a soft-deleted 004-era product row.
UPDATE order_items oi
LEFT JOIN products p
  ON  LOWER(oi.item_name) = LOWER(p.name)
 AND  oi.package_size     = p.package_size
 AND  p.active            = 1
SET oi.product_id = NULL
WHERE p.id IS NULL;

DROP TEMPORARY TABLE tmp_sku_map;

-- -----------------------------------------------------------------
-- 3. REALISTIC STOCK LEVELS
--
-- 006_clean_products.sql seeds every product at quantity 0, which
-- makes the whole storefront read "Out of Stock". The low-stock UI
-- (vw_low_stock, GET /api/stock/low) has four bands driven by
-- inventory_quantity vs low_stock_threshold:
--
--   qty = 0                     -> out_of_stock
--   0 < qty <= threshold / 2    -> critical
--   threshold / 2 < qty <= thr  -> low
--   qty > threshold             -> ok
--
-- Seed a spread across ALL FOUR bands plus exact boundary values so
-- every badge, filter and alert path has a row that hits it.
-- -----------------------------------------------------------------
UPDATE products SET inventory_quantity = 250, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000001';
UPDATE products SET inventory_quantity = 180, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000002';
UPDATE products SET inventory_quantity =  95, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000003';
-- exact low boundary: qty == threshold -> 'low'
UPDATE products SET inventory_quantity =  20, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000004';
-- exact critical boundary: qty == threshold/2 -> 'critical'
UPDATE products SET inventory_quantity =  15, low_stock_threshold = 30, active = 1 WHERE id = '11111111-0001-0001-0001-000000000031';
UPDATE products SET inventory_quantity =  60, low_stock_threshold = 15, active = 1 WHERE id = '11111111-0001-0001-0001-000000000005';
-- one below low boundary -> 'low'
UPDATE products SET inventory_quantity =  14, low_stock_threshold = 15, active = 1 WHERE id = '11111111-0001-0001-0001-000000000006';
-- out of stock band
UPDATE products SET inventory_quantity =   0, low_stock_threshold = 10, active = 1 WHERE id = '11111111-0001-0001-0001-000000000007';
-- single unit left -> fires the Telegram low-stock alert on the next sale
UPDATE products SET inventory_quantity =   1, low_stock_threshold = 10, active = 1 WHERE id = '11111111-0001-0001-0001-000000000008';
UPDATE products SET inventory_quantity =  40, low_stock_threshold = 10, active = 1 WHERE id = '11111111-0001-0001-0001-000000000009';
UPDATE products SET inventory_quantity =  22, low_stock_threshold = 12, active = 1 WHERE id = '11111111-0001-0001-0001-000000000010';
UPDATE products SET inventory_quantity = 300, low_stock_threshold = 25, active = 1 WHERE id = '11111111-0001-0001-0001-000000000011';
-- critical band
UPDATE products SET inventory_quantity =   8, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000012';
UPDATE products SET inventory_quantity = 130, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000013';
-- out of stock -> cannot be ordered; exercises the oversell guard
UPDATE products SET inventory_quantity =   0, low_stock_threshold = 10, active = 1 WHERE id = '11111111-0001-0001-0001-000000000014';
UPDATE products SET inventory_quantity =  70, low_stock_threshold = 15, active = 1 WHERE id = '11111111-0001-0001-0001-000000000015';
UPDATE products SET inventory_quantity =  35, low_stock_threshold = 15, active = 1 WHERE id = '11111111-0001-0001-0001-000000000016';
UPDATE products SET inventory_quantity =  45, low_stock_threshold = 12, active = 1 WHERE id = '11111111-0001-0001-0001-000000000017';
UPDATE products SET inventory_quantity =  90, low_stock_threshold = 15, active = 1 WHERE id = '11111111-0001-0001-0001-000000000018';
-- threshold 0: the degenerate boundary. qty > 0 is always 'ok',
-- qty = 0 is 'out_of_stock'. Nothing can ever be 'low' or 'critical'.
UPDATE products SET inventory_quantity =  18, low_stock_threshold =  0, active = 1 WHERE id = '11111111-0001-0001-0001-000000000019';
UPDATE products SET inventory_quantity =  26, low_stock_threshold = 12, active = 1 WHERE id = '11111111-0001-0001-0001-000000000020';
UPDATE products SET inventory_quantity =  33, low_stock_threshold = 12, active = 1 WHERE id = '11111111-0001-0001-0001-000000000021';
-- exact critical boundary again on a different threshold
UPDATE products SET inventory_quantity =   5, low_stock_threshold = 10, active = 1 WHERE id = '11111111-0001-0001-0001-000000000022';
UPDATE products SET inventory_quantity =  48, low_stock_threshold = 12, active = 1 WHERE id = '11111111-0001-0001-0001-000000000023';
UPDATE products SET inventory_quantity =  29, low_stock_threshold = 12, active = 1 WHERE id = '11111111-0001-0001-0001-000000000024';
UPDATE products SET inventory_quantity = 210, low_stock_threshold = 25, active = 1 WHERE id = '11111111-0001-0001-0001-000000000025';
UPDATE products SET inventory_quantity = 165, low_stock_threshold = 25, active = 1 WHERE id = '11111111-0001-0001-0001-000000000026';
UPDATE products SET inventory_quantity =  11, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000027';
-- out of stock
UPDATE products SET inventory_quantity =   0, low_stock_threshold = 10, active = 1 WHERE id = '11111111-0001-0001-0001-000000000028';
UPDATE products SET inventory_quantity =  75, low_stock_threshold = 20, active = 1 WHERE id = '11111111-0001-0001-0001-000000000029';
UPDATE products SET inventory_quantity =  62, low_stock_threshold = 15, active = 1 WHERE id = '11111111-0001-0001-0001-000000000030';

-- -----------------------------------------------------------------
-- 4. UNIT COST
--
-- products.unit_cost and order_items.unit_cost are both 0 everywhere,
-- so every margin / profit / COGS report returns zero. Seed a cost that
-- is a plausible fraction of retail price per product.
-- -----------------------------------------------------------------
UPDATE products SET unit_cost = ROUND(price * 0.55, 2) WHERE active = 1 AND (unit_cost IS NULL OR unit_cost = 0);

-- COGS on the historical line items, derived from the linked product.
UPDATE order_items oi
JOIN products p ON p.id = oi.product_id
SET oi.unit_cost = ROUND(p.unit_cost, 2)
WHERE oi.unit_cost = 0 OR oi.unit_cost IS NULL;

-- -----------------------------------------------------------------
-- 5. RECOMPUTE ORDER TOTALS FROM LINE ITEMS
--
-- orders.total is always SUM(quantity * unit_price) (see
-- src/routes/orders.ts:109). 137 legacy orders disagree with their own
-- line items, and some were exported as 0.00.
-- -----------------------------------------------------------------
UPDATE orders o
JOIN (
    SELECT order_id, ROUND(SUM(quantity * unit_price), 2) AS computed_total
    FROM order_items
    GROUP BY order_id
) x ON x.order_id = o.id
SET o.total = x.computed_total
WHERE ABS(o.total - x.computed_total) > 0.01;

-- -----------------------------------------------------------------
-- 6. REPAIR SMEARED ORDER PRICES
--
-- 004_dummy_data.sql contains orders where the exporter wrote the
-- SAME unit_price on every single line, equal to
-- (order total / total quantity). The real per-product prices were
-- lost. Example -- ORD-20260420-0002:
--
--   Moringa powder x10 @120950.00
--   Ashewagenda powder x4 @120950.00
--   Chia Seed x3 @120950.00        ... 21 lines, all @120950.00
--   total = 11,611,200.00 ETB
--
-- The catalog prices are 250-5000 ETB, so those totals were wrong by
-- three orders of magnitude. They dominated every revenue report: the
-- single worst customer was showing a 37,524,500.00 ETB lifetime
-- value. Total revenue across the export was ~59,000,000 ETB; after
-- repair it is ~2,600,000 ETB, which is consistent with the volume of
-- 414 orders.
--
-- TWO PASSES, both deliberately conservative:
--
-- Pass 1 -- whole-order smear. Fires only when EVERY line on the order
--   carries one identical unit_price AND that price is more than 3x
--   the highest catalog price on the order.
--
-- Pass 2 -- individual line outlier. Fires on any single line priced
--   more than 5x its own product's catalog price.
--
-- Genuine bulk and franchise orders price BELOW catalog, never above,
-- so neither pass can touch a real discount. Orders like
-- 'Bilise drug store' at 299,000.00 for 26kg of Moringa survive
-- untouched.
-- -----------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_smeared;
CREATE TEMPORARY TABLE tmp_smeared AS
SELECT oi.order_id, MAX(oi.unit_price) AS smeared_price
FROM order_items oi
GROUP BY oi.order_id
HAVING COUNT(DISTINCT oi.unit_price) = 1;

DELETE s FROM tmp_smeared s
JOIN (SELECT oi.order_id, MAX(p.price) AS max_catalog
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      GROUP BY oi.order_id) m ON m.order_id = s.order_id
WHERE s.smeared_price <= m.max_catalog * 3;

UPDATE order_items oi
JOIN tmp_smeared s ON s.order_id = oi.order_id
JOIN products p ON p.id = oi.product_id
SET oi.unit_price = p.price;

DROP TEMPORARY TABLE tmp_smeared;

-- Pass 2: single lines priced absurdly above their own product
UPDATE order_items oi
JOIN products p ON p.id = oi.product_id
SET oi.unit_price = p.price
WHERE oi.unit_price > p.price * 5;

-- Recompute totals once more; the price repair changes them.
UPDATE orders o
JOIN (
    SELECT order_id, ROUND(SUM(quantity * unit_price), 2) AS computed_total
    FROM order_items
    GROUP BY order_id
) x ON x.order_id = o.id
SET o.total = x.computed_total
WHERE ABS(o.total - x.computed_total) > 0.01;

-- -----------------------------------------------------------------
-- 7. SYNC stock_snapshots
--
-- stock_snapshots is written by recordMovement() but NOT by
-- POST /api/products/:id/stock or POST /api/products (see
-- src/routes/products.ts:567-576), so the two tables drift apart.
-- Realign them now; 030 re-introduces one deliberate drift row.
-- -----------------------------------------------------------------
INSERT INTO stock_snapshots (product_id, current_quantity, last_updated)
SELECT id, inventory_quantity, NOW() FROM products WHERE active = 1
ON DUPLICATE KEY UPDATE current_quantity = VALUES(current_quantity), last_updated = NOW();

INSERT IGNORE INTO migrations_log (filename) VALUES ('026_repair_catalog.sql');