-- ═══════════════════════════════════════════════════════════════════
-- APPLY-021-to-033-production.sql
-- Asella Organic — consolidated production migration set
--
-- Generated from backend/db/sql/. Do not edit by hand; edit the sources and
-- regenerate. Contains, in order:
--
--   021_affiliate_hardening        affiliate rules, clawback, commission ledger
--   022_affiliate_reporting        referral clicks, report runs + cron lock
--   023_telegram_miniapp_state…    Mini App persisted state + notifications
--   024_customer_insights          customer activity + ratings  (Customers)
--   025_sms                        SMS tables + consent columns
--   030_sms_campaign_recipients    campaign recipient list (needs 025)
--   033_site_assets                Media Library assets
--
-- WHY CONSOLIDATED
--   phpMyAdmin's SQL tab splits on ";" and would truncate the two trigger
--   bodies in 021. Run this through the IMPORT tab, which keeps them intact.
--
-- BACK UP FIRST (phpMyAdmin > select database > Export > Quick > SQL).
-- 021 is the only file that rewrites existing rows: it deletes corrupt and
-- duplicate rows from referral_commissions after copying the duplicates into
-- commission_events, updates the ledger, and inserts expense rows.
--
-- NOT INCLUDED, DELIBERATELY
--   026, 027, 028, 029, 030_seed_edge_cases, 031, 032 — demo fixtures and
--   legacy-data repairs. migrate.cjs refuses these in production and so does
--   this file; several rewrite real order and cost-of-goods data.
--
--   NOT RE-RUNNABLE. There is no transaction: MySQL commits DDL implicitly,
--   so a failure part-way leaves earlier statements applied. This file is
--   NOT safe to re-run — 021 and 023 use bare ALTER TABLE ... ADD COLUMN,
--   which aborts with "Duplicate column name" the second time. CREATE TABLE
--   is guarded with IF NOT EXISTS and the procedure-derived column/index
--   adds are guarded, but the plain ALTERs are not.
--
--   IF THIS FILE ERRORS: restore the backup taken above, fix the cause, then
--   import again from a clean database. Do not simply press Go again.
-- ═══════════════════════════════════════════════════════════════════

-- Six statements store em-dashes/bullets in audit-note strings. Pin the
-- connection charset so phpMyAdmin cannot write them as mojibake.
SET NAMES utf8mb4;

-- Record the three files that do not write their own migrations_log row.
-- Done up front so a mid-run failure still leaves them marked applied.
INSERT IGNORE INTO migrations_log (filename) VALUES
  ('023_telegram_miniapp_state_notifications.sql'),
  ('024_customer_insights.sql'),
  ('030_sms_campaign_recipients.sql');

-- ── Verify the database is in the expected state before anything destructive ──
-- Expected: affiliate_commission_rules and site_assets do NOT exist yet.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN ('affiliate_commission_rules','commission_events','customer_activity',
                      'customer_ratings','site_assets','sms_campaigns')
 ORDER BY table_name;

-- ═══════════════════════════════════════════════════════════════════
-- 021_affiliate_hardening.sql
-- Asella Organic — Affiliate Commission Hardening
--
-- Fixes pre-existing defects and adds the tables needed for
-- per-affiliate rules, reversals and an audit trail.
--
--  1. expenses.category: add affiliate_payout + affiliate_clawback
--     (the code has always written these, but no migration ever added
--      them to the ENUM, so every "Mark Paid" call was failing)
--  2. affiliate_profiles: soft delete, rule scope, clawback balance
--  3. affiliate_commission_rules: per-affiliate overrides
--  4. referral_commissions: 'reversed' status + reversal/clawback columns
--  5. commission_events: append-only audit trail
--  6. Data cleanup: purge corrupt partial inserts, collapse duplicates
--  7. One commission per (order, affiliate) — enforced by a UNIQUE index
--  8. Recompute denormalised affiliate totals from the ledger
--  9. Replace the delivery trigger: per-affiliate precedence + fixed-type cap
-- 10. Add the reversal trigger (Delivered -> Cancelled/Returned)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. expenses.category ───────────────────────────────────────────────────
-- Must keep every pre-existing value or MySQL will renumber the ENUM and
-- silently corrupt existing rows.
ALTER TABLE expenses
  MODIFY COLUMN category
    ENUM('vendor_purchase','operational','salary','other','affiliate_payout','affiliate_clawback')
    NOT NULL DEFAULT 'vendor_purchase';

-- ── 2. affiliate_profiles ──────────────────────────────────────────────────
ALTER TABLE affiliate_profiles
  ADD COLUMN deleted_at       DATETIME        NULL                        AFTER is_active,
  ADD COLUMN rule_type        ENUM('global','custom') NOT NULL DEFAULT 'global',
  ADD COLUMN clawback_pending DECIMAL(12,2)   NOT NULL DEFAULT 0,
  ADD COLUMN last_login_at    DATETIME        NULL,
  ADD INDEX  idx_affiliate_deleted (deleted_at);

-- ── 3. Per-affiliate commission rules ─────────────────────────────────────
-- Exactly one rule row per affiliate (upserted). rule_type on the profile
-- decides whether the row is consulted at all, so deactivating a rule
-- cleanly falls back to the global config instead of silently paying zero.
CREATE TABLE IF NOT EXISTS affiliate_commission_rules (
    id               CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    affiliate_id     CHAR(36)      NOT NULL,
    commission_type  ENUM('percentage','fixed') NOT NULL,
    commission_value DECIMAL(12,2) NOT NULL CHECK (commission_value >= 0),
    min_order_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    max_commission   DECIMAL(12,2) NULL,
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_affiliate_rule (affiliate_id),
    FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id) ON DELETE CASCADE
);

-- ── 4. referral_commissions lifecycle ─────────────────────────────────────
ALTER TABLE referral_commissions
  MODIFY COLUMN status ENUM('pending','paid','reversed') NOT NULL DEFAULT 'pending',
  ADD COLUMN rule_source          ENUM('global','individual') NOT NULL DEFAULT 'global',
  ADD COLUMN order_status_at_credit VARCHAR(50)  NULL,
  ADD COLUMN reversed_at          DATETIME       NULL,
  ADD COLUMN reversal_reason      VARCHAR(255)   NULL,
  ADD COLUMN clawback_settled     TINYINT(1)     NOT NULL DEFAULT 0,
  ADD COLUMN paid_by              CHAR(36)       NULL,
  ADD COLUMN updated_at           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_commission_status (status);

