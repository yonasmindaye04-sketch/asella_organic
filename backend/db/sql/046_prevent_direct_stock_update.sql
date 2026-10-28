-- ============================================================
-- Prevent direct inventory_quantity updates outside recordMovement()
-- Every stock change MUST go through recordMovement() which writes
-- both products.inventory_quantity AND inventory_movements in one
-- transaction. Direct updates bypass the audit ledger and cause drift.
--
-- This trigger blocks UPDATEs that change inventory_quantity directly.
-- INSERTs are allowed (initial import sets quantity + movement together).
-- ============================================================

DELIMITER $$

CREATE TRIGGER trg_prevent_direct_stock_update
BEFORE UPDATE ON products
FOR EACH ROW
BEGIN
  IF NEW.inventory_quantity <> OLD.inventory_quantity THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Direct inventory_quantity update forbidden. Use recordMovement() instead.';
  END IF;
END$$

DELIMITER ;
