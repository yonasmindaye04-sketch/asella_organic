-- ═══════════════════════════════════════════════════════════════════
-- 001_complete_schema.sql
-- Asella Organic — Core Schema (MySQL / MariaDB)
-- Tables: staff_users, customers, orders, order_items, products,
--         inventory_movements, payments, delivery_assignments,
--         audit_log, telegram_users, vendor_orders,
--         pending_vendor_messages, stock_requests, migrations_log
-- ═══════════════════════════════════════════════════════════════════

-- ── Staff Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_users (
    id            CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    username      VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          ENUM('admin','manager','employee','affiliate','delivery','vendor') NOT NULL,
    email         VARCHAR(255) UNIQUE,
    phone         VARCHAR(50),
    active        BOOLEAN      DEFAULT TRUE,
    deleted_at    DATETIME     NULL,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_username ON staff_users(username);
CREATE INDEX IF NOT EXISTS idx_staff_role     ON staff_users(role);

-- ── Session Blocklist (JWT revocation) ──────────────────────────
CREATE TABLE IF NOT EXISTS session_blocklist (
    jti        VARCHAR(255) PRIMARY KEY,
    revoked_at DATETIME     DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at DATETIME     NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_blocklist_expires ON session_blocklist(expires_at);

-- ── Rate Limit Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    ip          VARCHAR(45)  NOT NULL,
    endpoint    VARCHAR(255) NOT NULL,
    occurred_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_log(ip, occurred_at);

-- ── Commission Config ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_configs (
    id               CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    commission_type  ENUM('percentage','fixed') NOT NULL,
    commission_value DECIMAL(12,2) NOT NULL CHECK (commission_value >= 0),
    min_order_amount DECIMAL(12,2) DEFAULT 0,
    max_commission   DECIMAL(12,2) NULL,
    is_active        BOOLEAN       DEFAULT TRUE,
    created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Affiliate Profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_profiles (
    id              CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    user_id         CHAR(36)      NULL,
    referral_code   VARCHAR(20)   UNIQUE NOT NULL,
    full_name       VARCHAR(255)  NULL,
    email           VARCHAR(255)  NULL,
    phone           VARCHAR(50)   NULL,
    is_active       BOOLEAN       DEFAULT TRUE,
    total_referrals INT           DEFAULT 0,
    total_earnings  DECIMAL(12,2) DEFAULT 0,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_affiliate_code ON affiliate_profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_user ON affiliate_profiles(user_id);

-- ── Customers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id                        CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    phone                     VARCHAR(50)   UNIQUE NOT NULL,
    name                      VARCHAR(255)  NOT NULL,
    email                     VARCHAR(255)  NULL,
    city                      VARCHAR(255)  DEFAULT '',
    location                  VARCHAR(255)  DEFAULT '',
    gender                    VARCHAR(50)   NULL,
    age_group                 VARCHAR(50)   NULL,
    referral_code             VARCHAR(50)   NULL,
    referral_code_used        VARCHAR(50)   NULL,
    referred_by_affiliate_id  CHAR(36)      NULL,
    referred_at               DATETIME      NULL,
    telegram_chat_id          BIGINT        NULL,
    total_orders              INT           DEFAULT 0,
    total_spent               DECIMAL(12,2) DEFAULT 0,
    deleted_at                DATETIME      NULL,
    created_at                DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at                DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (referred_by_affiliate_id) REFERENCES affiliate_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_phone     ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customer_affiliate ON customers(referred_by_affiliate_id);

-- ── Products ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id                  CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    name                VARCHAR(255)  NOT NULL,
    package_size        VARCHAR(100)  NOT NULL,
    price               DECIMAL(12,2) NOT NULL CHECK (price >= 0),
    description         TEXT          NULL,
    image_url           TEXT          NULL,
    featured            BOOLEAN       DEFAULT TRUE,
    tag                 VARCHAR(100)  DEFAULT '',
    inventory_quantity  INT           NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0),
    low_stock_threshold INT           NOT NULL DEFAULT 10,
    active              BOOLEAN       DEFAULT TRUE,
    deleted_at          DATETIME      NULL,
    created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_name   ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

-- ── Inventory Movements ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
    id             CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    product_id     CHAR(36)     NOT NULL,
    movement_type  ENUM('sale','purchase_received','adjustment','return','damage_loss','initial_stock')
                               NOT NULL DEFAULT 'adjustment',
    change_amount  INT          NOT NULL,
    reason         VARCHAR(255) NOT NULL,
    performed_by   CHAR(36)     NULL,
    quantity_after INT          NOT NULL,
    notes          TEXT         NULL,
    reference_id   VARCHAR(255) NULL,
    reference_type ENUM('order','vendor_order','stock_request','manual') NULL,
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id)   REFERENCES products(id)     ON DELETE RESTRICT,
    FOREIGN KEY (performed_by) REFERENCES staff_users(id)  ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_movements_product   ON inventory_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inv_movements_reference ON inventory_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_type      ON inventory_movements(movement_type, created_at);

-- ── Orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id                  VARCHAR(50)   PRIMARY KEY,
    source              VARCHAR(100)  NOT NULL,
    customer_name       VARCHAR(255)  NOT NULL,
    phone               VARCHAR(50)   NOT NULL,
    location            VARCHAR(255)  DEFAULT '',
    city                VARCHAR(100)  DEFAULT '',
    gender              VARCHAR(50)   NULL,
    age_group           VARCHAR(50)   NULL,
    order_type          VARCHAR(100)  DEFAULT 'Online',
    franchise_type      VARCHAR(100)  NULL,
    status              VARCHAR(50)   DEFAULT 'Pending',
    payment_status      VARCHAR(50)   DEFAULT 'Pending',
    total               DECIMAL(12,2) NOT NULL CHECK (total >= 0),
    notes               TEXT          NULL,
    customer_id         CHAR(36)      NULL,
    assigned_to         VARCHAR(100)  NULL,
    delivery_date       VARCHAR(100)  NULL,
    delivery_message_id BIGINT        NULL,
    deleted_at          DATETIME      NULL,
    created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone          ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer       ON orders(customer_id);

-- ── Order Items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id           CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    order_id     VARCHAR(50)   NOT NULL,
    product_id   CHAR(36)      NULL,
    item_name    VARCHAR(255)  NOT NULL,
    package_size VARCHAR(100)  DEFAULT '',
    quantity     INT           NOT NULL CHECK (quantity > 0),
    unit_price   DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ── Payments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    order_id       VARCHAR(50)   NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(100)  NOT NULL,
    transaction_id VARCHAR(255)  NULL,
    status         VARCHAR(50)   DEFAULT 'pending',
    paid_at        DATETIME      NULL,
    recorded_by    CHAR(36)      NULL,
    notes          TEXT          NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)    REFERENCES orders(id)      ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES staff_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order  ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ── Order Status History ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
    id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    order_id   VARCHAR(50)  NOT NULL,
    old_status VARCHAR(50)  NULL,
    new_status VARCHAR(50)  NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    note       TEXT         NULL,
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id, created_at);

