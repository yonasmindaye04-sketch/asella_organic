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
DROP PROCEDURE IF EXISTS add_sms_consent_columns;

DELIMITER $$
CREATE PROCEDURE add_sms_consent_columns()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'customers'
          AND COLUMN_NAME  = 'sms_marketing_opt_in'
    ) THEN
        ALTER TABLE customers
            ADD COLUMN sms_marketing_opt_in TINYINT NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'customers'
          AND COLUMN_NAME  = 'sms_opt_out_at'
    ) THEN
        ALTER TABLE customers ADD COLUMN sms_opt_out_at DATETIME NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'customers'
          AND COLUMN_NAME  = 'sms_consent_source'
    ) THEN
        ALTER TABLE customers ADD COLUMN sms_consent_source VARCHAR(32) NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'customers'
          AND COLUMN_NAME  = 'sms_consent_at'
    ) THEN
        ALTER TABLE customers ADD COLUMN sms_consent_at DATETIME NULL;
    END IF;
END$$
DELIMITER ;

CALL add_sms_consent_columns();
DROP PROCEDURE IF EXISTS add_sms_consent_columns;

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