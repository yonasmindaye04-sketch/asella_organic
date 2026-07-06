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
-- DISABLED — application code (deductOrderStock in orders.ts) handles
-- stock deduction atomically. Keeping both caused double-deduction.
-- See migration 011_drop_inventory_trigger.sql.
-- DROP TRIGGER IF EXISTS trg_deduct_inventory_on_delivered;

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