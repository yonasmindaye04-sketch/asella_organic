-- 015: Expand telegram_users role enum & sync roles from staff_users

-- Step 1: Expand the ENUM to include missing roles
ALTER TABLE telegram_users
  MODIFY COLUMN role ENUM('manager','sales','vendor','admin','employee','delivery','affiliate','driver') NULL;

-- Step 2: Sync roles from staff_users where telegram_username matches
UPDATE telegram_users tu
  JOIN staff_users su ON su.telegram_username = tu.username
SET tu.role = su.role
WHERE su.role IS NOT NULL;

-- Step 3: Also sync by chat_id for users already linked
UPDATE telegram_users tu
  JOIN staff_users su ON su.telegram_chat_id = tu.chat_id
SET tu.role = su.role
WHERE su.role IS NOT NULL AND tu.role IS NULL;
