-- ===================================================================
-- 060_clean_city_spaces_and_smeared_prices.sql
-- Asella Organic -- Clean duplicate city whitespace & normalize locations
-- ===================================================================
-- 
-- 1. Collapses double/multiple spaces inside orders.city and customers.city
--    (e.g., 'Piassa  Shop' -> 'Piassa Shop', 'Bole  Rwanda' -> 'Bole Rwanda')
--    which caused 'Piassa Shop' to appear twice on Sales by Location.
-- 2. Normalizes multiple spaces in location fields.
-- 3. Idempotent and safe to run on existing databases.
-- ===================================================================

-- Clean double or multiple consecutive spaces in orders.city
UPDATE orders
SET city = TRIM(REGEXP_REPLACE(city, '[[:space:]]+', ' '))
WHERE city REGEXP '[[:space:]]{2,}';

-- Clean double or multiple consecutive spaces in orders.location
UPDATE orders
SET location = TRIM(REGEXP_REPLACE(location, '[[:space:]]+', ' '))
WHERE location REGEXP '[[:space:]]{2,}';

-- Clean double or multiple consecutive spaces in customers.city
UPDATE customers
SET city = TRIM(REGEXP_REPLACE(city, '[[:space:]]+', ' '))
WHERE city REGEXP '[[:space:]]{2,}';

-- Clean double or multiple consecutive spaces in customers.location
UPDATE customers
SET location = TRIM(REGEXP_REPLACE(location, '[[:space:]]+', ' '))
WHERE location REGEXP '[[:space:]]{2,}';
