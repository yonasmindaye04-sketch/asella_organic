-- ===================================================================
-- 063_direct_messages_and_media.sql
-- Asella Organic — Direct (Personal) Messaging and Media Uploads
--
-- Adds support for:
-- 1. Direct one-on-one coworker/admin messaging (recipient_id, is_direct, is_read)
-- 2. Media attachments (media_url, media_type, media_name, media_size)
-- ===================================================================

-- 1. Modify content to be nullable (to allow messages that only contain media attachments)
ALTER TABLE internal_messages MODIFY COLUMN content TEXT NULL;

-- 2. Add direct messaging and media columns to internal_messages
--
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT
-- EXISTS are MariaDB-only; MySQL 8 rejects both with a syntax error.
-- The information_schema guards run on both engines and keep the file
-- re-runnable, which is the property the IF NOT EXISTS was there to
-- provide.
DROP PROCEDURE IF EXISTS add_internal_messages_media_columns;

DELIMITER $$
CREATE PROCEDURE add_internal_messages_media_columns()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'recipient_id'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN recipient_id CHAR(36) NULL AFTER sender_role;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'is_direct'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN is_direct BOOLEAN NOT NULL DEFAULT FALSE AFTER recipient_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'is_read'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE AFTER is_direct;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'media_url'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN media_url VARCHAR(1000) NULL AFTER content;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'media_type'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN media_type VARCHAR(100) NULL AFTER media_url;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'media_name'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN media_name VARCHAR(255) NULL AFTER media_type;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND COLUMN_NAME  = 'media_size'
    ) THEN
        ALTER TABLE internal_messages
            ADD COLUMN media_size INT UNSIGNED NULL AFTER media_name;
    END IF;
END$$
DELIMITER ;

CALL add_internal_messages_media_columns();
DROP PROCEDURE IF EXISTS add_internal_messages_media_columns;

-- 3. Performance indexes for fast direct conversation lookup and unread counts
DROP PROCEDURE IF EXISTS add_internal_messages_media_indexes;

DELIMITER $$
CREATE PROCEDURE add_internal_messages_media_indexes()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND INDEX_NAME   = 'idx_msg_direct'
    ) THEN
        CREATE INDEX idx_msg_direct ON internal_messages (is_direct, recipient_id, sender_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND INDEX_NAME   = 'idx_msg_recipient'
    ) THEN
        CREATE INDEX idx_msg_recipient ON internal_messages (recipient_id, is_read);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'internal_messages'
          AND INDEX_NAME   = 'idx_msg_sender_recipient'
    ) THEN
        CREATE INDEX idx_msg_sender_recipient ON internal_messages (sender_id, recipient_id, created_at);
    END IF;
END$$
DELIMITER ;

-- 4. Record migration in log
INSERT IGNORE INTO migrations_log (filename) VALUES ('063_direct_messages_and_media.sql');
