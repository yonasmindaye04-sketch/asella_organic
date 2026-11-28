-- 026_delivery_rejections.sql
-- Tracks delivery order rejections by drivers so the admin can compute
-- accept/reject rates per delivery team member.

CREATE TABLE IF NOT EXISTS delivery_rejections (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    order_id       VARCHAR(50)   NOT NULL,
    driver_username VARCHAR(255) NOT NULL,
    rejected_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    reason         VARCHAR(255)  NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_delivery_rejections_driver ON delivery_rejections(driver_username, rejected_at);
CREATE INDEX idx_delivery_rejections_order  ON delivery_rejections(order_id);

-- Indexes to speed up delivery-performance aggregation queries.
--
-- CREATE INDEX IF NOT EXISTS is MariaDB-only. MySQL 8 rejects it with a
-- syntax error, and this migration is the one that stops the whole queue
-- on a MySQL host, because the runner applies the files in order and
-- gives up on the first failure. The information_schema guard runs on
-- both engines and keeps the file re-runnable, which is the property the
-- IF NOT EXISTS was there to provide.
DROP PROCEDURE IF EXISTS add_orders_delivery_indexes;

DELIMITER $$
CREATE PROCEDURE add_orders_delivery_indexes()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND INDEX_NAME   = 'idx_orders_assigned_status'
    ) THEN
        CREATE INDEX idx_orders_assigned_status ON orders(assigned_to, status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND INDEX_NAME   = 'idx_orders_delivery_date'
    ) THEN
        CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND INDEX_NAME   = 'idx_orders_city_location'
    ) THEN
        CREATE INDEX idx_orders_city_location ON orders(city, location);
    END IF;
END$$
DELIMITER ;

CALL add_orders_delivery_indexes();
DROP PROCEDURE IF EXISTS add_orders_delivery_indexes;
