-- Migration: Ensure stock_requests.package_size column exists on production
-- Run this on your production database if the column does not exist yet.
-- This is safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE stock_requests
  MODIFY COLUMN status ENUM('pending','ordered','received','cancelled','rejected','returned') DEFAULT 'pending';

-- Add package_size column if it doesn't already exist
-- (MySQL doesn't support IF NOT EXISTS for ADD COLUMN in all versions, so we use a procedure)
DROP PROCEDURE IF EXISTS _add_package_size_col;
DELIMITER //
CREATE PROCEDURE _add_package_size_col()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'stock_requests'
      AND COLUMN_NAME = 'package_size'
  ) THEN
    ALTER TABLE stock_requests ADD COLUMN package_size VARCHAR(100) NULL AFTER item;
  END IF;
END //
DELIMITER ;
CALL _add_package_size_col();
DROP PROCEDURE IF EXISTS _add_package_size_col;
