/**
db/migrations/001_init_schema.js
Asella Organic — Core Schema (MySQL v2.0)
*/
const sql = `
-- ── Staff Users (Soft Delete Enabled) ───────────────────────────────
CREATE TABLE IF NOT EXISTS staff_users (
    id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    username      VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          ENUM('admin','manager','employee','affiliate','delivery','vendor') NOT NULL,
    email         VARCHAR(255) UNIQUE,
    phone         VARCHAR(50),
    active        BOOLEAN DEFAULT TRUE,
    deleted_at    DATETIME NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Customers (Soft Delete Enabled) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id                        CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    phone                     VARCHAR(50) UNIQUE NOT NULL,
    name                      VARCHAR(255) NOT NULL,
    email                     VARCHAR(255),
    city                      VARCHAR(255) DEFAULT '',
    location                  VARCHAR(255) DEFAULT '',
    gender                    VARCHAR(50),
    age_group                 VARCHAR(50),
    referral_code             VARCHAR(50),
    telegram_chat_id          BIGINT,
    referred_by_affiliate_id  CHAR(36) NULL,
    total_orders              INT DEFAULT 0,
    total_spent               DECIMAL(12,2) DEFAULT 0,
    deleted_at                DATETIME NULL,
    created_at                DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at                DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (referred_by_affiliate_id) REFERENCES staff_users(id) ON DELETE SET NULL
);

-- ── Orders (Soft Delete Enabled) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id              VARCHAR(50) PRIMARY KEY,
    source          VARCHAR(100) NOT NULL,
    customer_name   VARCHAR(255) NOT NULL,
    phone           VARCHAR(50) NOT NULL,
    location        VARCHAR(255) DEFAULT '',
    city            VARCHAR(100) DEFAULT '',
    gender          VARCHAR(50),
    age_group       VARCHAR(50),
    order_type      VARCHAR(100) DEFAULT 'Online',
    franchise_type  VARCHAR(100),
    status          VARCHAR(50) DEFAULT 'Pending',
    payment_status  VARCHAR(50) DEFAULT 'Pending',
    total           DECIMAL(12,2) NOT NULL CHECK (total >= 0),
    notes           TEXT,
    customer_id     CHAR(36) NULL,
    assigned_to     VARCHAR(100),
    delivery_date   VARCHAR(100),
    deleted_at      DATETIME NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- ── Order Items ───────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id           CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    order_id     VARCHAR(50) NOT NULL,
    product_id   CHAR(36) NULL,
    item_name    VARCHAR(255) NOT NULL,
    package_size VARCHAR(100) DEFAULT '',
    quantity     INT NOT NULL CHECK (quantity > 0),
    unit_price   DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ── Products (Soft Delete Enabled) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id                  CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name                VARCHAR(255) NOT NULL,
    package_size        VARCHAR(100) NOT NULL,
    price               DECIMAL(12,2) NOT NULL CHECK (price >= 0),
    description         TEXT,
    image_url           TEXT,
    featured            BOOLEAN DEFAULT TRUE,
    tag                 VARCHAR(100) DEFAULT '',
    inventory_quantity  INT NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 10,
    active              BOOLEAN DEFAULT TRUE,
    deleted_at          DATETIME NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_products_name ON products(name);

-- ── Inventory Movements ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
    id             CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    product_id     CHAR(36) NOT NULL,
    change_amount  INT NOT NULL,
    reason         VARCHAR(255) NOT NULL,
    performed_by   CHAR(36),
    quantity_after INT NOT NULL,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (performed_by) REFERENCES staff_users(id)
);
CREATE INDEX idx_inv_movements_product ON inventory_movements(product_id, created_at);

-- ── Payments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id             CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    order_id       VARCHAR(50) UNIQUE NOT NULL,
    gateway        VARCHAR(100) NOT NULL,
    transaction_id VARCHAR(255),
    amount         DECIMAL(12,2) NOT NULL,
    currency       VARCHAR(10) DEFAULT 'ETB',
    status         VARCHAR(50) NOT NULL,
    paid_at        DATETIME NULL,
    metadata       JSON,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ── Delivery Assignments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_assignments (
    order_id           VARCHAR(50) PRIMARY KEY,
    telegram_message_id BIGINT,
    driver_username    VARCHAR(255) NOT NULL,
    claimed_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at       DATETIME NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ── Audit Log (JSON Structure) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    table_name  VARCHAR(100),
    record_id   VARCHAR(100),
    order_id    VARCHAR(50),
    actor       VARCHAR(100) NOT NULL,
    action      VARCHAR(50) NOT NULL,
    old_values  JSON,
    new_values  JSON,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_order ON audit_log(order_id);
CREATE INDEX idx_audit_actor ON audit_log(actor);

-- ── Telegram Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_users (
    chat_id       BIGINT PRIMARY KEY,
    username      VARCHAR(255),
    first_name    VARCHAR(255),
    last_name     VARCHAR(255),
    role          ENUM('manager','sales','vendor'),
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Vendor & Stock Tables ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_orders (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  order_id VARCHAR(50) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_chat_id VARCHAR(100),
  item VARCHAR(255) NOT NULL,
  amount VARCHAR(100) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  delivery_date DATE,
  status ENUM('pending', 'confirmed', 'declined', 'completed') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_vendor_messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  vendor_chat_id VARCHAR(100) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  order_id VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,
  delivered_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_vendor_order UNIQUE (vendor_chat_id, order_id)
);

CREATE TABLE IF NOT EXISTS stock_requests (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  item VARCHAR(255) NOT NULL,
  package_size VARCHAR(100),
  stock_available INT DEFAULT 0,
  qty_needed INT NOT NULL,
  delivery_date DATE,
  requested_by VARCHAR(255),
  requested_by_user_id CHAR(36),
  status ENUM('pending', 'ordered', 'received', 'cancelled') DEFAULT 'pending',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requested_by_user_id) REFERENCES staff_users(id) ON DELETE SET NULL
);

-- ── Migrations Tracker ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migrations_log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    filename   VARCHAR(255) UNIQUE NOT NULL,
    run_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

module.exports = { sql };