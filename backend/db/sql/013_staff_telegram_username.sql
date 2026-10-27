-- 013: Add telegram fields to staff_users for Telegram RBAC
-- Idempotent: checks if columns exist before adding.

-- Add telegram_username if missing
DROP PROCEDURE IF EXISTS add_staff_telegram_fields;
DELIMITER //
CREATE PROCEDURE add_staff_telegram_fields()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_users'
      AND COLUMN_NAME = 'telegram_username'
  ) THEN
    ALTER TABLE staff_users
      ADD COLUMN telegram_username VARCHAR(255) NULL AFTER phone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_users'
      AND COLUMN_NAME = 'telegram_chat_id'
  ) THEN
    ALTER TABLE staff_users
      ADD COLUMN telegram_chat_id BIGINT NULL AFTER telegram_username;
  END IF;
END//
DELIMITER ;
CALL add_staff_telegram_fields();
DROP PROCEDURE IF EXISTS add_staff_telegram_fields;

-- Add indexes if missing
DROP PROCEDURE IF EXISTS add_staff_telegram_indexes;
DELIMITER //
CREATE PROCEDURE add_staff_telegram_indexes()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_users'
      AND INDEX_NAME = 'idx_staff_tg_username'
  ) THEN
    CREATE INDEX idx_staff_tg_username ON staff_users(telegram_username);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_users'
      AND INDEX_NAME = 'idx_staff_tg_chat_id'
  ) THEN
    CREATE INDEX idx_staff_tg_chat_id ON staff_users(telegram_chat_id);
  END IF;
END//
DELIMITER ;
CALL add_staff_telegram_indexes();
DROP PROCEDURE IF EXISTS add_staff_telegram_indexes;

INSERT IGNORE INTO migrations_log (filename) VALUES ('013_staff_telegram_username.sql');

SELECT '013_staff_telegram_username.sql applied' AS result;
