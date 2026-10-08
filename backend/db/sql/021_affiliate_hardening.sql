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