-- ── 4b. Forced password change for provisioned affiliate logins ────────────
-- Set when an admin creates portal access via /affiliates/:id/portal-access.
ALTER TABLE staff_users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 5. Append-only audit trail ────────────────────────────────────────────
-- Every credit / pay / reverse / clawback lands here. referral_commissions
-- stays the live ledger; this table is what makes it reconstructable.
CREATE TABLE IF NOT EXISTS commission_events (
    id            CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    commission_id CHAR(36)     NOT NULL,
    affiliate_id  CHAR(36)     NOT NULL,
    order_id      VARCHAR(50)  NULL,
    event_type    ENUM('CREDITED','PAID','REVERSED','CLAWBACK','DEDUPLICATED') NOT NULL,
    from_status   VARCHAR(50)  NULL,
    to_status     VARCHAR(50)  NULL,
    amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    actor         CHAR(36)     NULL,
    note          VARCHAR(500) NULL,
    occurred_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_commission_events_commission (commission_id),
    INDEX idx_commission_events_affiliate  (affiliate_id, occurred_at)
);

-- ── 6a. Purge corrupt partial inserts ─────────────────────────────────────
-- The old order-creation path inserted only (id, affiliate_id, order_id,
-- commission_amount, status) — leaving three NOT NULL columns NULL. Those
-- rows are unreadable garbage, not financial history.
DELETE FROM referral_commissions
WHERE commission_type IS NULL OR commission_value IS NULL OR order_total IS NULL;

-- ── 6b. Collapse duplicates into the audit trail, then remove them ───────
-- Path A (order creation) and Path B (delivery trigger) both credited the
-- same order, so live data contains double payouts. Preserve the losing row
-- in commission_events, then drop it so the UNIQUE index below can be built.
INSERT INTO commission_events
    (id, commission_id, affiliate_id, order_id, event_type,
     from_status, to_status, amount, note)
SELECT UUID(), dup.id, dup.affiliate_id, dup.order_id, 'DEDUPLICATED',
       dup.status, 'reversed', dup.commission_amount,
       'Duplicate commission collapsed by migration 021 (pre-fix double credit)'
FROM      referral_commissions dup
JOIN      referral_commissions keep
       ON  dup.order_id     = keep.order_id
       AND dup.affiliate_id = keep.affiliate_id
       AND dup.id           >  keep.id
WHERE dup.order_id IS NOT NULL;

DELETE dup
FROM   referral_commissions dup
JOIN   referral_commissions keep
       ON  dup.order_id     = keep.order_id
       AND dup.affiliate_id = keep.affiliate_id
       AND dup.id           >  keep.id
WHERE dup.order_id IS NOT NULL;

-- ── 7. One commission per order per affiliate ─────────────────────────────
-- This is what makes crediting idempotent: a repeated Delivered transition
-- can no longer produce a second payout.
CREATE UNIQUE INDEX uq_commission_order_affiliate
  ON referral_commissions(order_id, affiliate_id);

-- ── 8. Recompute denormalised totals from the ledger ──────────────────────
-- Only the trigger used to maintain these, so they had drifted from reality.
UPDATE affiliate_profiles ap
LEFT JOIN (
    SELECT affiliate_id,
           COALESCE(SUM(commission_amount), 0) AS earned
    FROM referral_commissions
    WHERE status <> 'reversed'
    GROUP BY affiliate_id
) agg ON agg.affiliate_id = ap.id
LEFT JOIN (
    SELECT referred_by_affiliate_id AS affiliate_id, COUNT(*) AS customers
    FROM customers
    WHERE referred_by_affiliate_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY referred_by_affiliate_id
) cus ON cus.affiliate_id = ap.id
SET ap.total_earnings  = COALESCE(agg.earned, 0),
    ap.total_referrals = COALESCE(cus.customers, 0),
    ap.updated_at      = NOW();

-- ═══════════════════════════════════════════════════════════════════
-- 9. Delivery trigger — single source of truth for crediting
-- ═══════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_order_delivered_commission;

DELIMITER $$

CREATE TRIGGER trg_order_delivered_commission
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
    DECLARE v_affiliate_id   CHAR(36);
    DECLARE v_comm_type      VARCHAR(50);
    DECLARE v_comm_value     DECIMAL(12,2);
    DECLARE v_min_order      DECIMAL(12,2);
    DECLARE v_max_comm       DECIMAL(12,2);
    DECLARE v_amount         DECIMAL(12,2);
    DECLARE v_rule_source    VARCHAR(20);
    DECLARE v_commission_id  CHAR(36);
    DECLARE v_now            DATETIME;

    -- Only on the transition INTO Delivered. Re-saving the same status, or
    -- any other status change, must never create a second commission.
    IF NEW.status = 'Delivered' AND (OLD.status IS NULL OR OLD.status <> 'Delivered') THEN

        SET v_now = NOW();

        SELECT referred_by_affiliate_id INTO v_affiliate_id
        FROM   customers
        WHERE  id = NEW.customer_id;

        IF v_affiliate_id IS NOT NULL THEN

            -- Rule precedence: an individual rule wins when the profile is
            -- explicitly scoped to it AND that rule is active. Otherwise
            -- fall back to the global active config.
            SELECT r.commission_type, r.commission_value,
                   r.min_order_amount, r.max_commission
            INTO   v_comm_type, v_comm_value, v_min_order, v_max_comm
            FROM   affiliate_profiles ap
            JOIN   affiliate_commission_rules r
                   ON r.affiliate_id = ap.id AND r.is_active = TRUE
            WHERE  ap.id = v_affiliate_id
              AND  ap.rule_type = 'custom'
              AND  ap.deleted_at IS NULL
            LIMIT  1;

            IF v_comm_type IS NOT NULL THEN
                SET v_rule_source = 'individual';
            ELSE
                SET v_comm_type = NULL;
                SELECT commission_type, commission_value,
                       min_order_amount, max_commission
                INTO   v_comm_type, v_comm_value, v_min_order, v_max_comm
                FROM   referral_configs
                WHERE  is_active = TRUE
                ORDER  BY created_at DESC
                LIMIT  1;
                SET v_rule_source = 'global';
            END IF;

            IF v_comm_type IS NOT NULL AND NEW.total >= IFNULL(v_min_order, 0) THEN

                IF v_comm_type = 'percentage' THEN
                    SET v_amount = (NEW.total * v_comm_value) / 100.0;
                ELSE
                    SET v_amount = v_comm_value;
                END IF;

                -- Cap applies to fixed commissions too. The old app path
                -- skipped this for fixed rules; the trigger did not.
                IF v_max_comm IS NOT NULL AND v_amount > v_max_comm THEN
                    SET v_amount = v_max_comm;
                END IF;

                -- Never pay out more than the order was worth.
                IF v_amount > NEW.total THEN
                    SET v_amount = NEW.total;
                END IF;

                IF v_amount > 0 THEN
                    SET v_commission_id = UUID();

                    INSERT INTO referral_commissions (
                        id, affiliate_id, customer_id, order_id,
                        commission_type, commission_value, order_total,
                        commission_amount, status, rule_source,
                        order_status_at_credit
                    ) VALUES (
                        v_commission_id, v_affiliate_id, NEW.customer_id, NEW.id,
                        v_comm_type, v_comm_value, NEW.total,
                        v_amount, 'pending', v_rule_source, NEW.status
                    );

                    INSERT INTO commission_events (
                        id, commission_id, affiliate_id, order_id,
                        event_type, from_status, to_status, amount, note
                    ) VALUES (
                        UUID(), v_commission_id, v_affiliate_id, NEW.id,
                        'CREDITED', NULL, 'pending', v_amount,
                        CONCAT('Order delivered. Rule source: ', v_rule_source)
                    );

                    -- Recompute rather than increment, so the cached totals
                    -- can never drift from the ledger.
                    UPDATE affiliate_profiles
                    SET    total_earnings = (
                               SELECT COALESCE(SUM(commission_amount), 0)
                               FROM   referral_commissions
                               WHERE  affiliate_id = v_affiliate_id
                                 AND  status <> 'reversed'
                           ),
                           updated_at = NOW()
                    WHERE  id = v_affiliate_id;
                END IF;
            END IF;
        END IF;
    END IF;
