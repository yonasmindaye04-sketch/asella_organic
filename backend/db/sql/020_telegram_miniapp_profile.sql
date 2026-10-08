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
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS phone         VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS city          VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS location      VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS profile_updated_at DATETIME NULL;

-- Customer orders are resolved by joining orders.phone to customers.phone
-- for the row carrying the caller's telegram_chat_id.
CREATE INDEX IF NOT EXISTS idx_customers_telegram_chat ON customers(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone            ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status_created   ON orders(status, created_at);