-- ===================================================================
-- 051_repair_smeared_order_item_prices.sql
-- Asella Organic -- rebuild the line prices of orders whose
--                  order_items.unit_price holds the whole order total
-- ===================================================================
--
-- THE DEFECT
-- ----------
-- In 137 historical orders every order_items.unit_price row holds the
-- *order total* instead of the price of one unit, e.g.
--
--     ORD-20260420-0002   orders.total = 120,950.00
--       Ashwagandha Powder  100 g  qty 4  unit_price 120,950.00
--       Moringa Powder      1 kg   qty 10 unit_price 120,950.00
--       ... all 22 lines carry 120,950.00
--
-- Summing quantity x unit_price therefore produces nonsense: that one
-- order "totals" 11,611,200.00 instead of 120,950.00. Across all 137
-- orders the phantom sum is 45,188,150.00 -- the 43.5M that is not real.
--
-- orders.total is NOT wrong. It is the amount the customer was billed
-- and it matches the payment records. Only the line prices are corrupt.
--
-- THE REPAIR
-- ----------
-- The historical unit price of a product can be recovered from the
-- orders that are already correct: for each (item_name, package_size)
-- the most frequent unit_price among the healthy orders is that
-- product's real price. Rebuilding the 137 orders with those prices
-- reproduces orders.total *exactly* for 125 of them -- proof that both
-- orders.total and the anchor prices are right.
--
-- This migration therefore:
--   1. builds the historical anchor price per (item_name, package_size)
--      from the orders whose lines already add up;
--   2. rewrites every line of every affected order to that anchor price,
--      so no line anywhere still holds the whole order total;
--   3. for every order whose rebuilt sum equals orders.total (within
--      1.00 ETB) it closes the order_total_audit row as 'applied';
--   4. leaves the remaining 12 orders open, with the rebuilt sum in
--      proposed_total and a reason, because their items were changed
--      after the total was set and no automatic rule can reconcile them.
--      Those 12 are a real, small discrepancy (~181K ETB in total), not
--      the 43.5M of phantom line totals.
--
-- orders.total is never modified. No order, order_item or product is
-- added or deleted. The healthy orders are never touched.
--
-- Idempotent: after the first run the repaired orders no longer differ,
-- so a second run finds only the 12 exceptions and changes nothing.
-- ===================================================================

