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
DROP PROCEDURE IF EXISTS add_orders_customer_id_index;

DELIMITER $$
CREATE PROCEDURE add_orders_customer_id_index()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'orders'
          AND INDEX_NAME   = 'idx_orders_customer_id'
    ) THEN
        CREATE INDEX idx_orders_customer_id ON orders(customer_id);
    END IF;
END$$
DELIMITER ;

CALL add_orders_customer_id_index();
DROP PROCEDURE IF EXISTS add_orders_customer_id_index;