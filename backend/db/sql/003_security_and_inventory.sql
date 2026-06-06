-- ═══════════════════════════════════════════════════════════════════
-- 003_security_and_inventory.sql
-- Asella Organic — 2FA Columns + Inventory Deduction Trigger (MySQL 8.0)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Two-Factor Authentication columns ─────────────────────────
-- MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS.
-- Use a procedure to check and add columns safely.
DROP PROCEDURE IF EXISTS add_2fa_columns;

DELIMITER $$
CREATE PROCEDURE add_2fa_columns()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'staff_users'
          AND COLUMN_NAME  = 'two_factor_secret'
    ) THEN
        ALTER TABLE staff_users ADD COLUMN two_factor_secret VARCHAR(255) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'staff_users'
          AND COLUMN_NAME  = 'two_factor_enabled'
    ) THEN
        ALTER TABLE staff_users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END$$
DELIMITER ;

CALL add_2fa_columns();
DROP PROCEDURE IF EXISTS add_2fa_columns;

-- ── 2. Seed stock_snapshots from existing products ────────────────
INSERT INTO stock_snapshots (product_id, current_quantity)
SELECT id, inventory_quantity
FROM   products
WHERE  active = TRUE
ON DUPLICATE KEY UPDATE current_quantity = VALUES(current_quantity);

-- ── 3. Inventory deduction trigger on order delivered ────────────
DROP TRIGGER IF EXISTS trg_deduct_inventory_on_delivered;

CREATE TRIGGER trg_deduct_inventory_on_delivered
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
    IF NEW.status = 'Delivered' AND OLD.status != 'Delivered' THEN
        BEGIN
            DECLARE done          INT DEFAULT FALSE;
            DECLARE v_product_id  CHAR(36);
            DECLARE v_quantity    INT;
            DECLARE v_current_qty INT;
            DECLARE v_new_qty     INT;

            DECLARE item_cursor CURSOR FOR
                SELECT p.id, oi.quantity, p.inventory_quantity
                FROM   order_items oi
                JOIN   products p
                  ON   LOWER(oi.item_name) = LOWER(p.name)
                 AND   oi.package_size     = p.package_size
                WHERE  oi.order_id = NEW.id
                  AND  p.active    = TRUE;

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            OPEN item_cursor;
            read_loop: LOOP
                FETCH item_cursor INTO v_product_id, v_quantity, v_current_qty;
                IF done THEN LEAVE read_loop; END IF;

                SET v_new_qty = GREATEST(0, v_current_qty - v_quantity);

                UPDATE products
                SET    inventory_quantity = v_new_qty,
                       updated_at         = NOW()
                WHERE  id = v_product_id;

                INSERT INTO stock_snapshots (product_id, current_quantity)
                VALUES (v_product_id, v_new_qty)
                ON DUPLICATE KEY UPDATE
                    current_quantity = v_new_qty,
                    last_updated     = NOW();

                INSERT INTO inventory_movements
                    (id, product_id, movement_type, change_amount, reason,
                     performed_by, quantity_after, reference_id, reference_type)
                VALUES
                    (UUID(), v_product_id, 'sale', -v_quantity,
                     CONCAT('Order ', NEW.id, ' delivered'),
                     NULL, v_new_qty, NEW.id, 'order');

            END LOOP;
            CLOSE item_cursor;
        END;
    END IF;
END;

-- ── 4. Low-stock view ─────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_low_stock AS
SELECT
    p.id,
    p.name,
    p.package_size,
    p.inventory_quantity,
    p.low_stock_threshold,
    CASE
        WHEN p.inventory_quantity = 0                           THEN 'out_of_stock'
        WHEN p.inventory_quantity <= p.low_stock_threshold / 2 THEN 'critical'
        WHEN p.inventory_quantity <= p.low_stock_threshold      THEN 'low'
        ELSE 'ok'
    END AS stock_status
FROM products p
WHERE p.active = TRUE
  AND p.inventory_quantity <= p.low_stock_threshold
ORDER BY p.inventory_quantity ASC;

-- ── 5. Inventory summary view ─────────────────────────────────────
CREATE OR REPLACE VIEW vw_inventory_summary AS
SELECT
    COUNT(*)                                                                         AS total_products,
    SUM(inventory_quantity)                                                          AS total_units,
    SUM(CASE WHEN inventory_quantity = 0                        THEN 1 ELSE 0 END)  AS out_of_stock_count,
    SUM(CASE WHEN inventory_quantity > 0
              AND inventory_quantity <= low_stock_threshold / 2 THEN 1 ELSE 0 END)  AS critical_count,
    SUM(CASE WHEN inventory_quantity > low_stock_threshold / 2
              AND inventory_quantity <= low_stock_threshold      THEN 1 ELSE 0 END)  AS low_count,
    SUM(CASE WHEN inventory_quantity > low_stock_threshold       THEN 1 ELSE 0 END)  AS ok_count,
    SUM(inventory_quantity * price)                                                  AS total_stock_value
FROM products
WHERE active = TRUE;

INSERT IGNORE INTO migrations_log (filename) VALUES ('003_security_and_inventory.sql');

SELECT '003_security_and_inventory.sql applied successfully.' AS result;