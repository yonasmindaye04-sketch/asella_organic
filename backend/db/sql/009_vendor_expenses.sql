-- ═══════════════════════════════════════════════════════════════════
-- 009_vendor_expenses.sql
-- Asella Organic — Vendor Order Status Flow + Expenses Table
--
-- 1. Alter vendor_orders.status enum: pending → approved → received → cancelled
-- 2. Migrate existing data
-- 3. Add received_by and received_at columns to vendor_orders
-- 4. Create expenses table
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Alter vendor_orders status enum ──────────────────────────
ALTER TABLE vendor_orders
  MODIFY COLUMN status ENUM('pending','confirmed','declined','completed','approved','received','cancelled')
  DEFAULT 'pending';

-- ── 2. Migrate existing statuses ────────────────────────────────
UPDATE vendor_orders SET status = 'approved'  WHERE status = 'confirmed';
UPDATE vendor_orders SET status = 'cancelled' WHERE status = 'declined';
UPDATE vendor_orders SET status = 'received'  WHERE status = 'completed';

-- ── 3. Now shrink the enum to only the new values ───────────────
ALTER TABLE vendor_orders
  MODIFY COLUMN status ENUM('pending','approved','received','cancelled')
  DEFAULT 'pending';

-- ── 4. Add received tracking columns ────────────────────────────
ALTER TABLE vendor_orders
  ADD COLUMN received_by CHAR(36) NULL AFTER status,
  ADD COLUMN received_at DATETIME NULL AFTER received_by;

ALTER TABLE vendor_orders
  ADD CONSTRAINT fk_vendor_orders_received_by
  FOREIGN KEY (received_by) REFERENCES staff_users(id) ON DELETE SET NULL;

-- ── 5. Create expenses table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id              CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    category        ENUM('vendor_purchase','operational','salary','other') NOT NULL DEFAULT 'vendor_purchase',
    description     VARCHAR(500)  NOT NULL,
    amount          DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
    vendor_order_id CHAR(36)      NULL,
    recorded_by     CHAR(36)      NULL,
    notes           TEXT          NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by)     REFERENCES staff_users(id)   ON DELETE SET NULL
);
CREATE INDEX idx_expenses_category   ON expenses(category);
CREATE INDEX idx_expenses_vendor     ON expenses(vendor_order_id);
CREATE INDEX idx_expenses_created    ON expenses(created_at);

-- ── 6. Record migration ────────────────────────────────────────
INSERT IGNORE INTO migrations_log (filename) VALUES ('009_vendor_expenses.sql');