-- ── Delivery Assignments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_assignments (
    order_id            VARCHAR(50)  PRIMARY KEY,
    telegram_message_id BIGINT       NULL,
    driver_username     VARCHAR(255) NULL,
    claimed_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    delivered_at        DATETIME     NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ── Audit Log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    table_name VARCHAR(100) NULL,
    record_id  VARCHAR(100) NULL,
    order_id   VARCHAR(50)  NULL,
    actor      VARCHAR(100) NOT NULL,
    action     VARCHAR(50)  NOT NULL,
    old_values JSON         NULL,
    new_values JSON         NULL,
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);

-- ── Telegram Users ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_users (
    chat_id       BIGINT       PRIMARY KEY,
    username      VARCHAR(255) NULL,
    first_name    VARCHAR(255) NULL,
    last_name     VARCHAR(255) NULL,
    role          ENUM('manager','sales','vendor') NULL,
    registered_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    last_seen     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Vendor Orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_orders (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    product_id     CHAR(36)      NULL,
    order_id       VARCHAR(50)   NOT NULL,
    vendor_name    VARCHAR(255)  NOT NULL,
    vendor_chat_id VARCHAR(100)  NULL,
    item           VARCHAR(255)  NOT NULL,
    amount         VARCHAR(100)  NOT NULL,
    price          DECIMAL(12,2) NOT NULL,
    delivery_date  DATE          NULL,
    status         ENUM('pending','confirmed','declined','completed') DEFAULT 'pending',
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ── Pending Vendor Messages ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_vendor_messages (
    id             CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    vendor_chat_id VARCHAR(100) NOT NULL,
    vendor_name    VARCHAR(255) NOT NULL,
    order_id       VARCHAR(50)  NOT NULL,
    message        TEXT         NOT NULL,
    delivered      BOOLEAN      DEFAULT FALSE,
    delivered_at   DATETIME     NULL,
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vendor_order UNIQUE (vendor_chat_id, order_id)
);

-- ── Stock Requests ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_requests (
    id                   CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    product_id           CHAR(36)     NULL,
    item                 VARCHAR(255) NOT NULL,
    package_size         VARCHAR(100) NULL,
    stock_available      INT          DEFAULT 0,
    qty_needed           INT          NOT NULL,
    delivery_date        DATE         NULL,
    requested_by         VARCHAR(255) NULL,
    requested_by_user_id CHAR(36)     NULL,
    status               ENUM('pending','ordered','received','cancelled') DEFAULT 'pending',
    notes                TEXT         NULL,
    created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id)           REFERENCES products(id)    ON DELETE SET NULL,
    FOREIGN KEY (requested_by_user_id) REFERENCES staff_users(id) ON DELETE SET NULL
);

-- ── Stock Snapshots ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_snapshots (
    product_id       CHAR(36) PRIMARY KEY,
    current_quantity INT      NOT NULL DEFAULT 0,
    last_updated     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- ── Refresh Tokens ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         CHAR(36)     PRIMARY KEY,
    user_id    CHAR(36)     NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME     NOT NULL,
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ── Webhook Events (Telegram replay protection) ──────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
    update_id    BIGINT   PRIMARY KEY,
    processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

-- ── Migrations Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migrations_log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    filename   VARCHAR(255) UNIQUE NOT NULL,
    run_at     DATETIME     DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO migrations_log (filename) VALUES ('001_complete_schema.sql');