-- ============================================================
-- 023_telegram_miniapp_state_notifications.sql
-- Telegram Mini App: per-customer persisted state, order notifications,
-- and a verified chat_id on orders so customer data no longer depends
-- on the phone number matching.
-- ============================================================

-- ── 1. Persisted Mini App state (cart + preferences) ───────────
-- Keyed by Telegram chat id so a customer's basket and preferences
-- follow them across devices instead of living in one browser.
CREATE TABLE IF NOT EXISTS telegram_user_state (
    chat_id       BIGINT       PRIMARY KEY,
    cart          JSON         NULL,
    preferences   JSON         NULL,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── 2. Customer-scoped notifications ───────────────────────────
-- The existing /api/notifications feed is a staff-only aggregate over
-- stock data. Customers get their own table so order status changes can
-- reach them without exposing internal records.
CREATE TABLE IF NOT EXISTS customer_notifications (
    id            CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    chat_id       BIGINT        NOT NULL,
    order_id      VARCHAR(50)   NULL,
    type          VARCHAR(40)   NOT NULL DEFAULT 'order_update',
    title         VARCHAR(160)  NOT NULL,
    body          TEXT          NULL,
    read_at       DATETIME      NULL,
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cust_notif_chat_created (chat_id, created_at),
    INDEX idx_cust_notif_unread (chat_id, read_at)
);

-- ── 3. Verified Telegram chat id on the order itself ──────────
-- Orders previously joined to customers by phone only, so a customer who
-- typed a different number than the one staff read off the order silently
-- saw an empty Orders tab. Storing the HMAC-verified chat id on the order
-- makes the lookup authoritative.
ALTER TABLE orders
  ADD COLUMN telegram_chat_id BIGINT NULL,
  ADD INDEX idx_orders_telegram_chat (telegram_chat_id);

-- ── 4. Backfill chat ids for historical orders ────────────────
-- Anything ordered through the Mini App already had its chat id written
-- onto the customers row; copy it across so existing history appears.
UPDATE orders o
  JOIN customers c ON c.phone = o.phone
SET o.telegram_chat_id = c.telegram_chat_id
WHERE o.telegram_chat_id IS NULL
  AND c.telegram_chat_id IS NOT NULL
  AND o.source = 'telegram';