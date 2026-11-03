-- Migration: Add location to staff_users for store branch assignment
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS location VARCHAR(255) NULL AFTER phone;

INSERT IGNORE INTO migrations_log (filename) VALUES ('058_staff_location.sql');
