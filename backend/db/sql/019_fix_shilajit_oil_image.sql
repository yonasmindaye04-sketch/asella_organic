-- ============================================================
-- 019_fix_shilajit_oil_image.sql
-- Fix the broken image_url for Shilajit Oil product
-- The seed had a typo: 'Neuherb Shilajit gel 20g.png' (file does not exist)
-- Correct file on disk is: 'Shilajit Oil.png'
-- ============================================================

UPDATE products
SET image_url = '/image/products/Shilajit Oil.png'
WHERE id = '11111111-0001-0001-0001-000000000010'
  AND image_url = '/image/products/Neuherb Shilajit gel 20g.png';
