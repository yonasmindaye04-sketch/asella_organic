-- ═══════════════════════════════════════════════════════════════════
-- 011_drop_inventory_trigger.sql
-- Asella Organic — Remove redundant MySQL trigger.
--
-- The trigger trg_deduct_inventory_on_delivered was deducting stock a
-- second time AFTER the application code (deductOrderStock in orders.ts)
-- already did it. This caused every delivered order to double-deduct.
--
-- The application code handles stock deduction atomically with proper
-- error handling (insufficient stock checks + rollback). The trigger is
-- not needed.
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_deduct_inventory_on_delivered;

INSERT IGNORE INTO migrations_log (filename) VALUES ('011_drop_inventory_trigger.sql');
SELECT '011_drop_inventory_trigger.sql applied successfully.' AS result;