END$$

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════════
-- 10. Reversal trigger — Delivered -> Cancelled/Returned
-- ═══════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_order_status_commission_reversal;

DELIMITER $$

CREATE TRIGGER trg_order_status_commission_reversal
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
    DECLARE v_now DATETIME;

    -- Only when leaving Delivered for a void status.
    IF OLD.status = 'Delivered'
       AND NEW.status IN ('Cancelled', 'Returned', 'Issue') THEN

        SET v_now = NOW();

        -- Still pending: the money was never paid out, so simply void it.
        UPDATE referral_commissions
        SET    status          = 'reversed',
               reversed_at     = v_now,
               reversal_reason = CONCAT('Order ', NEW.id, ' moved to ', NEW.status)
        WHERE  order_id  = NEW.id
          AND  status    = 'pending';

        INSERT INTO commission_events (
            id, commission_id, affiliate_id, order_id,
            event_type, from_status, to_status, amount, note
        )
        SELECT UUID(), rc.id, rc.affiliate_id, rc.order_id,
               'REVERSED', 'pending', 'reversed', rc.commission_amount,
               CONCAT('Order ', NEW.id, ' moved to ', NEW.status)
        FROM   referral_commissions rc
        WHERE  rc.order_id = NEW.id
          AND  rc.status   = 'reversed'
          AND  rc.reversed_at = v_now;

        -- Already paid: it stays paid (the money genuinely left), but it
        -- becomes a clawback owed back and is deducted from the next payout.
        UPDATE referral_commissions
        SET    clawback_settled = 1,
               reversal_reason = CONCAT('Order ', NEW.id, ' moved to ', NEW.status,
                                        ' after payout — clawback raised')
        WHERE  order_id        = NEW.id
          AND  status          = 'paid'
          AND  clawback_settled = 0;

        INSERT INTO commission_events (
            id, commission_id, affiliate_id, order_id,
            event_type, from_status, to_status, amount, note
        )
        SELECT UUID(), rc.id, rc.affiliate_id, rc.order_id,
               'CLAWBACK', 'paid', 'paid', rc.commission_amount,
               CONCAT('Clawback raised — order ', NEW.id, ' moved to ', NEW.status)
        FROM   referral_commissions rc
        WHERE  rc.order_id         = NEW.id
          AND  rc.status           = 'paid'
          AND  rc.clawback_settled = 1
          AND  rc.reversal_reason  = CONCAT('Order ', NEW.id, ' moved to ', NEW.status,
                                            ' after payout — clawback raised');

        -- Book the clawbacks as expenses and raise the affiliate's balance.
        INSERT INTO expenses (id, category, description, amount, notes)
        SELECT UUID(), 'affiliate_clawback',
               CONCAT('Affiliate clawback for order ', rc.order_id),
               rc.commission_amount,
               CONCAT('Commission ID: ', rc.id, ' — order voided after payout')
        FROM   referral_commissions rc
        WHERE  rc.order_id         = NEW.id
          AND  rc.status           = 'paid'
          AND  rc.clawback_settled = 1
          AND  rc.reversal_reason  = CONCAT('Order ', NEW.id, ' moved to ', NEW.status,
                                            ' after payout — clawback raised');

        UPDATE affiliate_profiles ap
        SET    ap.clawback_pending = (
                   SELECT COALESCE(SUM(rc.commission_amount), 0)
                   FROM   referral_commissions rc
                   WHERE  rc.affiliate_id      = ap.id
                     AND  rc.status            = 'paid'
                     AND  rc.clawback_settled  = 1
               ),
               ap.total_earnings = (
                   SELECT COALESCE(SUM(rc2.commission_amount), 0)
                   FROM   referral_commissions rc2
                   WHERE  rc2.affiliate_id = ap.id
                     AND  rc2.status      = 'paid'
               ),
               ap.updated_at = NOW()
        WHERE  ap.id IN (SELECT rc3.affiliate_id
                         FROM   referral_commissions rc3
                         WHERE  rc3.order_id = NEW.id);
    END IF;
END$$

DELIMITER ;

INSERT IGNORE INTO migrations_log (filename) VALUES ('021_affiliate_hardening.sql');


-- ═══════════════════════════════════════════════════════════════════
-- 022_affiliate_reporting.sql
-- Asella Organic — Affiliate Engagement + Sales Reporting
--
-- Backs item 5 (sales & engagement emails) and the affiliate portal:
--  1. referral_clicks — every landing on /?ref=CODE, for engagement rates
--  2. report_runs     — idempotency guard so the weekly cron cannot
--                       double-send after a restart
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Referral click tracking ────────────────────────────────────────────
-- Public endpoint, no auth. IP is stored as a truncated hash so we can
-- de-duplicate click counts without retaining a raw personal identifier.
CREATE TABLE IF NOT EXISTS referral_clicks (
    id            CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    affiliate_id  CHAR(36)     NOT NULL,
    referral_code VARCHAR(20)  NOT NULL,
    landing_path  VARCHAR(255) NULL,
    visitor_hash  CHAR(64)     NULL,
    source        VARCHAR(50)  NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_clicks_affiliate (affiliate_id, created_at),
    INDEX idx_clicks_code      (referral_code, created_at),
    FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id) ON DELETE CASCADE
);

-- ── 2. Report send log (weekly cron idempotency) ──────────────────────────
CREATE TABLE IF NOT EXISTS report_runs (
    id            CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    affiliate_id  CHAR(36)     NULL,
    period_start  DATE         NOT NULL,
    period_end    DATE         NOT NULL,
    trigger_type  ENUM('manual','weekly') NOT NULL DEFAULT 'manual',
    recipient     VARCHAR(255) NULL,
    status        ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent',
    error         VARCHAR(500) NULL,
    triggered_by  CHAR(36)     NULL,
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_report_runs_period (period_start, trigger_type)
);

