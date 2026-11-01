-- ============================================================
-- 006_clean_products.sql
-- Asella Organic - Canonical Product List
--
-- GENERATED FILE - source of truth: backend/data/catalog-active.csv
-- Regenerate with: node backend/scripts/generate-006-sql.cjs   (see the header of that script)
--
-- 36 variants across 23 product groups
-- 26 active variants, 980 units of opening stock
--
-- SCOPE
--   This migration runs BEFORE 016 (unit_cost), 018 (active_unique) and
--   035 (product_group_id / sku / size columns), so it can only write the
--   columns that exist at that point:
--     id, name, package_size, price, tag, image_url, description,
--     featured, active, inventory_quantity, low_stock_threshold
--   product_group_id, unit_cost, sku and the aliases are filled in by the
--   v2 catalog import: backend/scripts/data-migrations/import-catalog.cjs
--
-- RE-RUN SAFETY
--   Rows are inserted on first run and UPDATED on conflict for the
--   catalogue attributes (name, size, price, tag, image, description,
--   featured, threshold).
--   active and inventory_quantity are deliberately NOT overwritten on
--   conflict: live stock and staff deactivations are business state, not
--   seed data, and clobbering them would corrupt stock on an existing
--   database. On a fresh database both come from the CSV as usual.
-- ============================================================

-- 1. Archive the legacy pr0000... products (historical references only).
--    They are deactivated, never deleted, so order_items.product_id stays valid.
UPDATE products SET active = false WHERE id LIKE 'pr0000%';

-- 2. Drop their stock snapshots (they are rebuilt from the current catalog).
DELETE FROM stock_snapshots WHERE product_id LIKE 'pr0000%';

