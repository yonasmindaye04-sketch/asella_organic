-- ============================================================
-- 006_clean_products.sql
-- Asella Organic — Canonical Product List Reset
--
-- PURPOSE: Remove all duplicate/incorrect products and replace
--          with the definitive 29-product catalog.
--
-- SAFE TO RUN MULTIPLE TIMES (uses INSERT IGNORE).
-- Run AFTER all previous migrations.
-- ============================================================

-- 1. Soft-delete ALL existing products to clear duplicates/wrong data
UPDATE products SET active = false WHERE 1=1;

-- 2. Wipe stock_snapshots (will rebuild from new products)
DELETE FROM stock_snapshots WHERE 1=1;

-- 3. Insert the canonical 29 products (INSERT IGNORE to skip if UUID already exists)

INSERT IGNORE INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES

-- MORINGA seed
('11111111-0001-0001-0001-000000000001', 'Moringa Seed', '500g', 1000, 'Herbs',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness Packed with essential vitamins and minerals to help support a healthy lifestyle.', true, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000002', 'Moringa Seed', '200g', 450, 'Herbs',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', false, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000003', 'Moringa powder', '500g', 1000, 'Herbs',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness Packed with essential vitamins and minerals to help support a healthy lifestyle.', true, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000004', 'Moringa powder', '200g', 450, 'Herbs',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', false, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000031', 'Moringa powder', '1kg', 1100, 'Herbs',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', false, true, 0, 10, NOW(), NOW()), 

-- ASHWAGANDA POWDER

('11111111-0001-0001-0001-000000000005', 'Ashewagenda powder', '300g', 3500, 'Herbs',
 '/image/products/Ashwegdna Powder 250g.png',
 'Traditionally used to help reduce stress, improve focus, and support daily vitality', false, true, 0, 10, NOW(), NOW()),

-- ASHWAGANDA HIMALAYA TABLETS
('11111111-0001-0001-0001-000000000006', 'Ashewagenda (Himalya) Tablet', '120 Tablet', 4500, 'Herbs',
 '/image/products/himalaya ashwagandha tablet 120 ( 250 mg ).png',
 'Supports a healthy stress response while promoting balance, energy, and well-being. 120 count.', false, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000007', 'Ashewagenda (Himalya) Tablet', '60 Tablet', 2500, 'Herbs',
 '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png',
 'Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.', false, true, 0, 10, NOW(), NOW()),

-- SHILAJIT
('11111111-0001-0001-0001-000000000008', 'Shilajit Gummies', '30 Gummies', 4000, 'Superfood',
 '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png',
 'Supports energy production, stamina, and mental performance with natural mineral compounds.', false, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000009', 'Shilajit Tablet', '60 Tablet', 4500, 'Superfood',
 '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png',
 'Traditionally valued for enhancing vitality, endurance, and overall wellness. 60 count.', false, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000010', 'Shilajit Oil', '30ml', 5000, 'Oils',
 '/image/products/Neuherb Shilajit gel 20g.png',
 'Provides concentrated mineral support for energy, strength, and cognitive function. 30ml.', false, true, 0, 10, NOW(), NOW()),

-- CHIA SEED
('11111111-0001-0001-0001-000000000011', 'Chia Seed', '250g', 800, 'Superfood',
 '/image/products/Chiaseed 250g and 1kg.png',
 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', true, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000012', 'Chia Seed', '1kg', 3000, 'Superfood',
 '/image/products/Chiaseed 250g and 1kg.png',
 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', false, true, 0, 10, NOW(), NOW()),

-- KERBE / MYRRH
('11111111-0001-0001-0001-000000000013', 'Kerbe Powder', '100g', 800, 'Traditional',
 '/image/products/Kerbe Powder ( 100g ).png',
 'Traditionally used to support digestive comfort and general well-being. 100g.', false, true, 0, 10, NOW(), NOW()),

-- RAW KERBE (MYRRH)
('11111111-0001-0001-0001-000000000014', 'Asella Kerbe Raw', '100g', 800, 'Traditional',
 '/image/products/Kerbe Powder ( 100g ).png',
 'Natural myrrh resin valued for its traditional wellness and aromatic benefits. 100g.', false, true, 0, 10, NOW(), NOW()),

-- KERKEDE / HIBISCUS 100g
('11111111-0001-0001-0001-000000000015', 'Kerkede Leafe', '100g', 500, 'Traditional',
 '/image/products/Hibiscus ( 100g ).png',
 ' Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea. 100g.', false, true, 0, 10, NOW(), NOW()),
-- KERKEDE / HIBISCUS 200g
('11111111-0001-0001-0001-000000000016', 'Kerkede Leafe', '200g', 1000, 'Traditional',
 '/image/products/Hibiscus ( 100g ).png',
 'Supports hydration and wellness with naturally occurring antioxidant compounds. 200g.', false, true, 0, 10, NOW(), NOW()),

-- CHEBE
('11111111-0001-0001-0001-000000000017', 'Chebe Powder', '100g', 1000, 'Traditional',
 '/image/products/Chebe powder  ( 100g ).png',
 'Traditionally used to nourish hair, improve moisture retention, and reduce breakage. 100g.', false, true, 0, 10, NOW(), NOW()),

-- ERDE / TURMERIC
('11111111-0001-0001-0001-000000000018', 'Erde', '200g', 450, 'Traditional',
 '/image/products/Erid Turmeric ( 220g ).png',
 'Contains natural compounds that support overall wellness and antioxidant protection. 200g.', false, true, 0, 10, NOW(), NOW()),

-- COFFEE
('11111111-0001-0001-0001-000000000019', 'Coffee', '500g', 800, 'Traditional',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Premium Ethiopian coffee that delivers rich flavor, energy, and mental alertness. 500g.', false, true, 0, 10, NOW(), NOW()),

-- KESIL
('11111111-0001-0001-0001-000000000020', 'Kesil Powder', '200g', 450, 'Traditional',
 '/image/products/Qasil Powder ( 200g ).png',
 ' Traditionally used in natural beauty routines to support healthy-looking skin. 200g.', false, true, 0, 10, NOW(), NOW()),

-- KEREBE OIL (MYRRH OIL)
('11111111-0001-0001-0001-000000000021', 'Kerebe (Myrrh) Oil', '30ml', 1500, 'Oils',
 '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png',
 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.', true, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000022', 'Kerebe (Myrrh) Oil', '60ml', 2900, 'Oils',
 '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png',
 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 60ml.', false, true, 0, 10, NOW(), NOW()),

-- FRANKINCENSE OIL
('11111111-0001-0001-0001-000000000023', 'Frankincense Oil', '30ml', 1500, 'Oils',
 '/image/products/Frankincense Oil  30ml and 60 ml.jpeg',
 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 30ml.', true, true, 0, 10, NOW(), NOW()),

('11111111-0001-0001-0001-000000000024', 'Frankincense Oil', '60ml', 2900, 'Oils',
 '/image/products/Frankincense Oil  30ml and 60 ml.jpeg',
 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 60ml.', false, true, 0, 10, NOW(), NOW()),

-- CLOVES
('11111111-0001-0001-0001-000000000025', 'Cloves', '100g', 400, 'Traditional',
 '/image/products/Asella Cloves 100g.png',
 'Rich in antioxidants and traditionally used to support oral and digestive health. 100g.', false, true, 0, 10, NOW(), NOW()),

-- PUMPKIN SEED
('11111111-0001-0001-0001-000000000026', 'Pumpkin Seed', '100g', 250, 'Superfood',
 '/image/products/Pumpkin Seed  100g.jpeg',
 'Packed with essential nutrients that support heart health and overall wellness. 100g.', false, true, 0, 10, NOW(), NOW()),

-- BLACKSEED OIL
('11111111-0001-0001-0001-000000000027', 'Blackseed Oil', '30ml', 800, 'Oils',
 '/image/products/Blackseed Oil ( 30ml ).JPG',
 'Traditionally used to support immunity, respiratory wellness, and daily health. 30ml.', false, true, 0, 10, NOW(), NOW()),

-- NILA POWDER
('11111111-0001-0001-0001-000000000028', 'Nila Powder', '100g', 1000, 'Traditional',
 '/image/products/Nila Powder 100g.jpeg',
 'Popular in natural skincare for promoting brighter and smoother-looking skin. 100g.', false, true, 0, 10, NOW(), NOW()),

-- FRANKINCENSE RAW
('11111111-0001-0001-0001-000000000029', 'Asella Frankincense Raw', '100g', 800, 'Traditional',
 '/image/products/Asella Frankincense ( 100g ).jpeg',
 'Premium natural resin traditionally used for relaxation and aromatic wellness. 100g.', false, true, 0, 10, NOW(), NOW()),

-- CINNAMON
('11111111-0001-0001-0001-000000000030', 'Cinnamon', '100g', 600, 'Traditional',
 '/image/products/Moringa 200g,500g and 1kg.png',
 'Rich in antioxidants and commonly used to support metabolic wellness. 100g.', false, true, 0, 10, NOW(), NOW());

-- 4. Rebuild stock_snapshots for all new products (start at 0)
INSERT IGNORE INTO stock_snapshots (product_id, current_quantity, last_updated)
SELECT id, inventory_quantity, NOW() FROM products WHERE active = true;

SELECT CONCAT(' Migration complete. ', COUNT(*), ' active products.') AS result
FROM products WHERE active = true;