-- ── 3. Weekly run lock ────────────────────────────────────────────────────
-- MySQL has no filtered indexes, so uniqueness for "one weekly run per
-- period" is enforced by a primary key on the period start instead.
-- The cron INSERTs here with IGNORE and skips the send when affectedRows
-- is 0, which makes the weekly job safe to run on multiple instances.
CREATE TABLE IF NOT EXISTS report_run_locks (
    period_start DATE PRIMARY KEY,
    claimed_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO migrations_log (filename) VALUES ('022_affiliate_reporting.sql');


-- ============================================================
-- 023_telegram_miniapp_state_notifications.sql
-- Telegram Mini App: per-customer persisted state, order notifications,
-- and a verified chat_id on orders so customer data no longer depends
-- on the phone number matching.
-- ============================================================

-- ── 1. Persisted Mini App state (cart + preferences) ───────────
-- Keyed by Telegram chat id so a customer's basket and preferences
-- follow them across devices instead of living in one browser.
CREATE TABLE IF NOT EXISTS telegram_user_state (
    chat_id       BIGINT       PRIMARY KEY,
    cart          JSON         NULL,
    preferences   JSON         NULL,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── 2. Customer-scoped notifications ───────────────────────────
-- The existing /api/notifications feed is a staff-only aggregate over
-- stock data. Customers get their own table so order status changes can
-- reach them without exposing internal records.
CREATE TABLE IF NOT EXISTS customer_notifications (
    id            CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    chat_id       BIGINT        NOT NULL,
    order_id      VARCHAR(50)   NULL,
    type          VARCHAR(40)   NOT NULL DEFAULT 'order_update',
    title         VARCHAR(160)  NOT NULL,
    body          TEXT          NULL,
    read_at       DATETIME      NULL,
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cust_notif_chat_created (chat_id, created_at),
    INDEX idx_cust_notif_unread (chat_id, read_at)
);

-- ── 3. Verified Telegram chat id on the order itself ──────────
-- Orders previously joined to customers by phone only, so a customer who
-- typed a different number than the one staff read off the order silently
-- saw an empty Orders tab. Storing the HMAC-verified chat id on the order
-- makes the lookup authoritative.
ALTER TABLE orders
  ADD COLUMN telegram_chat_id BIGINT NULL,
  ADD INDEX idx_orders_telegram_chat (telegram_chat_id);

-- ── 4. Backfill chat ids for historical orders ────────────────
-- Anything ordered through the Mini App already had its chat id written
-- onto the customers row; copy it across so existing history appears.
UPDATE orders o
  JOIN customers c ON c.phone = o.phone
SET o.telegram_chat_id = c.telegram_chat_id
WHERE o.telegram_chat_id IS NULL
  AND c.telegram_chat_id IS NOT NULL
  AND o.source = 'telegram';

-- ============================================================
-- 024_customer_insights.sql
-- Customer movement timeline + customer valuation ("rating").
--
-- Before this migration there was no read surface for the customers
-- table at all: total_orders / total_spent were declared but never
-- written, and a customer's history could only be reconstructed by
-- hand-joining orders + order_status_history + payments.
--
-- Adds:
--   1. customer_activity    — one append-only log row per customer
--                            movement (sale, status change, return,
--                            cancellation, payment, note, rating).
--   2. customer_ratings     — staff-entered 1..5 stars per customer,
--                            independent of the automatic score.
--   3. vw_customer_insights — computes lifetime value, an automatic
--                            0..100 value score, and a segment.
--
-- The score is derived in a VIEW rather than stored in
-- customers.total_orders / total_spent: a stored counter has to be
-- updated from every write path (order create, status change, item
-- edit, delete) and silently goes stale when one of them is missed.
-- ============================================================

-- ── 1. Customer movement timeline ─────────────────────────────────
-- Append-only; rows are never updated, so the timeline is an audit
-- trail. actor_id is nullable because public storefront orders have
-- no staff member behind them.
CREATE TABLE IF NOT EXISTS customer_activity (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    customer_id    CHAR(36)      NOT NULL,
    order_id       VARCHAR(50)   NULL,
    -- sale | status_change | return | cancellation | payment |
    -- note | rating | profile_update
    activity_type  VARCHAR(40)   NOT NULL,
    title          VARCHAR(255)  NOT NULL,
    detail         TEXT          NULL,
    -- Signed ETB. Positive for a sale/payment, negative for a
    -- return/refund, NULL for movements with no money attached.
    amount         DECIMAL(12,2) NULL,
    status_from    VARCHAR(50)   NULL,
    status_to      VARCHAR(50)   NULL,
    actor_id       CHAR(36)      NULL,
    actor_name     VARCHAR(100)  NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cust_activity_customer (customer_id, created_at),
    INDEX idx_cust_activity_created  (created_at),
    INDEX idx_cust_activity_order    (order_id),
    INDEX idx_cust_activity_type     (activity_type)
);

-- ── 2. Staff ratings ──────────────────────────────────────────────
-- Sits alongside the automatic score rather than replacing it: the
-- view can see that an order was delivered, but not that the customer
-- was rude to the delivery staff.
CREATE TABLE IF NOT EXISTS customer_ratings (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    customer_id    CHAR(36)      NOT NULL,
    -- CHECK so a bad write fails at the database rather than skewing
    -- the average.
    stars          TINYINT       NOT NULL,
    comment        TEXT          NULL,
    rated_by       CHAR(36)      NULL,
    rated_by_name  VARCHAR(100)  NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_customer_rating_stars CHECK (stars BETWEEN 1 AND 5),
    INDEX idx_cust_ratings_customer (customer_id, created_at)
);

-- FKs are added separately from the CREATE TABLE so this migration
-- stays re-runnable on a database where an earlier attempt created
-- the tables without them.
ALTER TABLE customer_activity
  ADD CONSTRAINT fk_customer_activity_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE customer_activity
  ADD CONSTRAINT fk_customer_activity_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE customer_activity
  ADD CONSTRAINT fk_customer_activity_actor FOREIGN KEY (actor_id)
    REFERENCES staff_users(id) ON DELETE SET NULL;

ALTER TABLE customer_ratings
  ADD CONSTRAINT fk_customer_ratings_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE customer_ratings
  ADD CONSTRAINT fk_customer_ratings_actor FOREIGN KEY (rated_by)
    REFERENCES staff_users(id) ON DELETE SET NULL;

-- ── 3. Customer insights view ────────────────────────────────────
--
-- One row per non-deleted customer with an automatic value score.
--
-- Score = recency (0..30) + frequency (0..30) + monetary (0..30)
--         - penalty (0..30), floored at 0 and capped at 100.
--
--   Recency    days since the most recent delivered order
--   Frequency  delivered order count, 6 points each, capped at 30
--   Monetary   lifetime net value, banded
--   Penalty    8 points per return, 5 per cancellation, capped at 30
--
-- Segments:
--   80..100 VIP        highest-value buyers, worth hand-holding
--   60..79  Loyal      repeat customers
--   40..59  Promising  bought, not yet habitual
--   20..39  At Risk    previously active, going quiet
--   0..19   Dormant    little or no purchase history
--
-- Two structural notes:
--
--   Order and item aggregates live in SEPARATE derived tables.
--   Joining order_items into the same aggregate would fan each order
--   out to one row per line item, so COUNT(*) would count line items
--   rather than orders and SUM(total) would multiply the order value
--   by its item count.
--
--   Orders are attributed by customer_id, falling back to a phone
--   match. customer_id is nullable on orders and any order created
--   before its customer row existed would otherwise vanish here.
CREATE OR REPLACE VIEW vw_customer_insights AS
SELECT
    scored.*,
    CASE
        WHEN scored.value_score >= 80 THEN 'VIP'
        WHEN scored.value_score >= 60 THEN 'Loyal'
        WHEN scored.value_score >= 40 THEN 'Promising'
        WHEN scored.value_score >= 20 THEN 'At Risk'
        ELSE 'Dormant'
    END AS segment
FROM (
    SELECT
        c.id                                   AS customer_id,
        c.phone,
        c.name,
        c.email,
        c.city,
        c.location,
        c.gender,
        c.age_group,
        c.telegram_chat_id,
        c.referral_code,
        c.referred_by_affiliate_id,
        c.created_at                           AS customer_since,

        COALESCE(oa.order_count, 0)            AS order_count,
        COALESCE(oa.delivered_count, 0)        AS delivered_count,
        COALESCE(oa.cancelled_count, 0)        AS cancelled_count,
        COALESCE(oa.returned_count, 0)         AS returned_count,
        COALESCE(oa.open_count, 0)             AS open_count,
        oa.last_order_at,
        oa.last_delivered_at,
        COALESCE(oa.lifetime_value, 0)         AS lifetime_value,
        COALESCE(oa.refunded_value, 0)         AS refunded_value,
        COALESCE(oa.net_value, 0)              AS net_value,
        COALESCE(ia.distinct_products, 0)      AS distinct_products,
        COALESCE(ia.total_units, 0)            AS total_units,

        DATEDIFF(NOW(), COALESCE(oa.last_delivered_at, oa.last_order_at))
                                                   AS days_since_last_order,

        -- Exposed individually so the UI can explain the score
        -- instead of showing an unexplained number.
        CASE
            WHEN oa.last_delivered_at IS NULL THEN 0
            WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 30  THEN 30
            WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 60  THEN 25
            WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 90  THEN 20
            WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 180 THEN 14
            WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 365 THEN 8
            ELSE 3
        END AS recency_score,

        LEAST(30, COALESCE(oa.delivered_count, 0) * 6) AS frequency_score,

        CASE
            WHEN COALESCE(oa.net_value, 0) >= 50000 THEN 30
            WHEN COALESCE(oa.net_value, 0) >= 25000 THEN 26
            WHEN COALESCE(oa.net_value, 0) >= 10000 THEN 22
            WHEN COALESCE(oa.net_value, 0) >=  5000 THEN 18
            WHEN COALESCE(oa.net_value, 0) >=  2000 THEN 13
            WHEN COALESCE(oa.net_value, 0) >=   500 THEN  8
            WHEN COALESCE(oa.net_value, 0) >      0 THEN  4
            ELSE 0
        END AS monetary_score,

        LEAST(30, COALESCE(oa.returned_count, 0) * 8 + COALESCE(oa.cancelled_count, 0) * 5)
                                                   AS penalty_score,

        GREATEST(0, LEAST(100,
            (CASE
                WHEN oa.last_delivered_at IS NULL THEN 0
                WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 30  THEN 30
                WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 60  THEN 25
                WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 90  THEN 20
                WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 180 THEN 14
                WHEN DATEDIFF(NOW(), oa.last_delivered_at) <= 365 THEN 8
                ELSE 3
            END)
            + LEAST(30, COALESCE(oa.delivered_count, 0) * 6)
            + (CASE
                WHEN COALESCE(oa.net_value, 0) >= 50000 THEN 30
                WHEN COALESCE(oa.net_value, 0) >= 25000 THEN 26
                WHEN COALESCE(oa.net_value, 0) >= 10000 THEN 22
                WHEN COALESCE(oa.net_value, 0) >=  5000 THEN 18
                WHEN COALESCE(oa.net_value, 0) >=  2000 THEN 13
                WHEN COALESCE(oa.net_value, 0) >=   500 THEN  8
                WHEN COALESCE(oa.net_value, 0) >      0 THEN  4
                ELSE 0
              END)
            - LEAST(30, COALESCE(oa.returned_count, 0) * 8 + COALESCE(oa.cancelled_count, 0) * 5)
        )) AS value_score,

        COALESCE(rt.avg_stars, 0)    AS avg_stars,
        COALESCE(rt.rating_count, 0) AS rating_count

    FROM customers c

    LEFT JOIN (
        SELECT
            COALESCE(o.customer_id, by_phone.id) AS cid,
            COUNT(*)                                                   AS order_count,
            SUM(o.status = 'Delivered')                                AS delivered_count,
            SUM(o.status = 'Cancelled')                                AS cancelled_count,
            SUM(o.status IN ('Returned', 'Issue'))                     AS returned_count,
            SUM(o.status NOT IN ('Delivered','Cancelled','Returned','Issue'))
                                                                     AS open_count,
            MAX(o.created_at)                                          AS last_order_at,
            MAX(CASE WHEN o.status = 'Delivered' THEN o.created_at END) AS last_delivered_at,
            -- Value of orders that stand (delivered or still in flight)
            SUM(CASE WHEN o.status NOT IN ('Cancelled','Returned','Issue') THEN o.total ELSE 0 END)
                                                                     AS lifetime_value,
            SUM(CASE WHEN o.status IN ('Returned', 'Issue') THEN o.total ELSE 0 END)
                                                                     AS refunded_value,
            SUM(CASE WHEN o.status IN ('Cancelled','Returned','Issue') THEN 0 ELSE o.total END)
                                                                     AS net_value
        FROM orders o
        LEFT JOIN customers by_phone
               ON o.customer_id IS NULL
              AND by_phone.phone = o.phone
        WHERE o.deleted_at IS NULL
        GROUP BY COALESCE(o.customer_id, by_phone.id)
    ) oa ON oa.cid = c.id

    LEFT JOIN (
        SELECT
            COALESCE(o.customer_id, by_phone.id) AS cid,
            COUNT(DISTINCT oi.product_id)        AS distinct_products,
            COALESCE(SUM(oi.quantity), 0)        AS total_units
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN customers by_phone
               ON o.customer_id IS NULL
              AND by_phone.phone = o.phone
        WHERE o.deleted_at IS NULL
        GROUP BY COALESCE(o.customer_id, by_phone.id)
    ) ia ON ia.cid = c.id

    LEFT JOIN (
        SELECT customer_id, AVG(stars) AS avg_stars, COUNT(*) AS rating_count
        FROM customer_ratings
        GROUP BY customer_id
    ) rt ON rt.customer_id = c.id

    WHERE c.deleted_at IS NULL
) scored;

-- ── 4. Backfill the movement timeline ────────────────────────────
-- For orders created before this migration. The NOT EXISTS guards
-- make it idempotent: a re-run finds the existing rows and inserts
-- nothing.
INSERT INTO customer_activity
    (id, customer_id, order_id, activity_type, title, detail, amount, status_to, actor_name, created_at)
SELECT
    UUID(),
    COALESCE(o.customer_id, c.id),
    o.id,
    'sale',
    CONCAT('Order ', o.id, ' placed'),
    CONCAT(o.source, ' • ', o.city),
    o.total,
    'Pending',
    COALESCE(su.full_name, su.username),
    o.created_at
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id OR (o.customer_id IS NULL AND c.phone = o.phone)
LEFT JOIN staff_users su ON su.id = o.created_by_staff_id
WHERE o.deleted_at IS NULL
  AND c.id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM customer_activity ca
      WHERE ca.order_id = o.id AND ca.activity_type = 'sale'
  );

INSERT INTO customer_activity
    (id, customer_id, order_id, activity_type, title, detail, status_from, status_to, actor_name, created_at)
SELECT
    UUID(),
    COALESCE(o.customer_id, c.id),
    o.id,
    'status_change',
    CONCAT('Order ', o.id, ': ', h.new_status),
    h.note,
    h.old_status,
    h.new_status,
    h.changed_by,
    h.created_at
FROM order_status_history h
JOIN orders o ON o.id = h.order_id
LEFT JOIN customers c ON c.id = o.customer_id OR (o.customer_id IS NULL AND c.phone = o.phone)
WHERE o.deleted_at IS NULL
  AND c.id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM customer_activity ca
      WHERE ca.order_id = o.id AND ca.status_to = h.new_status
  );

