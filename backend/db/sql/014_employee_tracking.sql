-- 014: Add created_by_staff_id to orders for employee tracking
-- Idempotent: checks if column and constraint exist before adding.

-- Add created_by_staff_id column if missing
DROP PROCEDURE IF EXISTS add_created_by_staff_id;
DELIMITER //
CREATE PROCEDURE add_created_by_staff_id()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'created_by_staff_id'
  ) THEN
    ALTER TABLE orders
      ADD COLUMN created_by_staff_id CHAR(36) NULL;
  END IF;
END//
DELIMITER ;
CALL add_created_by_staff_id();
DROP PROCEDURE IF EXISTS add_created_by_staff_id;

-- Add FK constraint if missing
DROP PROCEDURE IF EXISTS add_orders_staff_fk;
DELIMITER //
CREATE PROCEDURE add_orders_staff_fk()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND CONSTRAINT_NAME = 'fk_orders_staff'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT fk_orders_staff
      FOREIGN KEY (created_by_staff_id) REFERENCES staff_users(id)
      ON DELETE SET NULL;
  END IF;
END//
DELIMITER ;
CALL add_orders_staff_fk();
DROP PROCEDURE IF EXISTS add_orders_staff_fk;

INSERT IGNORE INTO migrations_log (filename) VALUES ('014_employee_tracking.sql');

SELECT '014_employee_tracking.sql applied' AS result;
