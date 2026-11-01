-- ============================================================
-- Prevent direct inventory_quantity updates outside recordMovement()
-- Every stock change MUST go through recordMovement() which writes
-- both products.inventory_quantity AND inventory_movements in one
-- transaction. Direct updates bypass the audit ledger and cause drift.
--
-- This trigger blocks UPDATEs that change inventory_quantity directly.
-- INSERTs are allowed (initial import sets quantity + movement together).
--
-- ESCAPE HATCH (required - do not remove)
-- --------------------------------------------
-- recordMovement() (backend/src/lib/inventory.ts) IS the blessed writer and
-- it updates products.inventory_quantity directly. Without an opt-out, this
-- trigger would reject the very update it is meant to protect, breaking
-- every stock movement in the application (order placement, receipts,
-- adjustments, write-offs).
--
-- The opt-out is a connection-scoped session variable:
--     SET @asella_stock_movement = 1;   -- allow this connection to write
--     SET @asella_stock_movement = 0;   -- revoke it again
--
-- recordMovement() and import-catalog.cjs set it immediately around their
-- own UPDATE and reset it straight after, so it can never leak onto another
-- request that reuses the same pooled connection.
-- ============================================================

DELIMITER $$

DROP TRIGGER IF EXISTS trg_prevent_direct_stock_update$$

CREATE TRIGGER trg_prevent_direct_stock_update
BEFORE UPDATE ON products
FOR EACH ROW
BEGIN
  IF COALESCE(@asella_stock_movement, 0) = 0
     AND NEW.inventory_quantity <> OLD.inventory_quantity THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Direct inventory_quantity update forbidden. Use recordMovement() instead.';
  END IF;
END$$

DELIMITER ;
