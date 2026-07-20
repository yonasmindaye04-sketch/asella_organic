ALTER TABLE orders
ADD COLUMN created_by_staff_id CHAR(36) NULL,
ADD CONSTRAINT fk_orders_staff FOREIGN KEY (created_by_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL;
