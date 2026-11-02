-- ===================================================================
-- 057_update_staff_roles.sql
-- Asella Organic -- Update staff roles:
--  1. kalkidan mosisa -> delivery (driver)
--  2. Red             -> store_manager (substore person)
--  3. Messay Nebo     -> manager (operations manager)
-- ===================================================================

UPDATE staff_users
SET role = 'delivery', updated_at = NOW()
WHERE id = '3de58632-19da-4ca0-9576-7306783905d4' OR username = 'kalkidan';

UPDATE staff_users
SET role = 'store_manager', updated_at = NOW()
WHERE id = 'a0000003-0000-0000-0000-000000000003' OR username = 'red.staff';

UPDATE staff_users
SET role = 'manager', updated_at = NOW()
WHERE id = 'a0000008-0000-0000-0000-000000000008' OR username = 'mesay.manager';

INSERT IGNORE INTO migrations_log (filename) VALUES ('057_update_staff_roles.sql');

SELECT '057_update_staff_roles.sql applied successfully' AS result;
