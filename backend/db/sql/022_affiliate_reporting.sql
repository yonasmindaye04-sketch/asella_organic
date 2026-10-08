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
