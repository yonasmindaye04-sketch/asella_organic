-- ═══════════════════════════════════════════════════════════════════
-- 005_order_items_product_id.sql
-- Fixes Bug #3: Fragile name-matching in stock deduction.
-- MySQL 8.0 compatible version.
-- ═══════════════════════════════════════════════════════════════════

-- MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS — use a procedure
DROP PROCEDURE IF EXISTS add_order_items_product_id;

DELIMITER $$
CREATE PROCEDURE add_order_items_product_id()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'order_items'
          AND COLUMN_NAME  = 'product_id'
    ) THEN
        ALTER TABLE order_items
            ADD COLUMN product_id CHAR(36) NULL,
            ADD CONSTRAINT fk_order_items_product
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
    END IF;
END$$
DELIMITER ;

CALL add_order_items_product_id();
DROP PROCEDURE IF EXISTS add_order_items_product_id;

-- Back-fill existing rows
UPDATE order_items oi
JOIN   products p
   ON  LOWER(oi.item_name)   = LOWER(p.name)
   AND oi.package_size        = p.package_size
   AND p.active               = TRUE
SET    oi.product_id = p.id
WHERE  oi.product_id IS NULL;

CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- ── Inventory deduction trigger ──
-- DISABLED — see 003_security_and_inventory.sql comment.
-- Application code handles stock. This trigger caused double-deduction.
-- DROP TRIGGER IF EXISTS trg_deduct_inventory_on_delivered;

INSERT IGNORE INTO migrations_log (filename) VALUES ('005_order_items_product_id.sql');
SELECT '005_order_items_product_id.sql applied successfully.' AS result;