-- ── 5. Index supporting the customer list ────────────────────────
-- The view joins orders on customer_id. Without this index MySQL
-- scans the whole orders table to build the list.
-- CREATE INDEX IF NOT EXISTS is MariaDB-only; MySQL 8 rejects it. The
-- information_schema guard runs on both engines and keeps the file
-- re-runnable, which is what the IF NOT EXISTS was there to provide.
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'orders'
            AND INDEX_NAME = 'idx_orders_customer_id'),
  'DO 0',
  'ALTER TABLE orders ADD INDEX idx_orders_customer_id (customer_id)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================
-- 025_sms.sql
-- SMSEthiopia outbound messaging: templates, per-message ledger,
-- broadcast campaigns, and a three-layer consent model.
--
-- Context
-- ────────
-- The queue is MySQL, not Redis. The process runs single-instance under PM2
-- (exec_mode: fork, instances: 1), so there is no cross-process race to
-- solve and no second datastore to keep alive or back up. Exactly-once
-- claiming is a `SELECT ... FOR UPDATE SKIP LOCKED` on sms_messages, which
-- is already the transactional idiom this codebase uses for orders and
-- inventory.
--
-- Every column below is written for a fact we can actually observe:
--   * status is OUR view of what we submitted, never "Delivered".
--     SMSEthiopia v1 returns { sent, id, description } where `id` is
--     documented as reserved and always 0, so no per-message delivery
--     receipt can be correlated. provider_ref therefore stays NULL and no
--     status is ever written from a provider callback. If the provider ever
--     confirms real DLRs, provider_ref is the column that becomes useful.
--   * scheduled_at exists because the provider has no scheduling endpoint.
--     A scheduled send is a row the dispatcher skips until the clock passes.
--   * segment_count / encoding are snapshotted per message because the
--     customer is billed per segment and the rate is a 0.10-0.45 ETB band.
--     Snapshotting at send time means the cost estimate in the dry run and
--     the recorded cost can never drift.
-- ============================================================


