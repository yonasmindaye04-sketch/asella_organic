-- Create order_status_history if it somehow doesn't exist
CREATE TABLE IF NOT EXISTS order_status_history (
    id         INT          AUTO_INCREMENT PRIMARY KEY,
    order_id   VARCHAR(50)  NOT NULL,
    old_status VARCHAR(50)  NULL,
    new_status VARCHAR(50)  NOT NULL,
    note       TEXT         NULL,
    changed_by VARCHAR(100) NULL,
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
