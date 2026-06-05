/**
db/migrations/002_affiliate_commissions.js
Asella Organic — Affiliate Commission System (MySQL)
*/
const sql = `
-- ── Commission Configuration (Admin Managed) ───────────────────────
CREATE TABLE IF NOT EXISTS referral_configs (
    id               CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    commission_type  ENUM('percentage', 'fixed') NOT NULL,
    commission_value DECIMAL(12,2) NOT NULL CHECK (commission_value >= 0),
    min_order_amount DECIMAL(12,2) DEFAULT 0,
    max_commission   DECIMAL(12,2),
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Affiliate Profiles (Staff Members) ─────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_profiles (
    id              CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id         CHAR(36) UNIQUE NOT NULL,
    referral_code   VARCHAR(20) UNIQUE NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    total_referrals INT DEFAULT 0,
    total_earnings  DECIMAL(12,2) DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);
CREATE INDEX idx_affiliate_code ON affiliate_profiles(referral_code);
CREATE INDEX idx_affiliate_user ON affiliate_profiles(user_id);

-- ── Commissions Ledger (Tracks earnings per delivered order) ───────
CREATE TABLE IF NOT EXISTS referral_commissions (
    id                CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    affiliate_id      CHAR(36) NOT NULL,
    customer_id       CHAR(36) NULL,
    order_id          VARCHAR(50) NULL,
    commission_type   VARCHAR(50) NOT NULL,
    commission_value  DECIMAL(12,2) NOT NULL,
    order_total       DECIMAL(12,2) NOT NULL,
    commission_amount DECIMAL(12,2) NOT NULL CHECK (commission_amount >= 0),
    status            ENUM('pending', 'paid') DEFAULT 'pending',
    calculated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at           DATETIME NULL,
    FOREIGN KEY (affiliate_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
CREATE INDEX idx_commission_affiliate ON referral_commissions(affiliate_id, status);
CREATE INDEX idx_commission_order ON referral_commissions(order_id);

-- ── Trigger: Auto-Calculate Commission on Delivery ─────────────────
DROP TRIGGER IF EXISTS trg_order_delivered_commission;

CREATE TRIGGER trg_order_delivered_commission
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
    DECLARE v_affiliate_id CHAR(36);
    DECLARE v_comm_type VARCHAR(50);
    DECLARE v_comm_value DECIMAL(12,2);
    DECLARE v_min_order DECIMAL(12,2);
    DECLARE v_max_comm DECIMAL(12,2);
    DECLARE v_amount DECIMAL(12,2);

    IF NEW.status = 'Delivered' AND (OLD.status IS NULL OR OLD.status != 'Delivered') THEN
        
        SELECT referred_by_affiliate_id INTO v_affiliate_id
        FROM customers WHERE id = NEW.customer_id;

        IF v_affiliate_id IS NOT NULL THEN
            SELECT commission_type, commission_value, min_order_amount, max_commission
            INTO v_comm_type, v_comm_value, v_min_order, v_max_comm
            FROM referral_configs 
            WHERE is_active = TRUE 
            ORDER BY created_at DESC LIMIT 1;

            IF v_comm_type IS NOT NULL AND NEW.total >= v_min_order THEN
                IF v_comm_type = 'percentage' THEN
                    SET v_amount = (NEW.total * v_comm_value) / 100.0;
                ELSE
                    SET v_amount = v_comm_value;
                END IF;

                IF v_max_comm IS NOT NULL THEN
                    IF v_amount > v_max_comm THEN
                        SET v_amount = v_max_comm;
                    END IF;
                END IF;

                IF v_amount > NEW.total THEN
                    SET v_amount = NEW.total;
                END IF;

                INSERT INTO referral_commissions (
                    affiliate_id, customer_id, order_id, commission_type,
                    commission_value, order_total, commission_amount, status
                ) VALUES (
                    v_affiliate_id, NEW.customer_id, NEW.id, v_comm_type,
                    v_comm_value, NEW.total, v_amount, 'pending'
                );

                UPDATE affiliate_profiles 
                SET total_earnings = total_earnings + v_amount,
                    total_referrals = total_referrals + 1
                WHERE id = v_affiliate_id;
            END IF;
        END IF;
    END IF;
END;
`;

module.exports = { sql };