-- Asella Frankincense Raw (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000029', 'Asella Frankincense Raw', '100g', 800, 'Traditional', '/image/products/Asella Frankincense Raw.jpeg', 'Premium natural resin traditionally used for relaxation and aromatic wellness. 100g.', FALSE, TRUE, 4, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Asella Kerbe Raw (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000014', 'Asella Kerbe Raw', '100g', 800, 'Traditional', '/image/products/Kerbe Powder ( 100g ).png', 'Natural myrrh resin valued for its traditional wellness and aromatic benefits. 100g.', FALSE, TRUE, 11, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Ashewagenda (Himalya) Tablet (2 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000007', 'Ashewagenda (Himalya) Tablet', '60 Tablet', 2500, 'Herbs', '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', 'Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.', FALSE, TRUE, 29, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000006', 'Ashewagenda (Himalya) Tablet', '120 Tablet', 4500, 'Herbs', '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', 'Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.', FALSE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Ashewagenda powder (3 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000005', 'Ashewagenda powder', '300g', 3500, 'Herbs', '/image/products/Ashwegdna Powder 250g.png', 'Traditionally used to help reduce stress, improve focus, and support daily vitality', FALSE, TRUE, 8, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000032', 'Ashewagenda powder', '100g', 1200, 'Herbs', '/image/products/Ashwegdna Powder 250g.png', 'Traditionally used to help reduce stress, improve focus, and support daily vitality', FALSE, FALSE, 0, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000033', 'Ashewagenda powder', '250g', 2900, 'Herbs', '/image/products/Ashwegdna Powder 250g.png', 'Traditionally used to help reduce stress, improve focus, and support daily vitality', FALSE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Blackseed Oil (2 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000027', 'Blackseed Oil', '30ml', 800, 'Traditional', 'https://res.cloudinary.com/yrlvhvmf/image/upload/v1791869785/asella-organic/rm8evvzv8nnyhygg2eq2.png', 'Rich in antioxidants and traditionally used to support immune health, skin wellness, and overall vitality. 30ml.', TRUE, FALSE, 6, 10, NOW(), NOW()),
  ('6aa93233-105c-450d-9a4b-743efa1ab59e', 'Blackseed Oil', '250 ml', 3000, 'Traditional', 'https://res.cloudinary.com/yrlvhvmf/image/upload/v1791869785/asella-organic/rm8evvzv8nnyhygg2eq2.png', 'Rich in antioxidants and traditionally used to support immune health, skin wellness, and overall vitality. 250ml.', TRUE, TRUE, 9, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Chebe Powder (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000017', 'Chebe Powder', '100g', 1000, 'Traditional', '/image/products/Chebe powder  ( 100g ).png', 'Traditionally used to nourish hair, improve moisture retention, and reduce breakage. 100g.', FALSE, TRUE, 13, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Chia Seed (2 variant(s), 2 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000011', 'Chia Seed', '250g', 800, 'Superfood', '/image/products/Chiaseed 250g and 1kg.png', 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', TRUE, TRUE, 91, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000012', 'Chia Seed', '1kg', 3000, 'Superfood', '/image/products/Chiaseed 250g and 1kg.png', 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', TRUE, TRUE, 26, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Cinnamon (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000030', 'Cinnamon', '100g', 600, 'Traditional', '/image/products/Cinnamon.png', 'Rich in antioxidants and commonly used to support metabolic wellness. 100g.', FALSE, TRUE, 41, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Cloves (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000025', 'Cloves', '100g', 400, 'Traditional', '/image/products/Cloves.png', 'Rich in antioxidants and traditionally used to support oral and digestive health. 100g.', FALSE, TRUE, 49, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Coffee (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000019', 'Coffee', '500g', 800, 'Traditional', '/image/products/Coffee.png', 'Premium Ethiopian coffee that delivers rich flavor, energy, and mental alertness. 500g.', FALSE, TRUE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Erde (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000018', 'Erde', '200g', 450, 'Traditional', '/image/products/Erid Turmeric ( 220g ).png', 'Contains natural compounds that support overall wellness and antioxidant protection. 200g.', FALSE, TRUE, 34, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Frankincense Oil (2 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000023', 'Frankincense Oil', '30ml', 1500, 'Oils', '/image/products/Frankincense Oil  30ml and 60 ml.jpeg', 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 30ml.', TRUE, TRUE, 18, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000024', 'Frankincense Oil', '60ml', 2900, 'Oils', '/image/products/Frankincense Oil  30ml and 60 ml.jpeg', 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 30ml.', TRUE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Kerkede Leafe (3 variant(s), 3 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000015', 'Kerkede Leafe', '100g', 500, 'Traditional', '/image/products/Hibiscus ( 100g ).png', 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', FALSE, TRUE, 12, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000016', 'Kerkede Leafe', '200g', 1000, 'Traditional', '/image/products/Hibiscus ( 100g ).png', 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', FALSE, TRUE, 16, 10, NOW(), NOW()),
  ('e383c401-5ad0-4070-88e6-876a47e86c76', 'Kerkede Leafe', '400g', 2000, 'Traditional', '/image/products/Hibiscus ( 100g ).png', 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', FALSE, TRUE, 17, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Kerbe Powder (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000013', 'Kerbe Powder', '100g', 800, 'Traditional', '/image/products/Kerbe Powder ( 100g ).png', 'Traditionally used to support digestive comfort and general well-being. 100g.', FALSE, TRUE, 38, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Kerebe (Myrrh) Oil (2 variant(s), 2 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000021', 'Kerebe (Myrrh) Oil', '30ml', 1500, 'Oils', '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png', 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.', TRUE, TRUE, 51, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000022', 'Kerebe (Myrrh) Oil', '60ml', 2900, 'Oils', '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png', 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.', TRUE, TRUE, 13, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Kesil Powder (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000020', 'Kesil Powder', '200g', 450, 'Traditional', '/image/products/Qasil Powder ( 200g ).png', 'Traditionally used in natural beauty routines to support healthy-looking skin. 200g.', FALSE, TRUE, 27, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Moringa powder (3 variant(s), 3 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000004', 'Moringa powder', '200g', 350, 'Herbs', '/image/products/Moringa 200g,500g and 1kg.png', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', TRUE, TRUE, 372, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000003', 'Moringa powder', '500g', 750, 'Herbs', '/image/products/Moringa 200g,500g and 1kg.png', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', TRUE, TRUE, 10, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000031', 'Moringa powder', '1kg', 1100, 'Herbs', '/image/products/Moringa 200g,500g and 1kg.png', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', TRUE, TRUE, 50, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Moringa Seed (2 variant(s), 0 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000002', 'Moringa Seed', '200g', 450, 'Herbs', '/image/products/Moringa 200g,500g and 1kg.png', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', FALSE, FALSE, 0, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000001', 'Moringa Seed', '500g', 1000, 'Herbs', '/image/products/Moringa 200g,500g and 1kg.png', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', FALSE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Nila Powder (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000028', 'Nila Powder', '100g', 1000, 'Traditional', '/image/products/Nila Powder 100g.jpeg', 'Popular in natural skincare for promoting brighter and smoother-looking skin. 100g.', FALSE, TRUE, 21, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Pumpkin Seed (2 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000026', 'Pumpkin Seed', '300g', 600, 'Superfood', '/image/products/Pumpkin Seed  100g.jpeg', 'Packed with essential nutrients that support heart health and overall wellness.', FALSE, TRUE, 14, 10, NOW(), NOW()),
  ('11111111-0001-0001-0001-000000000034', 'Pumpkin Seed', '100g', 250, 'Superfood', '/image/products/Pumpkin Seed  100g.jpeg', 'Packed with essential nutrients that support heart health and overall wellness.', FALSE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Shilajit Gummies (1 variant(s), 0 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000008', 'Shilajit Gummies', '30 Gummies', 4000, 'Superfood', '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png', 'Supports energy production, stamina, and mental performance with natural mineral compounds.', FALSE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Himalayan Shilajit Jell (1 variant(s), 0 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000010', 'Himalayan Shilajit Jell', '20g', 5000, 'Superfood', '/image/products/Shilajit Oil.png', 'Concentrated Himalayan Shilajit jelly supporting energy, strength, and cognitive function. 20g.', FALSE, FALSE, 0, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();

-- Shilajit Tablet (1 variant(s), 1 active)
INSERT INTO products
  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)
VALUES
  ('11111111-0001-0001-0001-000000000009', 'Shilajit Tablet', '60 Tablet', 4500, 'Superfood', '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png', 'Traditionally valued for enhancing vitality, endurance, and overall wellness. 60 count.', FALSE, TRUE, 6, 10, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name             = VALUES(name),
  package_size     = VALUES(package_size),
  price            = VALUES(price),
  tag              = VALUES(tag),
  image_url        = VALUES(image_url),
  description      = VALUES(description),
  featured         = VALUES(featured),
  low_stock_threshold = VALUES(low_stock_threshold),
  updated_at       = NOW();
