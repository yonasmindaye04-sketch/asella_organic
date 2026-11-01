-- ===================================================================
-- 052_reconcile_april20_orders.sql
-- Asella Organic -- close the last two orders that can be proven
-- ===================================================================
--
-- 051 rebuilt the line prices of the 137 smeared orders from the
-- historical price of each (item_name, package_size) pair. 125 of them
-- then added up to orders.total exactly. 12 did not, and 10 of those are
-- genuine "items modified after the total was set" cases (the
-- order_status_history notes say so) that need a human decision.
--
-- This migration closes 2 of the 12. ORD-20260420-0001 and
-- ORD-20260420-0002 were both placed on 20 April 2026, both contain
--
--     Ashwagandha Powder   100 g   x4
--
-- and both are exactly 800.00 ETB over their orders.total. 800 / 4 =
-- 200.00. The variant was added to the catalogue after those orders
-- were taken, so it has no healthy-order anchor and 051 had to fall
-- back to its current catalogue price of 1,200.00. The historical price
-- was 1,000.00:
--
--     ORD-20260420-0001   99,250.00 - 4 x 200 = 98,450.00  = orders.total
--     ORD-20260420-0002  121,750.00 - 4 x 200 = 120,950.00 = orders.total
--
-- One line price explains both orders exactly, and no other line has
-- the same quantity in both. The catalogue price (1,200.00) is left
-- alone: that is today's price, not the April price.
--
-- WHAT IT DOES NOT DO
-- -------------------
--   * orders.total is never modified.
--   * The catalogue is never modified.
--   * No order or order_item is added or deleted.
--   * The other 10 exceptions are left open for a human decision.
--
-- Idempotent: the UPDATE only matches the two known line sets, and once
-- they are repaired the verification passes without changing anything.
-- ===================================================================

DROP PROCEDURE IF EXISTS reconcile_april20_orders;
DELIMITER //
CREATE PROCEDURE reconcile_april20_orders()
BEGIN
  DECLARE v_changed   INT DEFAULT 0;
  DECLARE v_bad       INT DEFAULT 0;
  DECLARE v_open      INT DEFAULT 0;

  -- ── 1. rewrite the two known lines at their April price ────────────
  UPDATE order_items oi
    JOIN orders o ON o.id = oi.order_id
     SET oi.unit_price = 1000.00
   WHERE oi.order_id IN ('ORD-20260420-0001', 'ORD-20260420-0002')
     AND LOWER(TRIM(oi.item_name))    = 'ashwagandha powder'
     AND LOWER(TRIM(oi.package_size)) = '100 g'
     AND oi.quantity = 4
     AND oi.unit_price = 1200.00;

  SET v_changed = ROW_COUNT();

  -- ── 2. recompute the audit sum and close the two rows ──────────────
  UPDATE order_total_audit a
    JOIN (
      SELECT oi.order_id, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS s
        FROM order_items oi
       WHERE oi.order_id IN ('ORD-20260420-0001', 'ORD-20260420-0002')
       GROUP BY oi.order_id
    ) t ON t.order_id = a.order_id
     SET a.line_total = t.s,
         a.status     = 'applied',
         a.reason     = 'April 2026 price of Ashwagandha Powder 100 g was 1,000.00, not the 1,200.00 catalogue price used as the fallback anchor.',
         a.applied_at = NOW()
   WHERE a.order_id IN ('ORD-20260420-0001', 'ORD-20260420-0002')
     AND ABS(t.s - a.old_total) < 0.01;

  -- ── 3. verify ──────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_bad
    FROM orders o
    JOIN (
      SELECT order_id, ROUND(SUM(quantity * unit_price), 2) AS s
        FROM order_items GROUP BY order_id
    ) t ON t.order_id = o.id
   WHERE o.id IN ('ORD-20260420-0001', 'ORD-20260420-0002')
     AND ABS(t.s - o.total) >= 0.01;

  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '052_reconcile_april20_orders: the two orders still do not add up';
  END IF;

  -- ── 4. report what is left ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_open
    FROM order_total_audit
   WHERE ABS(old_total - line_total) > 0.01;

  SELECT CONCAT('052_reconcile_april20_orders: ',
                v_changed, ' line prices rewritten, ',
                '2 audit rows closed, ',
                v_open, ' exceptions still open') AS result;
END//
DELIMITER ;

CALL reconcile_april20_orders();
DROP PROCEDURE IF EXISTS reconcile_april20_orders;

INSERT IGNORE INTO migrations_log (filename) VALUES ('052_reconcile_april20_orders.sql');

SELECT '052_reconcile_april20_orders.sql applied' AS result;
