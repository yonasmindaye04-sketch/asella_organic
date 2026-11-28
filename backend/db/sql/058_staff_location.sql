-- Migration: Add location to staff_users for store branch assignment
--
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS is MariaDB-only; MySQL 8
-- rejects it with a syntax error. The information_schema guard runs on
-- both engines and keeps the file re-runnable, which is the property the
-- IF NOT EXISTS was there to provide.
DROP PROCEDURE IF EXISTS add_staff_users_location;

DELIMITER $$
CREATE PROCEDURE add_staff_users_location()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'staff_users'
          AND COLUMN_NAME  = 'location'
    ) THEN
        ALTER TABLE staff_users ADD COLUMN location VARCHAR(255) NULL AFTER phone;
    END IF;
END$$
DELIMITER ;

CALL add_staff_users_location();
DROP PROCEDURE IF EXISTS add_staff_users_location;

INSERT IGNORE INTO migrations_log (filename) VALUES ('058_staff_location.sql');