-- ── 1. Templates ───────────────────────────────────────────────────────
--
-- One row per recurring message. `key` is the stable identifier used in
-- code (`order.in_transit`, `broadcast.new_year`) so a copy change is a
-- data edit, not a deploy.
--
-- is_transactional marks messages a customer is owed as part of a purchase
-- they made. Those bypass the marketing opt-in but NOT a hard opt-out —
-- see the consent model below.
CREATE TABLE IF NOT EXISTS sms_templates (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    template_key   VARCHAR(60)   NOT NULL,
    name           VARCHAR(120)  NOT NULL,
    -- Placeholders use {{name}} / {{city}} / {{order_id}}. See
    -- renderTemplate() in src/lib/smsNormalize.ts.
    body           TEXT          NOT NULL,
    -- Opt-out footer required on marketing sends. Ethiopia-facing A2P
    -- sends are expected to carry one; SMSETHIOPIA inbound is unconfirmed,
    -- so the footer is informational and opt-out is handled on our side.
    requires_optout_footer BOOLEAN NOT NULL DEFAULT FALSE,
    -- Locale hint for the composer. 'am' bodies must be composed knowing
    -- UCS-2 limits: 70 characters per segment, not 160.
    locale         VARCHAR(5)    NOT NULL DEFAULT 'en',
    is_transactional BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,

    created_by     CHAR(36)      NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_sms_template_key UNIQUE (template_key),
    INDEX idx_sms_templates_active (is_active)
) ENGINE=InnoDB;


