-- 013: Add telegram fields to staff_users for Telegram RBAC
ALTER TABLE staff_users
  ADD COLUMN telegram_username VARCHAR(255) NULL AFTER phone,
  ADD COLUMN telegram_chat_id  BIGINT    NULL AFTER telegram_username;

CREATE INDEX idx_staff_tg_username ON staff_users(telegram_username);
CREATE INDEX idx_staff_tg_chat_id  ON staff_users(telegram_chat_id);
