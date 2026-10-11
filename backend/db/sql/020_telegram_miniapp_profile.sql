-- ============================================================
-- 020_telegram_miniapp_profile.sql
-- Profile storage + lookup indexes for the Telegram Mini App
-- Account tab (GET/PUT /api/telegram/profile) and the Orders tab.
--
-- Written to be re-runnable: `IF NOT EXISTS` on every column and index.
-- idx_orders_phone already existed from 001_complete_schema.sql, which made
-- this migration fail on re-run and block every later migration in the queue.
-- ============================================================

-- Editable profile fields, keyed by Telegram chat id.
--
-- setup.md promises "MySQL 8.0+ or MariaDB 10.5+", but ADD COLUMN IF NOT
-- EXISTS and CREATE INDEX IF NOT EXISTS are MariaDB-only. MySQL 8 rejects
-- both with a syntax error, which is how this migration used to stop the
-- whole queue on a MySQL host. Guarding each addition through
-- information_schema works on both engines and keeps the file re-runnable,
-- which is the property the original IF NOT EXISTS was there to provide:
-- idx_orders_phone already existed from 001_complete_schema.sql.
DROP PROCEDURE IF EXISTS add_miniapp_profile_columns;

DELIMITER $$
CREATE PROCEDURE add_miniapp_profile_columns()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'telegram_users'
          AND COLUMN_NAME  = 'display_name'
    ) THEN
        ALTER TABLE telegram_users ADD COLUMN display_name VARCHAR(255) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'telegram_users'
          AND COLUMN_NAME  = 'phone'
    ) THEN
        ALTER TABLE telegram_users ADD COLUMN phone VARCHAR(50) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'telegram_users'
          AND COLUMN_NAME  = 'city'
    ) THEN
        ALTER TABLE telegram_users ADD COLUMN city VARCHAR(255) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'telegram_users'
          AND COLUMN_NAME  = 'location'
    ) THEN
        ALTER TABLE telegram_users ADD COLUMN location VARCHAR(255) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'telegram_users'
          AND COLUMN_NAME  = 'profile_updated_at'
    ) THEN
        ALTER TABLE telegram_users ADD COLUMN profile_updated_at DATETIME NULL;
    END IF;
END$$
DELIMITER ;

CALL add_miniapp_profile_columns();
DROP PROCEDURE IF EXISTS add_miniapp_profile_columns;

-- Customer orders are resolved by joining orders.phone to customers.phone
-- for the row carrying the caller's telegram_chat_id.
DROP PROCEDURE IF EXISTS add_miniapp_profile_indexes;

DELIMITER $$
CREATE PROCEDURE add_miniapp_profile_indexes()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'customers'
          AND INDEX_NAME   = 'idx_customers_telegram_chat'
    ) THEN
        CREATE INDEX idx_customers_telegram_chat ON customers(telegram_chat_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND INDEX_NAME   = 'idx_orders_phone'
    ) THEN
        CREATE INDEX idx_orders_phone ON orders(phone);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND INDEX_NAME   = 'idx_orders_status_created'
    ) THEN
        CREATE INDEX idx_orders_status_created ON orders(status, created_at);
    END IF;
END$$
DELIMITER ;

CALL add_miniapp_profile_indexes();
DROP PROCEDURE IF EXISTS add_miniapp_profile_indexes;