-- ===================================================================
-- 059_tech_support_and_messages.sql
-- Asella Organic -- Tech Support Account & Internal Messaging Channel
--
-- 1. Create internal_messages table for internal staff communication
--    (Admins, Delivery, Call Center, Store Managers, Employees, Tech Support)
-- 2. Seed or update tech support account with unlimited permissions
-- ===================================================================

-- 1. Create internal_messages table
CREATE TABLE IF NOT EXISTS internal_messages (
    id              CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    channel         VARCHAR(50)  NOT NULL DEFAULT 'general',
    sender_id       CHAR(36)     NOT NULL,
    sender_name     VARCHAR(255) NOT NULL,
    sender_role     VARCHAR(50)  NOT NULL,
    content         TEXT         NOT NULL,
    priority        VARCHAR(20)  NOT NULL DEFAULT 'normal',
    is_announcement BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_msg_channel (channel, created_at),
    INDEX idx_msg_sender  (sender_id),
    INDEX idx_msg_created (created_at)
);

-- 2. Seed/ensure tech_support user in staff_users
INSERT INTO staff_users (
    id,
    username,
    password_hash,
    full_name,
    role,
    email,
    phone,
    active,
    telegram_username,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000077',
    'techsupport',
    '$2b$10$e430xHsgF4t0qht8LkFt1.g5NL0pHEqmlBmVgJxyBomD7hCUgUCIa',
    'Tech Support Engineer',
    'tech_support',
    'support@asellaorganic.com',
    '+251900000999',
    1,
    'asella_support',
    NOW(),
    NOW()
)
ON DUPLICATE KEY UPDATE
    role = 'tech_support',
    active = 1,
    password_hash = '$2b$10$e430xHsgF4t0qht8LkFt1.g5NL0pHEqmlBmVgJxyBomD7hCUgUCIa',
    updated_at = NOW();

-- 3. Also allow 'tech_support' username synonym
INSERT INTO staff_users (
    id,
    username,
    password_hash,
    full_name,
    role,
    email,
    phone,
    active,
    telegram_username,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000078',
    'tech_support',
    '$2b$10$e430xHsgF4t0qht8LkFt1.g5NL0pHEqmlBmVgJxyBomD7hCUgUCIa',
    'Tech Support Admin',
    'tech_support',
    'tech@asellaorganic.com',
    '+251900000998',
    1,
    'asella_tech',
    NOW(),
    NOW()
)
ON DUPLICATE KEY UPDATE
    role = 'tech_support',
    active = 1,
    password_hash = '$2b$10$e430xHsgF4t0qht8LkFt1.g5NL0pHEqmlBmVgJxyBomD7hCUgUCIa',
    updated_at = NOW();

-- Initial welcoming message in deliveries channel
INSERT IGNORE INTO internal_messages (
    id,
    channel,
    sender_id,
    sender_name,
    sender_role,
    content,
    priority,
    is_announcement,
    created_at
) VALUES (
    'm0000000-0000-0000-0000-000000000001',
    'deliveries',
    '00000000-0000-0000-0000-000000000077',
    'Tech Support Engineer',
    'tech_support',
    'Welcome to the Delivery & Dispatch Channel. Admins and dispatch coordinators will post priority delivery routes, address confirmations, and dispatch updates here.',
    'announcement',
    TRUE,
    NOW()
);

INSERT IGNORE INTO migrations_log (filename) VALUES ('059_tech_support_and_messages.sql');