-- ── 2. Campaigns ───────────────────────────────────────────────────────
--
-- One row per staff-initiated broadcast. Created as 'draft' so the dry run
-- is a real, inspectable, free operation against a persisted row — the
-- numbers it produces are what staff approve, and they survive a page
-- reload before anyone commits money.
CREATE TABLE IF NOT EXISTS sms_campaigns (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    name           VARCHAR(160)  NOT NULL,
    category       ENUM('broadcast', 'marketing') NOT NULL DEFAULT 'broadcast',

    -- The composed message, snapshotted. Editing it after dispatch must
    -- not rewrite history: sms_messages copies this per row.
    body           TEXT          NOT NULL,
    template_id    CHAR(36)      NULL,

    -- draft      — being composed, nothing queued
    -- scheduled  — queued rows with a future scheduled_at
    -- sending    — dispatcher is draining it
    -- completed  — every recipient reached a terminal state
    -- cancelled  — staff aborted before completion
    status         ENUM('draft', 'scheduled', 'sending', 'completed', 'cancelled')
                   NOT NULL DEFAULT 'draft',

    -- Targeting, evaluated against vw_customer_insights (migration 024):
    -- segment / city / min_order_count / max_days_since_order, or an
    -- explicit recipient list. Empty columns mean "no constraint".
    target_segment         VARCHAR(20)  NULL,
    target_city            VARCHAR(120) NULL,
    target_min_orders      INT          NULL,
    target_max_days_idle   INT          NULL,

    scheduled_at   DATETIME      NULL,

    -- Dry-run result, and the recount after dispatch. Both are money
    -- numbers staff agreed to, so they are persisted rather than returned
    -- once and lost.
    recipient_count     INT          NOT NULL DEFAULT 0,
    skipped_opted_out   INT          NOT NULL DEFAULT 0,
    skipped_no_phone    INT          NOT NULL DEFAULT 0,
    skipped_invalid     INT          NOT NULL DEFAULT 0,
    deduped_count       INT          NOT NULL DEFAULT 0,
    estimated_segments  INT          NOT NULL DEFAULT 0,
    estimated_cost_min  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    estimated_cost_max  DECIMAL(10,2) NOT NULL DEFAULT 0.00,

    -- Guardrail. A draft above max_cost_etb requires an explicit override
    -- at dispatch; SMS_MAX_DAILY_COST_ETB has no override at all.
    max_cost_etb        DECIMAL(10,2) NOT NULL DEFAULT 2000.00,
    cost_override       BOOLEAN       NOT NULL DEFAULT FALSE,

    dispatched_at   DATETIME      NULL,
    completed_at    DATETIME      NULL,

    created_by      CHAR(36)      NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sms_campaign_template FOREIGN KEY (template_id)
        REFERENCES sms_templates(id) ON DELETE SET NULL,
    INDEX idx_sms_campaigns_status (status),
    INDEX idx_sms_campaigns_created (created_at)
) ENGINE=InnoDB;


-- ── 3. Per-message ledger ──────────────────────────────────────────────
--
-- The queue table and the audit table are the same table, deliberately.
-- A second "sent_messages" audit copy would be a second thing to keep
-- consistent with the first under exactly the conditions (partial failure,
-- restart mid-batch) where consistency is hardest.
--
-- One row per recipient per campaign, or per order notification.
CREATE TABLE IF NOT EXISTS sms_messages (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),

    -- 'transactional' — order status, the customer is owed this
    -- 'marketing'     — new stock, promotions
    -- 'broadcast'    — New Year wish, seasonal greetings
    category       ENUM('transactional', 'marketing', 'broadcast')
                   NOT NULL DEFAULT 'transactional',

    campaign_id    CHAR(36)      NULL,
    order_id       VARCHAR(50)   NULL,
    template_id    CHAR(36)      NULL,

    -- Denormalized from customers/orders at enqueue time. The customer row
    -- may be deleted or renamed later; the ledger must keep the fact that a
    -- message went to a specific number on a specific date.
    to_msisdn      CHAR(12)      NOT NULL,
    customer_id    CHAR(36)      NULL,
    customer_name  VARCHAR(120)  NULL,

    body           TEXT          NOT NULL,

    -- What WE can observe, which is not "Delivered".
    --   queued     — written, waiting for the dispatcher
    --   sending    — claimed by a dispatcher tick (transient state)
    --   submitted  — provider returned 2xx
    --   rejected   — provider refused; never retried
    --   failed     — retries exhausted after transient failures
    --   skipped    — dropped before dispatch (opted out, no phone, invalid)
    status         ENUM('queued', 'sending', 'submitted', 'rejected', 'failed', 'skipped')
                   NOT NULL DEFAULT 'queued',
    skip_reason    VARCHAR(64)   NULL,

    provider       VARCHAR(20)   NOT NULL DEFAULT 'smsethiopia',
    provider_ref   VARCHAR(100)  NULL,
    http_status    SMALLINT      NULL,

    attempt_count  TINYINT       NOT NULL DEFAULT 0,
    last_attempt_at DATETIME     NULL,
    next_attempt_at DATETIME     NULL,

    error_code     VARCHAR(50)   NULL,
    error_message  TEXT          NULL,

    -- Billing snapshot. Segments drive cost, so this is recorded per message
    -- rather than recomputed from body later.
    segment_count  TINYINT       NOT NULL DEFAULT 1,
    encoding       ENUM('GSM-7', 'UNICODE') NOT NULL DEFAULT 'GSM-7',
    cost_min_etb   DECIMAL(10,4) NOT NULL DEFAULT 0,
    cost_max_etb   DECIMAL(10,4) NOT NULL DEFAULT 0,

    scheduled_at   DATETIME      NULL,
    sent_at        DATETIME      NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sms_message_campaign FOREIGN KEY (campaign_id)
        REFERENCES sms_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_sms_message_template FOREIGN KEY (template_id)
        REFERENCES sms_templates(id) ON DELETE SET NULL,
    CONSTRAINT fk_sms_message_customer FOREIGN KEY (customer_id)
        REFERENCES customers(id) ON DELETE SET NULL,

    -- The dispatcher's hot path: claim the oldest due row. Without this
    -- MySQL scans the whole ledger every tick.
    INDEX idx_sms_messages_due (status, next_attempt_at, scheduled_at),

    -- Recovery sweep target — a row stuck in 'sending' means the process
    -- died mid-batch.
    INDEX idx_sms_messages_stuck (status, updated_at),

    -- Per-customer history and the cooldown check that stops status churn
    -- from texting someone four times in an hour.
    INDEX idx_sms_messages_customer (customer_id, created_at),
    INDEX idx_sms_messages_msisdn (to_msisdn, created_at),
    INDEX idx_sms_messages_order (order_id)
) ENGINE=InnoDB;


-- ── 4. Consent, as three layers ────────────────────────────────────────
--
-- One boolean cannot express what we need:
--   * A customer who does not want New Year greetings almost certainly
--     still wants to know their order is out for delivery.
--   * Some customers are unreachable for marketing entirely.
--   * Staff need "don't text this customer about THIS campaign" without
--     permanently muting anyone.
--
-- So: two columns on customers plus a campaign-scoped exclusion table.
--
-- ADD COLUMN IF NOT EXISTS is MariaDB-only; MySQL 8 rejects it. The
-- information_schema guard below runs on both engines and keeps this file
-- re-runnable, which is what the IF NOT EXISTS was there to provide.
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'customers'
            AND COLUMN_NAME = 'sms_marketing_opt_in'),
  'DO 0',
  'ALTER TABLE customers ADD COLUMN sms_marketing_opt_in TINYINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'customers'
            AND COLUMN_NAME = 'sms_opt_out_at'),
  'DO 0',
  'ALTER TABLE customers ADD COLUMN sms_opt_out_at DATETIME NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'customers'
            AND COLUMN_NAME = 'sms_consent_source'),
  'DO 0',
  'ALTER TABLE customers ADD COLUMN sms_consent_source VARCHAR(32) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'customers'
            AND COLUMN_NAME = 'sms_consent_at'),
  'DO 0',
  'ALTER TABLE customers ADD COLUMN sms_consent_at DATETIME NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Campaign-scoped suppression. Created by staff during a dry run when a
