-- ═══════════════════════════════════════════════════════════════════
-- 002_affiliate_commission_trigger.sql
-- Asella Organic — Affiliate Commission Trigger (MySQL)
--
-- Creates the AFTER UPDATE trigger on orders that auto-calculates
-- and records affiliate commissions when an order is delivered.
-- All schema tables were already created in 001_complete_schema.sql.
-- ═══════════════════════════════════════════════════════════════════

-- Drop old trigger if it exists from a previous run
DROP TRIGGER IF EXISTS trg_order_delivered_commission;

CREATE TRIGGER trg_order_delivered_commission
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
    DECLARE v_affiliate_id  CHAR(36);
    DECLARE v_comm_type     VARCHAR(50);
    DECLARE v_comm_value    DECIMAL(12,2);
    DECLARE v_min_order     DECIMAL(12,2);
    DECLARE v_max_comm      DECIMAL(12,2);
    DECLARE v_amount        DECIMAL(12,2);

    -- Only fire when transitioning INTO 'Delivered'
    IF NEW.status = 'Delivered' AND (OLD.status IS NULL OR OLD.status != 'Delivered') THEN

        -- Look up the affiliate linked to this customer
        SELECT referred_by_affiliate_id INTO v_affiliate_id
        FROM   customers
        WHERE  id = NEW.customer_id;

        IF v_affiliate_id IS NOT NULL THEN

            -- Fetch the active commission config
            SELECT commission_type, commission_value, min_order_amount, max_commission
            INTO   v_comm_type, v_comm_value, v_min_order, v_max_comm
            FROM   referral_configs
            WHERE  is_active = TRUE
            ORDER  BY created_at DESC
            LIMIT  1;

            IF v_comm_type IS NOT NULL AND NEW.total >= IFNULL(v_min_order, 0) THEN

                -- Calculate raw commission
                IF v_comm_type = 'percentage' THEN
                    SET v_amount = (NEW.total * v_comm_value) / 100.0;
                ELSE
                    SET v_amount = v_comm_value;
                END IF;

                -- Apply cap
                IF v_max_comm IS NOT NULL AND v_amount > v_max_comm THEN
                    SET v_amount = v_max_comm;
                END IF;

                -- Safety: never exceed order total
                IF v_amount > NEW.total THEN
                    SET v_amount = NEW.total;
                END IF;

                -- Record the commission
                INSERT INTO referral_commissions (
                    id, affiliate_id, customer_id, order_id,
                    commission_type, commission_value,
                    order_total, commission_amount, status
                ) VALUES (
                    UUID(), v_affiliate_id, NEW.customer_id, NEW.id,
                    v_comm_type, v_comm_value,
                    NEW.total, v_amount, 'pending'
                );

                -- Update affiliate totals
                UPDATE affiliate_profiles
                SET    total_earnings  = total_earnings + v_amount,
                       total_referrals = total_referrals + 1,
                       updated_at      = NOW()
                WHERE  id = v_affiliate_id;

            END IF;
        END IF;
    END IF;
END;

-- ── Referral Commissions table (if not yet created by 001) ────────
CREATE TABLE IF NOT EXISTS referral_commissions (
    id                CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
    affiliate_id      CHAR(36)      NOT NULL,
    customer_id       CHAR(36)      NULL,
    order_id          VARCHAR(50)   NULL,
    commission_type   VARCHAR(50)   NOT NULL,
    commission_value  DECIMAL(12,2) NOT NULL,
    order_total       DECIMAL(12,2) NOT NULL,
    commission_amount DECIMAL(12,2) NOT NULL CHECK (commission_amount >= 0),
    status            ENUM('pending','paid') DEFAULT 'pending',
    calculated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
    paid_at           DATETIME      NULL,
    FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id)  REFERENCES customers(id)          ON DELETE SET NULL,
    FOREIGN KEY (order_id)     REFERENCES orders(id)             ON DELETE SET NULL
);
CREATE INDEX idx_commission_affiliate ON referral_commissions(affiliate_id, status);
CREATE INDEX idx_commission_order     ON referral_commissions(order_id);

-- ── Affiliate dashboard view (MySQL-compatible, no COALESCE on UUID join) ──
CREATE OR REPLACE VIEW vw_affiliate_dashboard AS
SELECT
    a.id,
    a.referral_code,
    COALESCE(s.full_name, a.full_name)  AS full_name,
    COALESCE(s.username,  a.email)      AS identifier,
    a.is_active,
    COUNT(DISTINCT c.id)                AS total_referred_customers,
    COUNT(rc.id)                        AS total_commissions,
    COALESCE(SUM(rc.commission_amount), 0)                                        AS total_earnings,
    COALESCE(SUM(CASE WHEN rc.status = 'paid'    THEN rc.commission_amount ELSE 0 END), 0) AS paid_earnings,
    COALESCE(SUM(CASE WHEN rc.status = 'pending' THEN rc.commission_amount ELSE 0 END), 0) AS pending_earnings
FROM affiliate_profiles a
LEFT JOIN staff_users s
       ON a.user_id = s.id AND s.deleted_at IS NULL
LEFT JOIN customers c
       ON c.referred_by_affiliate_id = a.id AND c.deleted_at IS NULL
LEFT JOIN referral_commissions rc
       ON rc.affiliate_id = a.id
GROUP BY
    a.id, a.referral_code, a.full_name, a.is_active,
    s.full_name, s.username, a.email;

INSERT IGNORE INTO migrations_log (filename) VALUES ('002_affiliate_commission_trigger.sql');