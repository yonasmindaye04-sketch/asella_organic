-- ═══════════════════════════════════════════════════════════════════
-- 005_order_items_product_id.sql
-- Fixes Bug #3: Fragile name-matching in stock deduction.
--
-- Adds product_id (FK → products.id) to order_items so the inventory
-- trigger can do a direct UUID join instead of LOWER(name) matching.
-- The column is nullable so existing rows are not broken.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS product_id CHAR(36) NULL
        REFERENCES products(id) ON DELETE SET NULL;

-- Back-fill existing rows using the same LOWER+package_size logic
-- (best-effort — rows that don't match stay NULL and fall back to
--  the old name join, which is still present as a safety net)
UPDATE order_items oi
JOIN   products p
   ON  LOWER(oi.item_name)   = LOWER(p.name)
   AND oi.package_size        = p.package_size
   AND p.active               = TRUE
SET    oi.product_id = p.id
WHERE  oi.product_id IS NULL;

CREATE INDEX idx_order_items_product_id
    ON order_items(product_id);

-- ── Re-create inventory deduction trigger to use product_id first ──
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
            DECLARE v_item_name   VARCHAR(255);

            -- Prefer direct product_id FK; fall back to name+size match
            DECLARE item_cursor CURSOR FOR
                SELECT
                    COALESCE(oi.product_id, p2.id) AS resolved_product_id,
                    oi.quantity,
                    COALESCE(p1.inventory_quantity, p2.inventory_quantity) AS current_qty,
                    oi.item_name
                FROM order_items oi
                -- Join path 1: direct UUID
                LEFT JOIN products p1
                       ON p1.id      = oi.product_id
                      AND p1.active  = TRUE
                -- Join path 2: name fallback (only used when product_id IS NULL)
                LEFT JOIN products p2
                       ON oi.product_id IS NULL
                      AND LOWER(oi.item_name) = LOWER(p2.name)
                      AND oi.package_size      = p2.package_size
                      AND p2.active            = TRUE
                WHERE oi.order_id = NEW.id
                  AND COALESCE(oi.product_id, p2.id) IS NOT NULL;

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            OPEN item_cursor;
            read_loop: LOOP
                FETCH item_cursor INTO v_product_id, v_quantity, v_current_qty, v_item_name;
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

INSERT IGNORE INTO migrations_log (filename) VALUES ('005_order_items_product_id.sql');
SELECT '005_order_items_product_id.sql applied successfully.' AS result;