-- ===================================================================
-- 039_v2_order_total_audit.sql
-- Asella Organic — order_total_audit table
--
-- Records order-total mismatches (orders.total vs SUM of line items).
-- Read-only audit: it never changes orders.total or any line price.
-- Populated by the map-order-items data migration script.
--
-- Charset: utf8 / utf8_unicode_ci.
-- ===================================================================

CREATE TABLE IF NOT EXISTS order_total_audit (
  id             CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  order_id       VARCHAR(50)  NOT NULL,
  old_total      DECIMAL(12,2) NOT NULL,
  line_total     DECIMAL(12,2) NOT NULL,
  proposed_total DECIMAL(12,2) NULL,
  status         ENUM('open','approved','rejected','applied') NOT NULL DEFAULT 'open',
  reason         VARCHAR(255) NULL,
  reviewed_by    CHAR(36)     NULL,
  reviewed_at    DATETIME     NULL,
  applied_at     DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_total_audit_order (order_id),
  CONSTRAINT fk_order_total_audit_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

INSERT IGNORE INTO migrations_log (filename) VALUES ('039_v2_order_total_audit.sql');

SELECT '039_v2_order_total_audit.sql applied' AS result;
