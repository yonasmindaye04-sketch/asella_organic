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
CREATE INDEX IF NOT EXISTS idx_orders_assigned_status ON orders(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date   ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_city_location   ON orders(city, location);
