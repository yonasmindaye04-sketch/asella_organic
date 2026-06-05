-- ═══════════════════════════════════════════════════════════════════
-- 004_dummy_data.sql
-- Asella Organic — Complete Seed / Demo Data (MySQL / MariaDB)
-- ═══════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────
-- 1. STAFF USERS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO staff_users
    (id, username, password_hash, full_name, role, email, phone, active, two_factor_secret, two_factor_enabled)
VALUES
    ('a0000001-0000-0000-0000-000000000001', 'dawit.admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Dawit Bekele', 'admin', 'dawit@asellaorganic.com', '+251911000001', TRUE, NULL, FALSE),
    ('a0000001-0000-0000-0000-000000000002', 'hiwot.manager', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Hiwot Tadesse', 'manager', 'hiwot@asellaorganic.com', '+251911000002', TRUE, NULL, FALSE),
    ('a0000001-0000-0000-0000-000000000003', 'abebe.emp', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Abebe Girma', 'employee', 'abebe@asellaorganic.com', '+251911000003', TRUE, NULL, FALSE),
    ('a0000001-0000-0000-0000-000000000004', 'meron.emp', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Meron Haile', 'employee', 'meron@asellaorganic.com', '+251911000004', TRUE, NULL, FALSE),
    ('a0000001-0000-0000-0000-000000000005', 'tsegaye.driver', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Tsegaye Worku', 'delivery', NULL, '+251911000005', TRUE, NULL, FALSE),
    ('a0000001-0000-0000-0000-000000000006', 'nigella.vendor', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Nigella Trading Rep', 'vendor', 'vendor@nigellatrading.et', '+251922000006', TRUE, NULL, FALSE),
    ('a0000001-0000-0000-0000-000000000007', 'biruk.affiliate', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuyema5PysIqD6Jlz6OvtmO2', 'Biruk Alemu', 'affiliate', 'biruk@health.et', '+251933000007', TRUE, NULL, FALSE);

-- ─────────────────────────────────────────────────────────────────
-- 2. REFERRAL CONFIGS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO referral_configs
    (id, commission_type, commission_value, min_order_amount, max_commission, is_active)
VALUES
    ('rc000001-0000-0000-0000-000000000001', 'percentage', 10.00, 300.00, 500.00, TRUE);

-- ─────────────────────────────────────────────────────────────────
-- 3. TELEGRAM USERS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO telegram_users
    (chat_id, username, first_name, last_name, role, registered_at)
VALUES
    (100000001, 'hiwot_manager',  'Hiwot',   'Tadesse', 'manager', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (100000002, 'abebe_sales',    'Abebe',   'Girma',   'sales',   DATE_SUB(NOW(), INTERVAL 25 DAY)),
    (100000003, 'nigella_vendor', 'Nigella', 'Trading', 'vendor',  DATE_SUB(NOW(), INTERVAL 20 DAY)),
    (200000001, 'selam_customer', 'Selam',   'Mekuria', NULL,      DATE_SUB(NOW(), INTERVAL 10 DAY)),
    (200000002, 'kebede_cust',    'Kebede',  'Alemu',   NULL,      DATE_SUB(NOW(), INTERVAL 8  DAY));

-- ─────────────────────────────────────────────────────────────────
-- 4. AFFILIATE PROFILES
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO affiliate_profiles
    (id, user_id, referral_code, full_name, email, phone, is_active, total_referrals, total_earnings)
VALUES
    ('af000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000007', 'BIRUK10', 'Biruk Alemu', 'biruk@health.et', '+251933000007', TRUE, 2, 230.00),
    ('af000001-0000-0000-0000-000000000002', NULL, 'YESHI20', 'Yeshimebet Girma', 'yeshi@gmail.com', '+251944000099', TRUE, 1, 42.00);

-- ─────────────────────────────────────────────────────────────────
-- 5. CUSTOMERS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO customers
    (id, phone, name, email, city, location, gender, age_group, referral_code_used, referred_by_affiliate_id, referred_at, telegram_chat_id, total_orders, total_spent)
VALUES
    ('cu000001-0000-0000-0000-000000000001', '+251911100001', 'Tigist Alemu', 'tigist@gmail.com', 'Addis Ababa', 'Kazanchis', 'Female', '25-34', 'BIRUK10', 'af000001-0000-0000-0000-000000000001', DATE_SUB(NOW(), INTERVAL 20 DAY), NULL, 2, 2000.00),
    ('cu000001-0000-0000-0000-000000000002', '+251911100002', 'Henok Tadesse', NULL, 'Addis Ababa', 'Bole', 'Male', '25-34', 'BIRUK10', 'af000001-0000-0000-0000-000000000001', DATE_SUB(NOW(), INTERVAL 18 DAY), NULL, 1, 1300.00),
    ('cu000001-0000-0000-0000-000000000003', '+251911100003', 'Almaz Kebede', 'almaz@gmail.com', 'Addis Ababa', 'Piassa', 'Female', '35-44', 'YESHI20', 'af000001-0000-0000-0000-000000000002', DATE_SUB(NOW(), INTERVAL 15 DAY), NULL, 1, 420.00),
    ('cu000001-0000-0000-0000-000000000004', '+251911100004', 'Bekele Worku', NULL, 'Addis Ababa', 'Merkato', 'Male', '45-54', NULL, NULL, NULL, NULL, 2, 1570.00),
    ('cu000001-0000-0000-0000-000000000005', '+251911100005', 'Selamawit Haile', 'selam@yahoo.com', 'Adama', 'Main Street', 'Female', '18-24', NULL, NULL, NULL, NULL, 1, 930.00),
    ('cu000001-0000-0000-0000-000000000006', '+251911100006', 'Kebede Alemu', NULL, 'Addis Ababa', 'CMC', 'Male', '25-34', NULL, NULL, NULL, 200000002, 1, 860.00);

-- ─────────────────────────────────────────────────────────────────
-- 6. PRODUCTS (20 Unique Products Matching Public Images)
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO products
    (id, name, package_size, price, description, image_url, featured, tag, inventory_quantity, low_stock_threshold, active)
VALUES
    ('pr000001-0000-0000-0000-000000000001', 'Moringa', '200g, 500g, 1kg', 800.00, 'Pure organic Moringa seeds and powder.', '/image/products/Moringa 200g,500g and 1kg.png', TRUE, 'bestseller', 100, 15, TRUE),
    ('pr000001-0000-0000-0000-000000000002', 'Ashwagandha Powder', '250g', 2500.00, 'Premium Ashwagandha powder for wellness.', '/image/products/Ashwegdna Powder 250g.png', TRUE, 'wellness', 60, 12, TRUE),
    ('pr000001-0000-0000-0000-000000000003', 'Himalaya Ashwagandha', '60 Tablet', 2500.00, 'Himalaya Ashwagandha tablets 250mg each.', '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', TRUE, 'wellness', 45, 10, TRUE),
    ('pr000001-0000-0000-0000-000000000004', 'Himalaya Ashwagandha', '120 Tablet', 4500.00, 'Himalaya Ashwagandha tablets 120 count.', '/image/products/himalaya ashwagandha tablet 120 ( 250 mg ).png', FALSE, 'wellness', 30, 10, TRUE),
    ('pr000001-0000-0000-0000-000000000005', 'Shilajit Gummies', '30 Gummies', 4000.00, 'Neuherb Shilajit gummies for energy.', '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png', TRUE, 'premium', 40, 8, TRUE),
    ('pr000001-0000-0000-0000-000000000006', 'Shilajit Gel', '20g', 5000.00, 'Neuherb Shilajit gel pure extract.', '/image/products/Neuherb Shilajit gel 20g.png', TRUE, 'premium', 25, 6, TRUE),
    ('pr000001-0000-0000-0000-000000000007', 'Himalaya Shilajit', '60 Tablet', 4500.00, 'Himalaya Shilajit tablets 500mg each.', '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png', TRUE, 'premium', 35, 8, TRUE),
    ('pr000001-0000-0000-0000-000000000008', 'Chia Seeds', '250g, 1kg', 800.00, 'Organic Chia seeds in bulk and small sizes.', '/image/products/Chiaseed 250g and 1kg.png', TRUE, 'superfood', 70, 15, TRUE),
    ('pr000001-0000-0000-0000-000000000009', 'Kerbe Powder', '100g', 800.00, 'Traditional Kerbe powder premium quality.', '/image/products/Kerbe Powder ( 100g ).png', TRUE, 'traditional', 50, 12, TRUE),
    ('pr000001-0000-0000-0000-000000000010', 'Asella Frankincense', '100g', 800.00, 'Raw Asella Frankincense 100g.', '/image/products/Asella Frankincense ( 100g ).jpeg', TRUE, 'traditional', 40, 12, TRUE),
    ('pr000001-0000-0000-0000-000000000011', 'Myrrh Oil', '30ml, 60ml', 2000.00, 'Premium Myrrh oil Kerebe in two sizes.', '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png', TRUE, 'oil', 35, 8, TRUE),
    ('pr000001-0000-0000-0000-000000000012', 'Frankincense Oil', '30ml, 60ml', 2000.00, 'Premium Frankincense oil aromatherapy.', '/image/products/Frankincense Oil  30ml and 60 ml.jpeg', TRUE, 'oil', 30, 8, TRUE),
    ('pr000001-0000-0000-0000-000000000013', 'Asella Cloves', '100g', 400.00, 'Premium cloves from Asella.', '/image/products/Asella Cloves 100g.png', TRUE, 'spice', 80, 15, TRUE),
    ('pr000001-0000-0000-0000-000000000014', 'Turmeric', '220g', 450.00, 'Erid Turmeric powder 220g.', '/image/products/Erid Turmeric ( 220g ).png', TRUE, 'spice', 55, 12, TRUE),
    ('pr000001-0000-0000-0000-000000000015', 'Chebe Powder', '100g', 1000.00, 'Traditional Chebe powder for hair care.', '/image/products/Chebe powder  ( 100g ).png', TRUE, 'traditional', 45, 10, TRUE),
    ('pr000001-0000-0000-0000-000000000016', 'Blackseed Oil', '30ml', 800.00, 'Cold-pressed Blackseed oil premium.', '/image/products/Blackseed Oil ( 30ml ).JPG', TRUE, 'oil', 50, 12, TRUE),
    ('pr000001-0000-0000-0000-000000000017', 'Qasil Powder', '200g', 600.00, 'Traditional Qasil powder for skincare.', '/image/products/Qasil Powder ( 200g ).png', TRUE, 'traditional', 40, 10, TRUE),
    ('pr000001-0000-0000-0000-000000000018', 'Nila Powder', '100g', 1000.00, 'Premium Nila powder 100g.', '/image/products/Nila Powder 100g.jpeg', TRUE, 'traditional', 35, 10, TRUE),
    ('pr000001-0000-0000-0000-000000000019', 'Pumpkin Seed', '100g', 250.00, 'Organic pumpkin seeds 100g.', '/image/products/Pumpkin Seed  100g.jpeg', TRUE, 'superfood', 65, 15, TRUE),
    ('pr000001-0000-0000-0000-000000000020', 'Hibiscus', '100g', 500.00, 'Dried hibiscus flowers 100g.', '/image/products/Hibiscus ( 100g ).png', TRUE, 'herbal', 55, 12, TRUE);

-- ─────────────────────────────────────────────────────────────────
-- 7. STOCK SNAPSHOTS
-- ─────────────────────────────────────────────────────────────────
INSERT INTO stock_snapshots (product_id, current_quantity)
SELECT id, inventory_quantity FROM products WHERE active = TRUE
ON DUPLICATE KEY UPDATE current_quantity = VALUES(current_quantity);

-- ─────────────────────────────────────────────────────────────────
-- 8. ORDERS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO orders
    (id, source, customer_name, phone, location, city, gender, age_group, order_type, status, payment_status, total, notes, customer_id, assigned_to, created_at)
VALUES
    ('ORD-20250501-A001', 'website', 'Tigist Alemu', '+251911100001', 'Kazanchis', 'Addis Ababa', 'Female', '25-34', 'Online', 'Pending', 'pending', 1000.00, NULL, 'cu000001-0000-0000-0000-000000000001', NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    ('ORD-20250501-A002', 'instagram', 'Bekele Worku', '+251911100004', 'Merkato', 'Addis Ababa', 'Male', '45-54', 'Online', 'Processing', 'completed', 640.00, 'Customer requested morning delivery', 'cu000001-0000-0000-0000-000000000004', 'abebe.emp', DATE_SUB(NOW(), INTERVAL 2 DAY)),
    ('ORD-20250501-A003', 'telegram', 'Tigist Alemu', '+251911100001', 'Kazanchis', 'Addis Ababa', 'Female', '25-34', 'Online', 'Delivered', 'completed', 1000.00, NULL, 'cu000001-0000-0000-0000-000000000001', 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    ('ORD-20250501-A004', 'website', 'Henok Tadesse', '+251911100002', 'Bole', 'Addis Ababa', 'Male', '25-34', 'Online', 'Delivered', 'completed', 1300.00, NULL, 'cu000001-0000-0000-0000-000000000002', 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    ('ORD-20250501-A005', 'instagram', 'Almaz Kebede', '+251911100003', 'Piassa', 'Addis Ababa', 'Female', '35-44', 'Online', 'Delivered', 'completed', 420.00, NULL, 'cu000001-0000-0000-0000-000000000003', 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    ('ORD-20250501-A006', 'website', 'Selamawit Haile', '+251911100005', 'Main Street', 'Adama', 'Female', '18-24', 'Online', 'Pending', 'pending', 930.00, 'Please call before delivery', 'cu000001-0000-0000-0000-000000000005', NULL, NOW()),
    ('ORD-20250501-A007', 'telegram', 'Bekele Worku', '+251911100004', 'Merkato', 'Addis Ababa', 'Male', '45-54', 'Online', 'Delivered', 'completed', 630.00, NULL, 'cu000001-0000-0000-0000-000000000004', 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 14 DAY)),
    ('ORD-20250501-A008', 'website', 'Kebede Alemu', '+251911100006', 'CMC', 'Addis Ababa', 'Male', '25-34', 'Online', 'Cancelled', 'pending', 860.00, 'Customer cancelled — out of town', 'cu000001-0000-0000-0000-000000000006', NULL, DATE_SUB(NOW(), INTERVAL 3 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 9. ORDER ITEMS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO order_items
    (id, order_id, product_id, item_name, package_size, quantity, unit_price)
VALUES
    (UUID(), 'ORD-20250501-A001', 'pr000001-0000-0000-0000-000000000001', 'Moringa Powder', '250g', 2, 350.00),
    (UUID(), 'ORD-20250501-A001', 'pr000001-0000-0000-0000-000000000007', 'Spirulina Powder', '100g', 1, 300.00),
    (UUID(), 'ORD-20250501-A002', 'pr000001-0000-0000-0000-000000000003', 'Black Seed Oil', '100ml', 1, 420.00),
    (UUID(), 'ORD-20250501-A002', 'pr000001-0000-0000-0000-000000000006', 'Ginger Powder', '250g', 1, 220.00),
    (UUID(), 'ORD-20250501-A003', 'pr000001-0000-0000-0000-000000000003', 'Black Seed Oil', '100ml', 1, 420.00),
    (UUID(), 'ORD-20250501-A003', 'pr000001-0000-0000-0000-000000000007', 'Spirulina Powder', '100g', 1, 580.00),
    (UUID(), 'ORD-20250501-A004', 'pr000001-0000-0000-0000-000000000002', 'Moringa Powder', '500g', 2, 650.00),
    (UUID(), 'ORD-20250501-A005', 'pr000001-0000-0000-0000-000000000003', 'Black Seed Oil', '100ml', 1, 420.00),
    (UUID(), 'ORD-20250501-A006', 'pr000001-0000-0000-0000-000000000004', 'Black Seed Oil', '200ml', 1, 780.00),
    (UUID(), 'ORD-20250501-A006', 'pr000001-0000-0000-0000-000000000006', 'Ginger Powder', '250g', 1, 150.00),
    (UUID(), 'ORD-20250501-A007', 'pr000001-0000-0000-0000-000000000001', 'Moringa Powder', '250g', 1, 350.00),
    (UUID(), 'ORD-20250501-A007', 'pr000001-0000-0000-0000-000000000005', 'Turmeric Powder', '250g', 1, 280.00),
    (UUID(), 'ORD-20250501-A008', 'pr000001-0000-0000-0000-000000000001', 'Moringa Powder', '250g', 1, 350.00),
    (UUID(), 'ORD-20250501-A008', 'pr000001-0000-0000-0000-000000000003', 'Black Seed Oil', '100ml', 1, 290.00),
    (UUID(), 'ORD-20250501-A008', 'pr000001-0000-0000-0000-000000000006', 'Ginger Powder', '250g', 1, 220.00);

-- ─────────────────────────────────────────────────────────────────
-- 10. PAYMENTS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO payments
    (id, order_id, amount, payment_method, transaction_id, status, paid_at, recorded_by, notes)
VALUES
    (UUID(), 'ORD-20250501-A002', 640.00, 'bank_transfer', 'TXN-CBE-20250429-001', 'completed', DATE_SUB(NOW(), INTERVAL 2 DAY), 'a0000001-0000-0000-0000-000000000003', NULL),
    (UUID(), 'ORD-20250501-A003', 1000.00, 'cash', NULL, 'completed', DATE_SUB(NOW(), INTERVAL 7 DAY), 'a0000001-0000-0000-0000-000000000005', NULL),
    (UUID(), 'ORD-20250501-A004', 1300.00, 'mobile_money', 'TELEBIRR-2025050201', 'completed', DATE_SUB(NOW(), INTERVAL 5 DAY), 'a0000001-0000-0000-0000-000000000003', 'Paid via TeleBirr'),
    (UUID(), 'ORD-20250501-A005', 420.00, 'cash', NULL, 'completed', DATE_SUB(NOW(), INTERVAL 10 DAY), 'a0000001-0000-0000-0000-000000000003', NULL),
    (UUID(), 'ORD-20250501-A007', 630.00, 'cash', NULL, 'completed', DATE_SUB(NOW(), INTERVAL 14 DAY), 'a0000001-0000-0000-0000-000000000005', NULL);

-- ─────────────────────────────────────────────────────────────────
-- 11. ORDER STATUS HISTORY
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO order_status_history
    (id, order_id, old_status, new_status, changed_by, note, created_at)
VALUES
    (UUID(), 'ORD-20250501-A002', 'Pending',    'Processing', 'abebe.emp',     NULL,                   DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (UUID(), 'ORD-20250501-A003', 'Pending',    'Processing', 'abebe.emp',     NULL,                   DATE_SUB(NOW(), INTERVAL 8 DAY)),
    (UUID(), 'ORD-20250501-A003', 'Processing', 'Delivered',  'tsegaye.driver','Delivered to customer', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (UUID(), 'ORD-20250501-A004', 'Pending',    'Processing', 'abebe.emp',     NULL,                   DATE_SUB(NOW(), INTERVAL 6 DAY)),
    (UUID(), 'ORD-20250501-A004', 'Processing', 'Delivered',  'tsegaye.driver','Delivered to customer', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (UUID(), 'ORD-20250501-A005', 'Pending',    'Processing', 'meron.emp',     NULL,                   DATE_SUB(NOW(), INTERVAL 11 DAY)),
    (UUID(), 'ORD-20250501-A005', 'Processing', 'Delivered',  'tsegaye.driver','Left at door per request', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    (UUID(), 'ORD-20250501-A007', 'Pending',    'Processing', 'abebe.emp',     NULL,                   DATE_SUB(NOW(), INTERVAL 15 DAY)),
    (UUID(), 'ORD-20250501-A007', 'Processing', 'Delivered',  'tsegaye.driver','Delivered to customer', DATE_SUB(NOW(), INTERVAL 14 DAY)),
    (UUID(), 'ORD-20250501-A008', 'Pending',    'Cancelled',  'hiwot.manager', 'Customer cancelled — out of town', DATE_SUB(NOW(), INTERVAL 3 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 12. DELIVERY ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO delivery_assignments
    (order_id, telegram_message_id, driver_username, claimed_at, delivered_at)
VALUES
    ('ORD-20250501-A003', 300000001, 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 1 HOUR, DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 3 HOUR),
    ('ORD-20250501-A004', 300000002, 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 1 HOUR, DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 2 HOUR),
    ('ORD-20250501-A005', 300000003, 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 1 HOUR, DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 4 HOUR),
    ('ORD-20250501-A007', 300000004, 'tsegaye.driver', DATE_SUB(NOW(), INTERVAL 14 DAY) + INTERVAL 2 HOUR, DATE_SUB(NOW(), INTERVAL 14 DAY) + INTERVAL 4 HOUR);

-- ─────────────────────────────────────────────────────────────────
-- 13. INVENTORY MOVEMENTS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO inventory_movements
    (id, product_id, movement_type, change_amount, reason, performed_by, quantity_after, reference_type, created_at)
VALUES
    (UUID(), 'pr000001-0000-0000-0000-000000000001', 'initial_stock', 120, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 120, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000002', 'initial_stock', 60, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 60, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000003', 'initial_stock', 45, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 45, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000004', 'initial_stock', 25, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 25, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000005', 'initial_stock', 90, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 90, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000006', 'initial_stock', 75, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 75, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000007', 'initial_stock', 30, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 30, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000008', 'initial_stock', 8, 'Opening stock balance', 'a0000001-0000-0000-0000-000000000001', 8, 'manual', DATE_SUB(NOW(), INTERVAL 30 DAY));

INSERT IGNORE INTO inventory_movements
    (id, product_id, movement_type, change_amount, reason, performed_by, quantity_after, reference_id, reference_type, created_at)
VALUES
    (UUID(), 'pr000001-0000-0000-0000-000000000003', 'sale', -1, 'Order ORD-20250501-A003 delivered', NULL, 44, 'ORD-20250501-A003', 'order', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000007', 'sale', -1, 'Order ORD-20250501-A003 delivered', NULL, 29, 'ORD-20250501-A003', 'order', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000002', 'sale', -2, 'Order ORD-20250501-A004 delivered', NULL, 58, 'ORD-20250501-A004', 'order', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000003', 'sale', -1, 'Order ORD-20250501-A005 delivered', NULL, 43, 'ORD-20250501-A005', 'order', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000001', 'sale', -1, 'Order ORD-20250501-A007 delivered', NULL, 119, 'ORD-20250501-A007', 'order', DATE_SUB(NOW(), INTERVAL 14 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000005', 'sale', -1, 'Order ORD-20250501-A007 delivered', NULL, 89, 'ORD-20250501-A007', 'order', DATE_SUB(NOW(), INTERVAL 14 DAY));

INSERT IGNORE INTO inventory_movements
    (id, product_id, movement_type, change_amount, reason, performed_by, quantity_after, reference_type, created_at)
VALUES
    (UUID(), 'pr000001-0000-0000-0000-000000000008', 'damage_loss', -7, 'Damaged packaging — batch written off', 'a0000001-0000-0000-0000-000000000002', 8, 'manual', DATE_SUB(NOW(), INTERVAL 5 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 14. VENDOR ORDERS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO vendor_orders
    (id, product_id, order_id, vendor_name, vendor_chat_id, item, amount, price, delivery_date, status, created_at)
VALUES
    (UUID(), 'pr000001-0000-0000-0000-000000000008', 'PO-2025050-001', 'Organic Farms Ethiopia', '100000003', 'Moringa Capsules', '60 caps × 50 units', 22500.00, DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'pending', DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000003', 'PO-2025050-002', 'Nigella Trading', '100000003', 'Black Seed Oil 100ml', '100ml × 30 units', 9000.00, DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'confirmed', DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000007', 'PO-2025040-003', 'Green Ethiopia Exports', NULL, 'Spirulina Powder', '100g × 20 units', 8000.00, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'completed', DATE_SUB(NOW(), INTERVAL 20 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 15. STOCK REQUESTS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO stock_requests
    (id, product_id, item, package_size, stock_available, qty_needed, delivery_date, requested_by, requested_by_user_id, status, notes, created_at)
VALUES
    (UUID(), 'pr000001-0000-0000-0000-000000000008', 'Moringa Capsules', '60 caps', 8, 50, DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'Meron Haile', 'a0000001-0000-0000-0000-000000000004', 'ordered', 'PO already sent to Organic Farms Ethiopia', DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (UUID(), 'pr000001-0000-0000-0000-000000000001', 'Moringa Powder', '250g', 118, 100, DATE_ADD(CURDATE(), INTERVAL 14 DAY), 'Abebe Girma', 'a0000001-0000-0000-0000-000000000003', 'pending', NULL, NOW()),
    (UUID(), 'pr000001-0000-0000-0000-000000000007', 'Spirulina Powder', '100g', 10, 20, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Meron Haile', 'a0000001-0000-0000-0000-000000000004', 'received', 'Received from Green Ethiopia Exports', DATE_SUB(NOW(), INTERVAL 20 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 16. REFERRAL COMMISSIONS
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO referral_commissions
    (id, affiliate_id, customer_id, order_id, commission_type, commission_value, order_total, commission_amount, status, calculated_at)
VALUES
    (UUID(), 'af000001-0000-0000-0000-000000000001', 'cu000001-0000-0000-0000-000000000001', 'ORD-20250501-A003', 'percentage', 10.00, 1000.00, 100.00, 'pending', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (UUID(), 'af000001-0000-0000-0000-000000000001', 'cu000001-0000-0000-0000-000000000002', 'ORD-20250501-A004', 'percentage', 10.00, 1300.00, 130.00, 'paid', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (UUID(), 'af000001-0000-0000-0000-000000000002', 'cu000001-0000-0000-0000-000000000003', 'ORD-20250501-A005', 'percentage', 10.00, 420.00, 42.00, 'pending', DATE_SUB(NOW(), INTERVAL 10 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 17. AUDIT LOG
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO audit_log
    (id, table_name, record_id, order_id, actor, action, old_values, new_values, created_at)
VALUES
    (UUID(), 'staff_users', 'a0000001-0000-0000-0000-000000000003', NULL, 'a0000001-0000-0000-0000-000000000001', 'STAFF_CREATED', NULL, JSON_OBJECT('username', 'abebe.emp', 'role', 'employee'), DATE_SUB(NOW(), INTERVAL 30 DAY)),
    (UUID(), 'orders', NULL, 'ORD-20250501-A003', 'tsegaye.driver', 'UPDATE', JSON_OBJECT('status', 'Processing'), JSON_OBJECT('status', 'Delivered'), DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (UUID(), 'products', 'pr000001-0000-0000-0000-000000000008', NULL, 'a0000001-0000-0000-0000-000000000002', 'UPDATE', JSON_OBJECT('inventory_quantity', 15), JSON_OBJECT('inventory_quantity', 8, 'reason', 'Damaged packaging written off'), DATE_SUB(NOW(), INTERVAL 5 DAY));

-- ─────────────────────────────────────────────────────────────────
-- 18. FINALIZE
-- ─────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 1;

INSERT IGNORE INTO migrations_log (filename) VALUES ('004_dummy_data.sql');