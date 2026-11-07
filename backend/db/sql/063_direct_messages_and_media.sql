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
ALTER TABLE internal_messages
    ADD COLUMN IF NOT EXISTS recipient_id CHAR(36) NULL AFTER sender_role,
    ADD COLUMN IF NOT EXISTS is_direct BOOLEAN NOT NULL DEFAULT FALSE AFTER recipient_id,
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE AFTER is_direct,
    ADD COLUMN IF NOT EXISTS media_url VARCHAR(1000) NULL AFTER content,
    ADD COLUMN IF NOT EXISTS media_type VARCHAR(100) NULL AFTER media_url,
    ADD COLUMN IF NOT EXISTS media_name VARCHAR(255) NULL AFTER media_type,
    ADD COLUMN IF NOT EXISTS media_size INT UNSIGNED NULL AFTER media_name;

-- 3. Performance indexes for fast direct conversation lookup and unread counts
CREATE INDEX IF NOT EXISTS idx_msg_direct ON internal_messages (is_direct, recipient_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_msg_recipient ON internal_messages (recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_msg_sender_recipient ON internal_messages (sender_id, recipient_id, created_at);

-- 4. Record migration in log
INSERT IGNORE INTO migrations_log (filename) VALUES ('063_direct_messages_and_media.sql');
