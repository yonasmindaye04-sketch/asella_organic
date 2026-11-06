-- ===================================================================
-- 062_internal_channels.sql
-- Asella Organic — Dynamic Internal Messaging Channels
--
-- Allows administrators and managers to create custom channels,
-- configure descriptions and icons, and manage member assignments.
-- ===================================================================

CREATE TABLE IF NOT EXISTS internal_channels (
    id              VARCHAR(50)  PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT         NULL,
    icon            VARCHAR(50)  NOT NULL DEFAULT 'forum',
    admin_only_post BOOLEAN      NOT NULL DEFAULT FALSE,
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by      CHAR(36)     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_channel_created (created_at)
);

-- Seed default workplace channels
INSERT IGNORE INTO internal_channels (id, name, description, icon, admin_only_post, is_default, created_by, created_at)
VALUES
('deliveries', 'Delivery & Dispatch', 'Dispatch coordination, priority route notes, customer address updates, and driver reports.', 'local_shipping', 0, 1, NULL, NOW()),
('announcements', 'Company Announcements', 'Official workplace broadcasts and management alerts across all branches.', 'campaign', 0, 1, NULL, NOW()),
('general', 'All-Staff Team', 'Company-wide general communication, daily shift notes, and employee collaboration.', 'forum', 0, 1, NULL, NOW()),
('call_center', 'Call Center Desk', 'Order modifications, customer inquiries, and phone order handovers.', 'headset_mic', 0, 1, NULL, NOW()),
('operations', 'Store & Inventory', 'Substore fulfillment, restock coordination, and counter inventory queries.', 'inventory_2', 0, 1, NULL, NOW()),
('tech_support', 'Tech Support Desk', 'Technical assistance, bug reports, and system permissions help.', 'terminal', 0, 1, NULL, NOW());
