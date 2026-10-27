-- ===================================================================
-- 07_views.sql
-- Recreate the four application views after a phpMyAdmin dump import.
--
-- phpMyAdmin 5.2.3 exports views as empty stand-in tables when the
-- exporting account lacks SHOW VIEW. The dump import therefore creates
-- BASE TABLE objects named vw_* with no rows. This script drops those
-- placeholders and recreates the real views from the production
-- migrations.
--
-- Run after 01_v2_schema.sql. Read-only against application data.
-- ===================================================================

DROP TABLE IF EXISTS `vw_affiliate_dashboard`;
DROP TABLE IF EXISTS `vw_customer_insights`;
DROP TABLE IF EXISTS `vw_inventory_summary`;
DROP TABLE IF EXISTS `vw_low_stock`;

-- Source: backend/db/sql/002_affiliate_commission_trigger.sql
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

-- Source: backend/db/sql/003_security_and_inventory.sql
CREATE OR REPLACE VIEW vw_low_stock AS
SELECT
    p.id,
    p.name,
    p.package_size,
    p.inventory_quantity,
    p.low_stock_threshold,
    CASE
        WHEN p.inventory_quantity = 0                           THEN 'out_of_stock'
        WHEN p.inventory_quantity <= p.low_stock_threshold / 2 THEN 'critical'
        WHEN p.inventory_quantity <= p.low_stock_threshold      THEN 'low'
        ELSE 'ok'
    END AS stock_status
FROM products p
WHERE p.active = TRUE
  AND p.inventory_quantity <= p.low_stock_threshold
ORDER BY p.inventory_quantity ASC;

CREATE OR REPLACE VIEW vw_inventory_summary AS
SELECT
    COUNT(*)                                                                         AS total_products,
    SUM(inventory_quantity)                                                          AS total_units,
    SUM(CASE WHEN inventory_quantity = 0                        THEN 1 ELSE 0 END)  AS out_of_stock_count,
    SUM(CASE WHEN inventory_quantity > 0
              AND inventory_quantity <= low_stock_threshold / 2 THEN 1 ELSE 0 END)  AS critical_count,
    SUM(CASE WHEN inventory_quantity > low_stock_threshold / 2
              AND inventory_quantity <= low_stock_threshold      THEN 1 ELSE 0 END)  AS low_count,
    SUM(CASE WHEN inventory_quantity > low_stock_threshold       THEN 1 ELSE 0 END)  AS ok_count,
    SUM(inventory_quantity * price)                                                  AS total_stock_value
FROM products
WHERE active = TRUE;

-- Source: backend/db/sql/024_customer_insights.sql
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

SELECT 'v2 views created' AS result;
