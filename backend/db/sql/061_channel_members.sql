-- ===================================================================
-- 061_channel_members.sql
-- Asella Organic — Internal Channel Membership & Access Control
--
-- Restricts channel viewing and posting so employees only see channels
-- to which an administrator or manager has explicitly granted them access.
-- ===================================================================

CREATE TABLE IF NOT EXISTS internal_channel_members (
    channel    VARCHAR(50)  NOT NULL,
    user_id    CHAR(36)     NOT NULL,
    added_by   CHAR(36)     NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel, user_id),
    INDEX idx_channel_member_user (user_id),
    INDEX idx_channel_member_channel (channel)
);

-- Seed all existing active staff into #general (All-Staff Team) by default so team members have a default workspace
INSERT IGNORE INTO internal_channel_members (channel, user_id, added_by, created_at)
SELECT 'general', id, NULL, CURRENT_TIMESTAMP
FROM staff_users
WHERE active = 1 AND deleted_at IS NULL;
