ALTER TABLE expenses
  ADD COLUMN voided_at   DATETIME NULL,
  ADD COLUMN voided_by   CHAR(36) NULL,
  ADD COLUMN void_reason VARCHAR(255) NULL,
  ADD CONSTRAINT fk_expense_voided_by FOREIGN KEY (voided_by) REFERENCES staff_users(id) ON DELETE SET NULL;

INSERT IGNORE INTO migrations_log (filename) VALUES ('017_expense_void.sql');
