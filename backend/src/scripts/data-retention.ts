/**
 * scripts/data-retention.ts
 * Asella Organic — Nightly Data Retention Job (MySQL)
 *
 * Run via cron (add to Yegara Host cPanel Cron Jobs):
 * 0 2 * * * cd /path/to/backend && npx ts-node scripts/data-retention.ts >> /var/log/asella-retention.log 2>&1
 */

import "../config/env.js";
import pool from "../config/db.js";

const RETENTION_YEARS = parseInt(process.env.RETENTION_YEARS ?? "2", 10);

async function run(): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  console.log(`[retention] ${new Date().toISOString()} — starting`);
  console.log(`[retention] Cutoff date: ${cutoff.toDateString()}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Anonymize old orders
    const [ordersResult] = await connection.query(
      `UPDATE orders
       SET customer_name = 'ANONYMIZED',
           phone         = 'ANONYMIZED',
           location      = '',
           notes         = '',
           updated_at    = NOW()
       WHERE created_at < ?
         AND customer_name <> 'ANONYMIZED'`,
      [cutoff]
    ) as [any, any];
    console.log(`[retention] Orders anonymized: ${ordersResult.affectedRows}`);

    // 2. Anonymize customers with no order in the retention window
    const [customersResult] = await connection.query(
      `UPDATE customers
       SET name     = 'ANONYMIZED',
           phone    = UUID(),
           email    = NULL,
           location = '',
           city     = ''
       WHERE id NOT IN (
         SELECT DISTINCT customer_id FROM orders
         WHERE created_at > ? AND customer_id IS NOT NULL
       )
         AND name <> 'ANONYMIZED'`,
      [cutoff]
    ) as [any, any];
    console.log(`[retention] Customers anonymized: ${customersResult.affectedRows}`);

    // 3. Expire stale referrals
    const [referralsResult] = await connection.query(
      `UPDATE referrals SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()`
    ) as [any, any];
    console.log(`[retention] Referrals expired: ${referralsResult.affectedRows}`);

    // 4. Clean session blocklist
    const [sessionsResult] = await connection.query(
      `DELETE FROM session_blocklist WHERE expires_at < NOW()`
    ) as [any, any];
    console.log(`[retention] Blocklist rows pruned: ${sessionsResult.affectedRows}`);

    // 5. Prune rate limit log
    const [rateLogsResult] = await connection.query(
      `DELETE FROM rate_limit_log
       WHERE occurred_at < NOW() - INTERVAL 7 DAY`
    ) as [any, any];
    console.log(`[retention] Rate limit log rows pruned: ${rateLogsResult.affectedRows}`);

    await connection.commit();
    console.log(`[retention] Complete `);
  } catch (err) {
    await connection.rollback();
    console.error("[retention] ERROR:", err);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

run();
