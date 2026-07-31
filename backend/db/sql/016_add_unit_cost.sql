-- Add unit_cost to products table
ALTER TABLE products
ADD COLUMN unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Add unit_cost to order_items table
ALTER TABLE order_items
ADD COLUMN unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Register migration
INSERT IGNORE INTO migrations_log (filename) VALUES ('016_add_unit_cost.sql');
