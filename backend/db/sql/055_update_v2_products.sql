-- ===================================================================
-- 055_update_v2_products.sql
-- Asella Organic — Canonical v2 Catalog Upsert (Groups & Products)
--
-- Source of truth: backend/data/catalog-active.csv
-- 23 canonical product groups & 36 canonical product variants.
-- Fully idempotent (INSERT ... ON DUPLICATE KEY UPDATE).
-- ===================================================================

-- ── 1. product_groups (23 parent groups) ──────────────────────────
CREATE TABLE IF NOT EXISTS product_groups (
  id          CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  image_url   TEXT         NULL,
  featured    TINYINT(1)   NOT NULL DEFAULT 0,
  tag         VARCHAR(100) NOT NULL DEFAULT '',
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_groups_slug (slug),
  UNIQUE KEY uq_product_groups_name (name)
) ENGINE=InnoDB;

INSERT INTO product_groups (id, name, slug, description, image_url, featured, tag, active)
VALUES
  ('35d4df5a-49e0-4f12-891c-540026c8d4ae', 'Asella Frankincense Raw', 'asella-frankincense-raw', 'Premium natural resin traditionally used for relaxation and aromatic wellness. 100g.', '/image/products/Asella Frankincense Raw.jpeg', 0, 'Traditional', 1),
  ('8bf63c1a-bd1b-4e2e-bdc9-16cfe39d5662', 'Asella Kerbe Raw', 'asella-kerbe-raw', 'Natural myrrh resin valued for its traditional wellness and aromatic benefits. 100g.', '/image/products/Kerbe Powder ( 100g ).png', 0, 'Traditional', 1),
  ('7a980848-bf8f-47c4-a64f-23a8a127747e', 'Ashewagenda (Himalya) Tablet', 'ashewagenda-himalya-tablet', 'Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.', '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', 0, 'Herbs', 1),
  ('37fa5469-0c3a-4668-943b-bf43f6f98dc6', 'Ashewagenda powder', 'ashewagenda-powder', 'Traditionally used to help reduce stress, improve focus, and support daily vitality', '/image/products/Ashwegdna Powder 250g.png', 0, 'Herbs', 1),
  ('539556da-4da0-458b-8ce9-8a7ae61ac795', 'Blackseed Oil', 'blackseed-oil', 'Rich in antioxidants and traditionally used to support immune health, skin wellness, and overall vitality. 30ml.', 'https://res.cloudinary.com/yrlvhvmf/image/upload/v1791869785/asella-organic/rm8evvzv8nnyhygg2eq2.png', 1, 'Traditional', 1),
  ('eb37f97b-ea82-4421-a16b-bb28ca33a045', 'Chebe Powder', 'chebe-powder', 'Traditionally used to nourish hair, improve moisture retention, and reduce breakage. 100g.', '/image/products/Chebe powder  ( 100g ).png', 0, 'Traditional', 1),
  ('29505320-9a8b-4fb8-8ccd-d2946ce40cad', 'Chia Seed', 'chia-seed', 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', '/image/products/Chiaseed 250g and 1kg.png', 1, 'Superfood', 1),
  ('f4624d17-1d9c-42e4-8aa5-c9c6daf13ad7', 'Cinnamon', 'cinnamon', 'Rich in antioxidants and commonly used to support metabolic wellness. 100g.', '/image/products/Cinnamon.png', 0, 'Traditional', 1),
  ('be6e97b4-d25e-4e54-988a-6be3ce41068f', 'Cloves', 'cloves', 'Rich in antioxidants and traditionally used to support oral and digestive health. 100g.', '/image/products/Cloves.png', 0, 'Traditional', 1),
  ('ff986426-435b-45a4-8d57-3a29fb298e5b', 'Coffee', 'coffee', 'Premium Ethiopian coffee that delivers rich flavor, energy, and mental alertness. 500g.', '/image/products/Coffee.png', 0, 'Traditional', 1),
  ('7ab8fffc-f961-4884-b464-0d61b8580cee', 'Erde', 'erde', 'Contains natural compounds that support overall wellness and antioxidant protection. 200g.', '/image/products/Erid Turmeric ( 220g ).png', 0, 'Traditional', 1),
  ('6ebb5b28-810b-4edf-8ad5-02c19c0f67d0', 'Frankincense Oil', 'frankincense-oil', 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 30ml.', '/image/products/Frankincense Oil  30ml and 60 ml.jpeg', 1, 'Oils', 1),
  ('8d238a94-4429-4e3a-a69d-c76801de8b06', 'Himalayan Shilajit Jell', 'himalayan-shilajit-jell', 'Concentrated Himalayan Shilajit jelly supporting energy, strength, and cognitive function. 20g.', '/image/products/Shilajit Oil.png', 0, 'Superfood', 0),
  ('4dbae771-1f95-494d-aaa8-48e0785e30f6', 'Kerbe Powder', 'kerbe-powder', 'Traditionally used to support digestive comfort and general well-being. 100g.', '/image/products/Kerbe Powder ( 100g ).png', 0, 'Traditional', 1),
  ('8a8562af-74d1-4aba-bfba-fc680a2d0106', 'Kerebe (Myrrh) Oil', 'kerebe-myrrh-oil', 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.', '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png', 1, 'Oils', 1),
  ('fb64c101-edc0-4a33-a81d-fcbcd23e397a', 'Kerkede Leafe', 'kerkede-leafe', 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', '/image/products/Hibiscus ( 100g ).png', 0, 'Traditional', 1),
  ('bf3d42d3-4cd8-43a2-8eae-38df245f8ca3', 'Kesil Powder', 'kesil-powder', 'Traditionally used in natural beauty routines to support healthy-looking skin. 200g.', '/image/products/Qasil Powder ( 200g ).png', 0, 'Traditional', 1),
  ('77804e36-c0e7-4cf8-85cc-d05ee92e6dbd', 'Moringa Seed', 'moringa-seed', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 0, 'Herbs', 0),
  ('2f2a7210-c05e-4e55-acbd-5c8f60401098', 'Moringa powder', 'moringa-powder', 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 1, 'Herbs', 1),
  ('fb561b9d-7cd3-49b7-85b7-151fa39618f4', 'Nila Powder', 'nila-powder', 'Popular in natural skincare for promoting brighter and smoother-looking skin. 100g.', '/image/products/Nila Powder 100g.jpeg', 0, 'Traditional', 1),
  ('2bab267e-1b7b-49bc-a876-0cc0ed3f3ed0', 'Pumpkin Seed', 'pumpkin-seed', 'Packed with essential nutrients that support heart health and overall wellness.', '/image/products/Pumpkin Seed  100g.jpeg', 0, 'Superfood', 1),
  ('77293cd2-b65f-4e7e-be06-a8bdcc0f9f97', 'Shilajit Gummies', 'shilajit-gummies', 'Supports energy production, stamina, and mental performance with natural mineral compounds.', '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png', 0, 'Superfood', 0),
  ('ad359440-aefc-4f99-8251-6275f9a2b4d7', 'Shilajit Tablet', 'shilajit-tablet', 'Traditionally valued for enhancing vitality, endurance, and overall wellness. 60 count.', '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png', 0, 'Superfood', 1)
ON DUPLICATE KEY UPDATE
  name        = VALUES(name),
  slug        = VALUES(slug),
  description = VALUES(description),
  image_url   = VALUES(image_url),
  featured    = VALUES(featured),
  tag         = VALUES(tag),
  active      = VALUES(active),
  updated_at  = NOW();

-- ── 2. products (36 variants across the 23 groups) ────────────────
INSERT INTO products (
  id,
  product_group_id,
  name,
  package_size,
  sku,
  size_value,
  size_unit,
  sort_order,
  price,
  unit_cost,
  description,
  image_url,
  featured,
  tag,
  inventory_quantity,
  low_stock_threshold,
  active,
  active_unique,
  created_at,
  updated_at
) VALUES
  ('11111111-0001-0001-0001-000000000029', '35d4df5a-49e0-4f12-891c-540026c8d4ae', 'Asella Frankincense Raw', '100g', 'ASL-11111111-100G', 100.0, 'g', 100, 800.0, 621.0, 'Premium natural resin traditionally used for relaxation and aromatic wellness. 100g.', '/image/products/Asella Frankincense Raw.jpeg', 0, 'Traditional', 4, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000014', '8bf63c1a-bd1b-4e2e-bdc9-16cfe39d5662', 'Asella Kerbe Raw', '100g', 'ASL-11111111-100G-1', 100.0, 'g', 100, 800.0, 621.0, 'Natural myrrh resin valued for its traditional wellness and aromatic benefits. 100g.', '/image/products/Kerbe Powder ( 100g ).png', 0, 'Traditional', 11, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000007', '7a980848-bf8f-47c4-a64f-23a8a127747e', 'Ashewagenda (Himalya) Tablet', '60 Tablet', 'ASL-11111111-60TABLET', 60.0, 'tablet', 60, 2500.0, 1800.09, 'Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.', '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', 0, 'Herbs', 29, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000006', '7a980848-bf8f-47c4-a64f-23a8a127747e', 'Ashewagenda (Himalya) Tablet', '120 Tablet', 'ASL-11111111-120TABLET', 120.0, 'tablet', 120, 4500.0, 4125.0, 'Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.', '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', 0, 'Herbs', 0, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000032', '37fa5469-0c3a-4668-943b-bf43f6f98dc6', 'Ashewagenda powder', '100g', 'ASL-11111111-100G-8', 100.0, 'g', 100, 1200.0, 1035.0, 'Traditionally used to help reduce stress, improve focus, and support daily vitality', '/image/products/Ashwegdna Powder 250g.png', 0, 'Herbs', 0, 10, 0, NULL, '2026-11-01 04:20:36', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000033', '37fa5469-0c3a-4668-943b-bf43f6f98dc6', 'Ashewagenda powder', '250g', 'ASL-11111111-250G-1', 250.0, 'g', 250, 2900.0, 2505.0, 'Traditionally used to help reduce stress, improve focus, and support daily vitality', '/image/products/Ashwegdna Powder 250g.png', 0, 'Herbs', 0, 10, 0, NULL, '2026-11-01 04:20:36', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000005', '37fa5469-0c3a-4668-943b-bf43f6f98dc6', 'Ashewagenda powder', '300g', 'ASL-11111111-300G', 300.0, 'g', 300, 3500.0, 3020.0, 'Traditionally used to help reduce stress, improve focus, and support daily vitality', '/image/products/Ashwegdna Powder 250g.png', 0, 'Herbs', 8, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000027', '539556da-4da0-458b-8ce9-8a7ae61ac795', 'Blackseed Oil', '30ml', 'ASL-11111111-30ML', 30.0, 'ml', 30, 800.0, 525.5, 'Rich in antioxidants and traditionally used to support immune health, skin wellness, and overall vitality. 30ml.', 'https://res.cloudinary.com/yrlvhvmf/image/upload/v1791869785/asella-organic/rm8evvzv8nnyhygg2eq2.png', 1, 'Traditional', 6, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('6aa93233-105c-450d-9a4b-743efa1ab59e', '539556da-4da0-458b-8ce9-8a7ae61ac795', 'Blackseed Oil', '250 ml', 'ASL-6AA93233-250ML', 250.0, 'ml', 250, 3000.0, 2900.0, 'Rich in antioxidants and traditionally used to support immune health, skin wellness, and overall vitality. 250ml.', 'https://res.cloudinary.com/yrlvhvmf/image/upload/v1791869785/asella-organic/rm8evvzv8nnyhygg2eq2.png', 1, 'Traditional', 9, 10, 1, 1.0, '2026-11-01 04:20:36', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000017', 'eb37f97b-ea82-4421-a16b-bb28ca33a045', 'Chebe Powder', '100g', 'ASL-11111111-100G-2', 100.0, 'g', 100, 1000.0, 833.33, 'Traditionally used to nourish hair, improve moisture retention, and reduce breakage. 100g.', '/image/products/Chebe powder  ( 100g ).png', 0, 'Traditional', 13, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:58'),
  ('11111111-0001-0001-0001-000000000011', '29505320-9a8b-4fb8-8ccd-d2946ce40cad', 'Chia Seed', '250g', 'ASL-11111111-250G', 250.0, 'g', 250, 800.0, 621.0, 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', '/image/products/Chiaseed 250g and 1kg.png', 1, 'Superfood', 91, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000012', '29505320-9a8b-4fb8-8ccd-d2946ce40cad', 'Chia Seed', '1kg', 'ASL-11111111-1KG', 1.0, 'kg', 1000, 3000.0, 2149.7, 'Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health', '/image/products/Chiaseed 250g and 1kg.png', 1, 'Superfood', 26, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000030', 'f4624d17-1d9c-42e4-8aa5-c9c6daf13ad7', 'Cinnamon', '100g', 'ASL-11111111-100G-3', 100.0, 'g', 100, 600.0, 501.6, 'Rich in antioxidants and commonly used to support metabolic wellness. 100g.', '/image/products/Cinnamon.png', 0, 'Traditional', 41, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000025', 'be6e97b4-d25e-4e54-988a-6be3ce41068f', 'Cloves', '100g', 'ASL-11111111-100G-4', 100.0, 'g', 100, 400.0, 312.0, 'Rich in antioxidants and traditionally used to support oral and digestive health. 100g.', '/image/products/Cloves.png', 0, 'Traditional', 49, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000019', 'ff986426-435b-45a4-8d57-3a29fb298e5b', 'Coffee', '500g', 'ASL-11111111-500G', 500.0, 'g', 500, 800.0, 621.0, 'Premium Ethiopian coffee that delivers rich flavor, energy, and mental alertness. 500g.', '/image/products/Coffee.png', 0, 'Traditional', 0, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000018', '7ab8fffc-f961-4884-b464-0d61b8580cee', 'Erde', '200g', 'ASL-11111111-200G', 200.0, 'g', 200, 450.0, 360.0, 'Contains natural compounds that support overall wellness and antioxidant protection. 200g.', '/image/products/Erid Turmeric ( 220g ).png', 0, 'Traditional', 34, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000023', '6ebb5b28-810b-4edf-8ad5-02c19c0f67d0', 'Frankincense Oil', '30ml', 'ASL-11111111-30ML-1', 30.0, 'ml', 30, 1500.0, 900.05, 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 30ml.', '/image/products/Frankincense Oil  30ml and 60 ml.jpeg', 1, 'Oils', 18, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000024', '6ebb5b28-810b-4edf-8ad5-02c19c0f67d0', 'Frankincense Oil', '60ml', 'ASL-11111111-60ML', 60.0, 'ml', 60, 2900.0, 2320.0, 'Promotes healthy-looking skin and a relaxing aromatic experience also promotes emotional well-being. 30ml.', '/image/products/Frankincense Oil  30ml and 60 ml.jpeg', 1, 'Oils', 0, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000010', '8d238a94-4429-4e3a-a69d-c76801de8b06', 'Himalayan Shilajit Jell', '20g', 'ASL-11111111-20G', 20.0, 'g', 20, 5000.0, 3460.0, 'Concentrated Himalayan Shilajit jelly supporting energy, strength, and cognitive function. 20g.', '/image/products/Shilajit Oil.png', 0, 'Superfood', 0, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000013', '4dbae771-1f95-494d-aaa8-48e0785e30f6', 'Kerbe Powder', '100g', 'ASL-11111111-100G-6', 100.0, 'g', 100, 800.0, 621.0, 'Traditionally used to support digestive comfort and general well-being. 100g.', '/image/products/Kerbe Powder ( 100g ).png', 0, 'Traditional', 38, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000021', '8a8562af-74d1-4aba-bfba-fc680a2d0106', 'Kerebe (Myrrh) Oil', '30ml', 'ASL-11111111-30ML-2', 30.0, 'ml', 30, 1500.0, 900.64, 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.', '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png', 1, 'Oils', 51, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000022', '8a8562af-74d1-4aba-bfba-fc680a2d0106', 'Kerebe (Myrrh) Oil', '60ml', 'ASL-11111111-60ML-1', 60.0, 'ml', 60, 2900.0, 1400.22, 'Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.', '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png', 1, 'Oils', 13, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000015', 'fb64c101-edc0-4a33-a81d-fcbcd23e397a', 'Kerkede Leafe', '100g', 'ASL-11111111-100G-5', 100.0, 'g', 100, 500.0, 416.5, 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', '/image/products/Hibiscus ( 100g ).png', 0, 'Traditional', 12, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000016', 'fb64c101-edc0-4a33-a81d-fcbcd23e397a', 'Kerkede Leafe', '200g', 'ASL-11111111-200G-1', 200.0, 'g', 200, 1000.0, 833.0, 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', '/image/products/Hibiscus ( 100g ).png', 0, 'Traditional', 16, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('e383c401-5ad0-4070-88e6-876a47e86c76', 'fb64c101-edc0-4a33-a81d-fcbcd23e397a', 'Kerkede Leafe', '400g', 'ASL-E383C401-400G', 400.0, 'g', 400, 2000.0, 1200.0, 'Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea.', '/image/products/Hibiscus ( 100g ).png', 0, 'Traditional', 17, 10, 1, 1.0, '2026-11-01 04:20:36', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000020', 'bf3d42d3-4cd8-43a2-8eae-38df245f8ca3', 'Kesil Powder', '200g', 'ASL-11111111-200G-2', 200.0, 'g', 200, 450.0, 360.0, 'Traditionally used in natural beauty routines to support healthy-looking skin. 200g.', '/image/products/Qasil Powder ( 200g ).png', 0, 'Traditional', 27, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000002', '77804e36-c0e7-4cf8-85cc-d05ee92e6dbd', 'Moringa Seed', '200g', 'ASL-11111111-200G-4', 200.0, 'g', 200, 450.0, 360.0, 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 0, 'Herbs', 0, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000001', '77804e36-c0e7-4cf8-85cc-d05ee92e6dbd', 'Moringa Seed', '500g', 'ASL-11111111-500G-2', 500.0, 'g', 500, 1000.0, 800.0, 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 0, 'Herbs', 0, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000004', '2f2a7210-c05e-4e55-acbd-5c8f60401098', 'Moringa powder', '200g', 'ASL-11111111-200G-3', 200.0, 'g', 200, 350.0, 280.0, 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 1, 'Herbs', 372, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000003', '2f2a7210-c05e-4e55-acbd-5c8f60401098', 'Moringa powder', '500g', 'ASL-11111111-500G-1', 500.0, 'g', 500, 750.0, 608.33, 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 1, 'Herbs', 10, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000031', '2f2a7210-c05e-4e55-acbd-5c8f60401098', 'Moringa powder', '1kg', 'ASL-11111111-1KG-1', 1.0, 'kg', 1000, 1100.0, 880.0, 'Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.', '/image/products/Moringa 200g,500g and 1kg.png', 1, 'Herbs', 50, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000028', 'fb561b9d-7cd3-49b7-85b7-151fa39618f4', 'Nila Powder', '100g', 'ASL-11111111-100G-7', 100.0, 'g', 100, 1000.0, 833.3, 'Popular in natural skincare for promoting brighter and smoother-looking skin. 100g.', '/image/products/Nila Powder 100g.jpeg', 0, 'Traditional', 21, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000034', '2bab267e-1b7b-49bc-a876-0cc0ed3f3ed0', 'Pumpkin Seed', '100g', 'ASL-11111111-100G-9', 100.0, 'g', 100, 250.0, 209.0, 'Packed with essential nutrients that support heart health and overall wellness.', '/image/products/Pumpkin Seed  100g.jpeg', 0, 'Superfood', 0, 10, 0, NULL, '2026-11-01 04:20:36', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000026', '2bab267e-1b7b-49bc-a876-0cc0ed3f3ed0', 'Pumpkin Seed', '300g', 'ASL-11111111-300G-1', 300.0, 'g', 300, 600.0, 501.6, 'Packed with essential nutrients that support heart health and overall wellness.', '/image/products/Pumpkin Seed  100g.jpeg', 0, 'Superfood', 14, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000008', '77293cd2-b65f-4e7e-be06-a8bdcc0f9f97', 'Shilajit Gummies', '30 Gummies', 'ASL-11111111-30GUMMIES', 30.0, 'gummies', 30, 4000.0, 3200.0, 'Supports energy production, stamina, and mental performance with natural mineral compounds.', '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png', 0, 'Superfood', 0, 10, 0, NULL, '2026-06-24 23:12:16', '2026-11-01 17:09:59'),
  ('11111111-0001-0001-0001-000000000009', 'ad359440-aefc-4f99-8251-6275f9a2b4d7', 'Shilajit Tablet', '60 Tablet', 'ASL-11111111-60TABLET-1', 60.0, 'tablet', 60, 4500.0, 3028.92, 'Traditionally valued for enhancing vitality, endurance, and overall wellness. 60 count.', '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png', 0, 'Superfood', 6, 10, 1, 1.0, '2026-06-24 23:12:16', '2026-11-01 17:09:59')
ON DUPLICATE KEY UPDATE
  product_group_id    = VALUES(product_group_id),
  name                = VALUES(name),
  package_size        = VALUES(package_size),
  sku                 = VALUES(sku),
  size_value          = VALUES(size_value),
  size_unit           = VALUES(size_unit),
  sort_order          = VALUES(sort_order),
  price               = VALUES(price),
  unit_cost           = VALUES(unit_cost),
  description         = VALUES(description),
  image_url           = VALUES(image_url),
  featured            = VALUES(featured),
  tag                 = VALUES(tag),
  inventory_quantity  = VALUES(inventory_quantity),
  low_stock_threshold = VALUES(low_stock_threshold),
  active              = VALUES(active),
  active_unique       = VALUES(active_unique),
  updated_at          = VALUES(updated_at);

-- ── 3. Migration Log Entry ────────────────────────────────────────
INSERT IGNORE INTO migrations_log (filename) VALUES ('055_update_v2_products.sql');
SELECT '055_update_v2_products.sql applied' AS result;