-- specific recipient should be dropped from one send and no other.
CREATE TABLE IF NOT EXISTS sms_campaign_exclusions (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    campaign_id    CHAR(36)      NOT NULL,
    customer_id    CHAR(36)      NULL,
    to_msisdn      CHAR(12)      NOT NULL,
    reason         VARCHAR(160)  NULL,
    created_by     CHAR(36)      NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sms_exclusion_campaign FOREIGN KEY (campaign_id)
        REFERENCES sms_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_sms_exclusion_customer FOREIGN KEY (customer_id)
        REFERENCES customers(id) ON DELETE CASCADE,

    -- One exclusion per number per campaign.
    CONSTRAINT uq_sms_exclusion UNIQUE (campaign_id, to_msisdn),
    INDEX idx_sms_exclusion_campaign (campaign_id)
) ENGINE=InnoDB;


-- ── 5. Consent audit trail ─────────────────────────────────────────────
--
-- Append-only. Consent changes are a regulatory record: when they happened,
-- where they came from, and what the customer saw.
--
-- `source` is deliberately narrow while the provider's inbound SMS support
-- is unconfirmed. 'website' and 'sms-reply' are the two honest values
-- today; a STOP-keyword handler is a pure addition of rows here later, with
-- no schema change.
CREATE TABLE IF NOT EXISTS sms_consent_log (
    id             CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    customer_id    CHAR(36)      NULL,
    to_msisdn      CHAR(12)      NOT NULL,
    -- 'opt-in' | 'opt-out' | 'hard-opt-out' | 'campaign-exclude'
    action         ENUM('opt-in', 'opt-out', 'hard-opt-out', 'campaign-exclude')
                   NOT NULL,
    -- 'website' | 'sms-reply' | 'staff' | 'import'
    source         VARCHAR(32)   NOT NULL,
    note           VARCHAR(255)  NULL,
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sms_consent_customer FOREIGN KEY (customer_id)
        REFERENCES customers(id) ON DELETE SET NULL,
    INDEX idx_sms_consent_msisdn (to_msisdn, created_at),
    INDEX idx_sms_consent_customer (customer_id, created_at)
) ENGINE=InnoDB;


-- ── 6. Daily spend ledger ──────────────────────────────────────────────
--
-- The dispatcher stops claiming once the day's confirmed + estimated cost
-- reaches SMS_MAX_DAILY_COST_ETB. That needs a running total that survives
-- restarts, which a counter in Redis would not.
CREATE TABLE IF NOT EXISTS sms_daily_spend (
    spend_date     DATE          PRIMARY KEY,
    message_count  INT           NOT NULL DEFAULT 0,
    segment_count  INT           NOT NULL DEFAULT 0,
    cost_min_etb   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    cost_max_etb   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    blocked_at     DATETIME      NULL,
    updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Self-register so this migration is idempotent even if the runner is
-- re-invoked directly rather than through migrate.cjs.
INSERT IGNORE INTO migrations_log (filename) VALUES ('025_sms.sql');

CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
    id             CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    campaign_id    CHAR(36) NOT NULL,
    to_msisdn      VARCHAR(15) NOT NULL,
    name           VARCHAR(100) NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sms_campaign_recipients_campaign FOREIGN KEY (campaign_id)
        REFERENCES sms_campaigns(id) ON DELETE CASCADE,
    INDEX idx_sms_campaign_recipients_campaign (campaign_id)
);

ALTER TABLE sms_campaigns
ADD COLUMN is_explicit_list BOOLEAN NOT NULL DEFAULT FALSE AFTER status;


-- 033_site_assets.sql
-- Admin-overridable images for storefront "site chrome" (category cards,
-- daily highlights, hero art, ...).
--
-- Design: a row exists ONLY when an admin has replaced the hardcoded default
-- shipped in the frontend (frontend/src/constants/siteAssets.ts). Absence of
-- a row is the normal, healthy state and means "render the frontend default",
-- so this table stays empty until someone actually overrides something.
--
-- The `url` points at Cloudinary (or any https URL) after an upload through
-- POST /api/media/:key — replacing an asset never requires a redeploy.

CREATE TABLE IF NOT EXISTS site_assets (
  asset_key  VARCHAR(191) NOT NULL PRIMARY KEY,
  url        TEXT         NOT NULL,
  alt_text   VARCHAR(255) NULL,
  updated_by CHAR(36)     NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Default lookups are "all overrides", so give MySQL something to cover.
--
-- MariaDB has no `CREATE INDEX IF NOT EXISTS`, and a bare CREATE INDEX
-- aborts the whole migration if the index already exists. That matters
-- because this file was originally numbered 028_site_assets.sql: on any
-- database where the old number already ran, migrations_log has no
-- 033 entry, so the runner replays this file and dies on
-- "Duplicate key name 'idx_site_assets_updated_at'".
--
-- The guard below mirrors the pattern already used by
-- 018_unique_product_constraint.sql, so a re-run is a no-op instead of
-- a hard failure.
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'site_assets'
            AND INDEX_NAME = 'idx_site_assets_updated_at'),
  'DO 0',
  'ALTER TABLE site_assets ADD INDEX idx_site_assets_updated_at (updated_at)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


INSERT IGNORE INTO migrations_log (filename) VALUES ('033_site_assets.sql');
-- ═══════════════════════════════════════════════════════════════════
-- Post-run verification
-- ═══════════════════════════════════════════════════════════════════
-- migrations_log's timestamp column is run_at, not applied_at.
SELECT filename, run_at FROM migrations_log
 WHERE filename LIKE '02%' OR filename LIKE '03%'
 ORDER BY run_at DESC;

SELECT COUNT(*) AS should_be_17 FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN (
     'affiliate_commission_rules','commission_events','referral_clicks','report_runs',
     'report_run_locks','telegram_user_state','customer_notifications','customer_activity',
     'customer_ratings','sms_templates','sms_campaigns','sms_messages',
     'sms_campaign_exclusions','sms_consent_log','sms_daily_spend',
     'sms_campaign_recipients','site_assets');
-- If should_be_17 < 17, scroll up for the failing statement, restore the
-- backup, and import again from a clean database.
