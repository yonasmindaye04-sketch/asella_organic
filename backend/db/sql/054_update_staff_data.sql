-- ===================================================================
-- 054_update_staff_data.sql
-- Asella Organic -- update staff_users table with correct data
-- ===================================================================
-- This migration updates the staff_users table with the correct staff data.
-- Uses INSERT ... ON DUPLICATE KEY UPDATE to upsert by primary key (id).
-- ===================================================================

DROP PROCEDURE IF EXISTS update_staff_data;
DELIMITER //
CREATE PROCEDURE update_staff_data()
BEGIN
  -- Teddy
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('12555644-1935-4c5d-94cf-7b6d87a04533', 'Teddy', 'aff_asl1e9b07', 'affiliate', 'asellamoringa@gmail.com', '936238564', 1, NULL, NULL, '2026-10-14 09:27:43', '2026-10-14 09:27:43', 1, 0, '$2b$10$MZASvdwpeFH8Y07Xk8XYX.2UjbQBSajXIqbKTU4eywFOy4Zbdg0yW', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- yonas mindaye dagne
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('3659fa6b-f782-4484-801c-7df2df1fa419', 'yonas mindaye dagne', 'aff_asl2b1318', 'affiliate', 'manati0101@gmail.com', '910011818', 1, NULL, NULL, '2026-10-14 19:16:08', '2026-10-14 19:18:24', 0, 0, '$2b$10$R9mjRBebsZdBzlZm6QTrIO0QEWBoZadmKCFWwsJ.MDwmZYUulOc0S', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Edlawit Teklu
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('3b1085ff-ca6b-4965-8b9b-367c63fcc063', 'Edlawit Teklu', 'edlawit', 'employee', 'edlawit@asellaorganic.com', NULL, 0, 'edl_84', NULL, '2026-07-29 08:43:26', '2026-10-28 15:38:25', 0, 0, '$2b$12$4t69IrK7m.5VbsUYiwHyGupRR0xBB..gY96KCUFoiyoCWmvZvSAGu', '2026-10-28 15:38:25', NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- kalkidan mosisa
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('3de58632-19da-4ca0-9576-7306783905d4', 'kalkidan mosisa', 'kalkidan', 'delivery', 'kalkidan@asellaorganic.com', NULL, 1, 'kalu_lu', '6145130083', '2026-07-20 12:38:18', '2026-08-12 14:58:56', 0, 0, '$2b$12$cylCGXTT0n90BGuq8RRuv.vOkXCVMcldMcutO.zixLiIJrg9OnI06', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Nahom Eshetu
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('3df39a68-5f53-49f7-8f2d-8cf06fb7fc9d', 'Nahom Eshetu', 'nahom.asella', 'admin', 'nahom@asella.com', NULL, 1, 'Aga_na', NULL, '2026-06-30 19:03:59', '2026-07-16 12:05:04', 0, 1, '$2b$12$.boZpjSYWACXo6A6PfaNV.IiSPZL6JAftfxv1gCG40NQABikLZEPa', NULL, 'FK3B5AYXVZOGNEP4JYG5HVUAVZHSHME4', NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Yonas Mindaye
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('5d4a66a6-91d7-4cd6-9df6-3eb395121da8', 'Yonas Mindaye', 'yonas@asella', 'admin', 'yonas@asella.com', NULL, 1, 'yona64', NULL, '2026-07-16 12:05:54', '2026-07-16 12:14:35', 0, 0, '$2b$12$g0r7InDQBajimImaMofzgeKnxVOWDnab0WTpP5MddBE6OnxIEC8cO', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- alemu
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('9f807b88-8cc6-47ca-8808-5ce051bcf75d', 'alemu', 'aff_asl7d2e4c', 'affiliate', 'emushu70@gmail.com', '995641320', 1, NULL, NULL, '2026-10-14 09:23:52', '2026-10-14 09:24:59', 0, 0, '$2b$10$MCc3RMXsIeeOmeRxWyfnqeBJRlujVeUu7zeBGaqRQTQ6BivWLMMqG', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Hana Abebe
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000002-0000-0000-0000-000000000002', 'Hana Abebe', 'hanna.staff', 'employee', 'hana@asellaorganic.com', NULL, 1, NULL, NULL, '2026-06-29 13:31:13', '2026-07-01 16:35:07', 0, 0, '$2b$12$3nRQ.ecy0Ojuzj7eWWHtxeZIS6amA1qJWT9jaBj.cohJNiFaKq1GW', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Red
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000003-0000-0000-0000-000000000003', 'Red', 'red.staff', 'store_manager', 'red@asellaorganic.com', NULL, 1, NULL, NULL, '2026-06-29 13:31:13', '2026-07-04 10:35:41', 0, 0, '$2b$12$9I//Z7rdwdXB5cgOIv/J7uRnnlHSP25eglNcllhCGjWuAIz6Kbj6y', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Kalkidan (inactive)
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000004-0000-0000-0000-000000000004', 'Kalkidan', 'kallkidan.staff', 'employee', 'kallkidan@asellaorganic.com', NULL, 0, NULL, NULL, '2026-06-29 13:31:13', '2026-07-01 16:19:41', 0, 0, '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', '2026-07-01 16:19:41', NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Twedros
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000005-0000-0000-0000-000000000005', 'Twedros', 'twedros.delivery', 'delivery', 'twedros@asellaorganic.com', NULL, 1, NULL, NULL, '2026-06-29 13:31:13', '2026-07-02 08:21:10', 0, 0, '$2b$12$wg8SVfW4NNFrrM4Toj52Z.CUX62uIGimUyGakQ6tDZx2p6ftdD8fm', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Beza
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000006-0000-0000-0000-000000000006', 'Beza', 'beza.staff', 'employee', 'beza@asellaorganic.com', NULL, 1, NULL, NULL, '2026-06-29 13:31:13', '2026-07-01 18:29:18', 0, 0, '$2b$12$e3nHKa6WnTm2tC/XARwDgOnrBuTyErIq.X40iOrLXvfHrgQVbeCgC', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Mednit
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000007-0001-1111-1111-111111111117', 'Mednit', 'medanit.staff', 'employee', 'medanit@asellaorganic.com', NULL, 1, NULL, NULL, '2026-06-29 13:31:13', '2026-06-29 13:31:13', 0, 0, '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Messay Nebo
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000008-0000-0000-0000-000000000008', 'Messay Nebo', 'mesay.manager', 'manager', 'mesay@asellaorganic.com', NULL, 1, NULL, '336797279', '2026-06-29 13:31:13', '2026-08-01 13:19:49', 0, 0, '$2b$12$MqIPDCBwyDRP1rXDEjnGGOaTtCe0wLMkQdygATjwQaKY.uKDARi0G', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Nahom eshetu (inactive)
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000009-0000-0000-0000-000000000009', 'Nahom eshetu', 'nahom.manager', 'admin', 'nahom@asellaorganic.com', NULL, 0, NULL, NULL, '2026-06-29 13:31:13', '2026-06-30 19:03:09', 0, 1, '$2b$12$jDQUxQzY0d6LAv.PJgvAFeFFOzvq/VmKHkotFHlLW5EigBGnAz5Yi', '2026-06-30 19:03:09', NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Etalem Benga
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000010-0000-0000-0000-000000000010', 'Etalem Benga', 'etalem.staff', 'employee', 'etalem@asellaorganic.com', NULL, 1, NULL, NULL, '2026-06-29 13:31:13', '2026-06-29 13:31:13', 0, 0, '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Yonas mindaye (inactive)
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000011-0000-0000-0000-000000000011', 'Yonas mindaye', 'yonas.admin', 'admin', 'yonas@asellaorganic.com', NULL, 0, NULL, NULL, '2026-06-29 13:31:13', '2026-06-29 15:49:12', 0, 1, '$2b$12$NIJg8olI7LbEGw5j.LGmx.ntBL8/oaZjO1fZ6g5paWuP4O4MYUGkq', '2026-06-29 15:49:12', NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Nahom Test
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('b362f097-a15b-40aa-8f23-02ac4b0bcedf', 'Nahom Test', 'aff_asl4818a5', 'affiliate', 'nahomorto@gmail.com', '932961831', 1, NULL, NULL, '2026-10-12 21:09:48', '2026-10-14 09:16:41', 0, 0, '$2b$10$yJTbZbOyuH9m9sAPc9Nroe/oLsZ3UbYj8QGIAmaoHN6TC9RCfGFAe', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- test user
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('c09bfc1e-e11b-4330-aeb9-495429da12e7', 'test user', 'test.asella', 'admin', 'test@asella.com', NULL, 1, NULL, NULL, '2026-06-29 15:03:35', '2026-06-29 15:48:18', 0, 1, '$2b$12$J3ZmZU1VbY99HZlcoEdu8OXT4vdwlj2ehT2VMkomPC.bUnnbLuGY.', NULL, 'TYJ35PUM4FKSZVXPHIZBCLYL66MK6A2H', NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Abrham Mengistu
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('c731243d-392e-4da9-82f9-844455587c70', 'Abrham Mengistu', 'abrish@asella', 'delivery', 'abrish@asella.com', NULL, 1, 'Abrsh_m', NULL, '2026-07-16 12:04:37', '2026-07-16 12:04:37', 0, 0, '$2b$12$NZL0edzksledcmZgTZ7ZZuaktcvL9VlwUQEz9FQfRCIN4ncJHR.yC', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Enkopatsion Ezra H/mariam
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('d6b5bd0c-de20-4aa0-89f3-660a89a7a978', 'Enkopatsion Ezra H/mariam', 'aff_asl835174', 'affiliate', 'enkopazionezra@gmail.com', '+251912745662', 1, NULL, NULL, '2026-10-16 13:06:17', '2026-10-16 14:20:29', 0, 0, '$2b$10$ndhyF9ET976K9aa5/M8cYO72KTPK6SdfIcljRng5KVNhJSKU745Ra', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Dawit Bekele (existing, update role/email if needed)
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('a0000001-0000-0000-0000-000000000001', 'Dawit Bekele', 'dawit.admin', 'admin', 'dawit@asellaorganic.com', '+251911000001', 1, NULL, NULL, '2026-06-24 20:12:16', '2026-06-25 08:54:32', 0, 0, '$2b$12$R9mjRBebsZdBzlZm6QTrIO0QEWBoZadmKCFWwsJ.MDwmZYUulOc0S', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  -- Local Admin (existing, keep)
  INSERT INTO staff_users (id, full_name, username, role, email, phone, active, telegram_username, telegram_chat_id, created_at, updated_at, must_change_password, two_factor_enabled, password_hash, deleted_at, two_factor_secret, deleted_by, deleted_at_ip, deleted_reason)
  VALUES ('5a678079-7837-4fb9-8c1d-cc743aa91dfa', 'Local Admin', 'admin', 'admin', 'admin@asellaorganic.com', NULL, 1, NULL, NULL, '2026-11-01 10:51:51', '2026-11-01 10:51:51', 0, 0, '$2b$10$MZASvdwpeFH8Y07Xk8XYX.2UjbQBSajXIqbKTU4eywFOy4Zbdg0yW', NULL, NULL, NULL, NULL, NULL)
  ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name), username = VALUES(username), role = VALUES(role), email = VALUES(email),
    phone = VALUES(phone), active = VALUES(active), telegram_username = VALUES(telegram_username),
    telegram_chat_id = VALUES(telegram_chat_id), created_at = VALUES(created_at), updated_at = VALUES(updated_at),
    must_change_password = VALUES(must_change_password), two_factor_enabled = VALUES(two_factor_enabled),
    password_hash = VALUES(password_hash), deleted_at = VALUES(deleted_at), two_factor_secret = VALUES(two_factor_secret),
    deleted_by = VALUES(deleted_by), deleted_at_ip = VALUES(deleted_at_ip), deleted_reason = VALUES(deleted_reason);

  SELECT ROW_COUNT() AS affected_rows;
END//
DELIMITER ;

CALL update_staff_data();
DROP PROCEDURE IF EXISTS update_staff_data;

INSERT IGNORE INTO migrations_log (filename) VALUES ('054_update_staff_data.sql');

SELECT '054_update_staff_data.sql applied' AS result;