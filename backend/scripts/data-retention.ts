/**
 * scripts/data-retention.ts
 * Asella Organic — Nightly Data Retention Job
 *
 * Run via cron (add to Yegara Host cPanel Cron Jobs):
 *   0 2 * * * cd /path/to/backend && npx ts-node scripts/data-retention.ts >> /var/log/asella-retention.log 2>&1
 *
 * What it does:
 *  1. Anonymizes PII on orders older than RETENTION_YEARS (default 2)
 *  2. Anonymizes customers with no recent orders
 *  3. Expires stale pending referrals
 *  4. Cleans up expired session blocklist rows
 *  5. Prunes rate limit log older than 7 days
 */

import "../src/config/env.js";
import pool from "../src/config/db.js";

const RETENTION_YEARS = parseInt(process.env.RETENTION_YEARS ?? "2", 10);

async function run(): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  console.log(`[retention] ${new Date().toISOString()} — starting`);
  console.log(`[retention] Cutoff date: ${cutoff.toDateString()}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Anonymize old orders
    const { rowCount: orders } = await client.query(
      `UPDATE orders
       SET customer_name = 'ANONYMIZED',
           phone         = 'ANONYMIZED',
           location      = '',
           notes         = '',
           updated_at    = NOW()
       WHERE created_at < $1
         AND customer_name <> 'ANONYMIZED'`,
      [cutoff]
    );
    console.log(`[retention] Orders anonymized: ${orders}`);

    // 2. Anonymize customers with no order in the retention window
    const { rowCount: customers } = await client.query(
      `UPDATE customers
       SET name     = 'ANONYMIZED',
           phone    = gen_random_uuid()::text,
           email    = NULL,
           location = '',
           city     = ''
       WHERE id NOT IN (
         SELECT DISTINCT customer_id FROM orders
         WHERE created_at > $1 AND customer_id IS NOT NULL
       )
         AND name <> 'ANONYMIZED'`,
      [cutoff]
    );
    console.log(`[retention] Customers anonymized: ${customers}`);

    // 3. Expire stale referrals
    const { rowCount: referrals } = await client.query(
      `UPDATE referrals SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()`
    );
    console.log(`[retention] Referrals expired: ${referrals}`);

    // 4. Clean session blocklist
    const { rowCount: sessions } = await client.query(
      `DELETE FROM session_blocklist WHERE expires_at < NOW()`
    );
    console.log(`[retention] Blocklist rows pruned: ${sessions}`);

    // 5. Prune rate limit log
    const { rowCount: rateLogs } = await client.query(
      `DELETE FROM rate_limit_log
       WHERE occurred_at < NOW() - INTERVAL '7 days'`
    );
    console.log(`[retention] Rate limit log rows pruned: ${rateLogs}`);

    await client.query("COMMIT");
    console.log(`[retention] Complete `);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[retention] ERROR:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
