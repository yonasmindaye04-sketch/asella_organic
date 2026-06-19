-- Migration 008: soft-delete audit columns
--
-- Adds `deleted_by`, `deleted_at_ip`, and `deleted_reason` columns to
-- soft-deletable tables. These let the team answer "who deleted this
-- order, from what IP, and why" — important for compliance, abuse
-- investigation, and accidental-delete recovery.
--
-- 008_soft_delete_audit.sql
--
-- NOTE: `ADD COLUMN IF NOT EXISTS` is MySQL 8.0.3+ only. We use
-- INFORMATION_SCHEMA checks via stored procedures to stay compatible
-- with MySQL 5.7 and all 8.x versions used in CI/prod.

-- ─────────────────────────────────────────────
-- Helper: add a column only if it doesn't exist
-- Usage: CALL _add_col('table', 'column', 'COLUMN_DEFINITION');
-- ─────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col;

DELIMITER //

CREATE PROCEDURE _add_col(
  IN tbl  VARCHAR(64),
  IN col  VARCHAR(64),
  IN defn TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = BINARY DATABASE()
      AND TABLE_NAME   = BINARY tbl
      AND COLUMN_NAME  = BINARY col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', defn);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

DELIMITER ;

-- ─────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────
CALL _add_col('orders', 'deleted_by',     'CHAR(36)     NULL');
CALL _add_col('orders', 'deleted_at_ip',  'VARCHAR(45)  NULL');
CALL _add_col('orders', 'deleted_reason', 'VARCHAR(500) NULL');

-- FK: orders.deleted_by → staff_users.id (add only if missing)
DROP PROCEDURE IF EXISTS _add_orders_fk;

DELIMITER //

CREATE PROCEDURE _add_orders_fk()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA    = BINARY DATABASE()
      AND TABLE_NAME      = BINARY 'orders'
      AND CONSTRAINT_NAME = BINARY 'fk_orders_deleted_by'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT fk_orders_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES staff_users(id)
        ON DELETE SET NULL;
  END IF;
END //

DELIMITER ;

CALL _add_orders_fk();
DROP PROCEDURE IF EXISTS _add_orders_fk;

-- ─────────────────────────────────────────────
-- Staff users
-- ─────────────────────────────────────────────
CALL _add_col('staff_users', 'deleted_by',     'CHAR(36)     NULL');
CALL _add_col('staff_users', 'deleted_at_ip',  'VARCHAR(45)  NULL');
CALL _add_col('staff_users', 'deleted_reason', 'VARCHAR(500) NULL');

-- ─────────────────────────────────────────────
-- Vendor orders
-- ─────────────────────────────────────────────
CALL _add_col('vendor_orders', 'deleted_by',     'CHAR(36)     NULL');
CALL _add_col('vendor_orders', 'deleted_at_ip',  'VARCHAR(45)  NULL');
CALL _add_col('vendor_orders', 'deleted_reason', 'VARCHAR(500) NULL');

-- ─────────────────────────────────────────────
-- Cleanup helper procedure
-- ─────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col;