DROP PROCEDURE IF EXISTS repair_smeared_order_item_prices;
DELIMITER //
CREATE PROCEDURE repair_smeared_order_item_prices()
BEGIN
  DECLARE v_candidates INT DEFAULT 0;
  DECLARE v_repaired   INT DEFAULT 0;
  DECLARE v_remaining  INT DEFAULT 0;
  DECLARE v_bad        INT DEFAULT 0;

  -- ── 1. historical anchor price per (item_name, package_size) ────────
  DROP TEMPORARY TABLE IF EXISTS tmp_051_anchor;
  CREATE TEMPORARY TABLE tmp_051_anchor (
    nm         VARCHAR(255)  NOT NULL,
    sz         VARCHAR(100)  NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    hits       INT           NOT NULL,
    PRIMARY KEY (nm, sz)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_051_anchor (nm, sz, unit_price, hits)
  SELECT LOWER(TRIM(x.item_name)),
         LOWER(TRIM(x.package_size)),
         x.unit_price,
         x.n
    FROM (
      SELECT oi.item_name,
             oi.package_size,
             oi.unit_price,
             COUNT(*) AS n,
             ROW_NUMBER() OVER (
               PARTITION BY LOWER(TRIM(oi.item_name)), LOWER(TRIM(oi.package_size))
               ORDER BY COUNT(*) DESC, oi.unit_price DESC
             ) AS rn
        FROM order_items oi
       WHERE oi.unit_price > 0
         AND oi.order_id NOT IN (
               SELECT a.order_id
                 FROM order_total_audit a
                WHERE ABS(a.old_total - a.line_total) > 0.01
                   -- 'applied' rows are ones this migration already
                   -- repaired; excluding them keeps the anchor identical
                   -- on every re-run (idempotency).
                   OR  a.status = 'applied')
       GROUP BY oi.item_name, oi.package_size, oi.unit_price
    ) x
   WHERE x.rn = 1;

  -- ── 2. candidate orders and the sum rebuilt from the anchor ─────────
  DROP TEMPORARY TABLE IF EXISTS tmp_051_repair;
  CREATE TEMPORARY TABLE tmp_051_repair (
    order_id     VARCHAR(50)   NOT NULL PRIMARY KEY,
    orders_total DECIMAL(12,2) NOT NULL,
    rebuilt      DECIMAL(12,2) NOT NULL,
    items        INT           NOT NULL
  ) ENGINE=InnoDB;

  INSERT INTO tmp_051_repair (order_id, orders_total, rebuilt, items)
  SELECT a.order_id,
         o.total,
         ROUND(SUM(oi.quantity * COALESCE(an.unit_price, p.price, 0)), 2),
         COUNT(*)
    FROM order_total_audit a
    JOIN orders o       ON o.id = a.order_id
    JOIN order_items oi ON oi.order_id = a.order_id
    LEFT JOIN tmp_051_anchor an
           ON an.nm = LOWER(TRIM(oi.item_name))
          AND an.sz = LOWER(TRIM(oi.package_size))
    LEFT JOIN products p ON p.id = oi.product_id
   WHERE ABS(a.old_total - a.line_total) > 0.01
   GROUP BY a.order_id, o.total;

  SELECT COUNT(*) INTO v_candidates FROM tmp_051_repair;

  -- ── 3. rewrite the line prices of every candidate order ─────────────
  -- Every candidate is rewritten, including the exceptions, so that no
  -- line anywhere still holds the whole order total. For the exceptions
  -- the rebuilt sum will not equal orders.total -- that real difference
  -- is what the audit row is left open to report.
  UPDATE order_items oi
    JOIN tmp_051_repair r ON r.order_id = oi.order_id
    LEFT JOIN tmp_051_anchor an
           ON an.nm = LOWER(TRIM(oi.item_name))
          AND an.sz = LOWER(TRIM(oi.package_size))
    LEFT JOIN products p ON p.id = oi.product_id
     SET oi.unit_price = COALESCE(an.unit_price, p.price)
   WHERE COALESCE(an.unit_price, p.price) > 0;

  -- ── 4. record the rebuilt sum on every candidate audit row ──────────
  UPDATE order_total_audit a
    JOIN tmp_051_repair r ON r.order_id = a.order_id
     SET a.line_total = r.rebuilt;

  -- ── 5. close the audit rows that now reconcile ──────────────────────
  UPDATE order_total_audit a
    JOIN tmp_051_repair r ON r.order_id = a.order_id
     SET a.status     = 'applied',
         a.reason     = 'Line prices held the whole order total; each line was rebuilt from the historical unit price of the same product and size.',
         a.applied_at = NOW()
   WHERE ABS(r.rebuilt - r.orders_total) < 1;

  -- ── 6. flag the exceptions for a human ──────────────────────────────
  UPDATE order_total_audit a
    JOIN tmp_051_repair r ON r.order_id = a.order_id
     SET a.proposed_total = r.rebuilt,
         a.status         = 'open',
         a.reason         = 'Order items were changed after the total was set; the rebuilt lines cannot be reconciled with orders.total automatically.'
   WHERE ABS(r.rebuilt - r.orders_total) >= 1;

  -- ── 7. verify ───────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_repaired
    FROM tmp_051_repair r
   WHERE ABS(r.rebuilt - r.orders_total) < 1;

  SELECT COUNT(*) INTO v_remaining
    FROM tmp_051_repair r
   WHERE ABS(r.rebuilt - r.orders_total) >= 1;

  -- every repaired order must now add up to orders.total
  SELECT COUNT(*) INTO v_bad
    FROM tmp_051_repair r
    JOIN (SELECT oi.order_id, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS s
            FROM order_items oi GROUP BY oi.order_id) t
      ON t.order_id = r.order_id
   WHERE ABS(r.rebuilt - r.orders_total) < 1
     AND ABS(t.s - r.orders_total) >= 1;

  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '051_repair_smeared_order_item_prices: a repaired order still does not add up';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_051_anchor;
  DROP TEMPORARY TABLE IF EXISTS tmp_051_repair;

  SELECT CONCAT('051_repair_smeared_order_item_prices: ',
                v_candidates, ' candidate orders, ',
                v_repaired,   ' repaired, ',
                v_remaining,  ' left open') AS result;
END//
DELIMITER ;

CALL repair_smeared_order_item_prices();
DROP PROCEDURE IF EXISTS repair_smeared_order_item_prices;

INSERT IGNORE INTO migrations_log (filename) VALUES ('051_repair_smeared_order_item_prices.sql');

SELECT '051_repair_smeared_order_item_prices.sql applied' AS result;
