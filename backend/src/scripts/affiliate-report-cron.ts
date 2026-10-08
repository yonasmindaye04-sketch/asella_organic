/**
 * src/scripts/affiliate-report-cron.ts
 * Asella Organic — Weekly Affiliate Sales & Engagement Summary (MySQL)
 *
 * Runs every Monday at 08:00 EAT alongside the existing morning briefing.
 * Sends each eligible affiliate a summary of the week that just ended.
 *
 * Idempotency: report_run_locks has a PRIMARY KEY on period_start, so this
 * job claims the week before sending. A restart, a second instance, or a manual
 * invocation in the same week cannot produce duplicate emails.
 *
 * Every send is recorded in report_runs with its outcome, so failures are
 * visible in the admin history endpoint instead of being swallowed.
 */

import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../config/db.js";
import { sendAffiliateReport, currentWeekPeriod } from "../lib/affiliateReport.js";
import { isMailConfigured } from "../lib/mailer.js";
import { createLogger } from "../lib/logger.js";

interface TargetRow extends RowDataPacket {
  id: string;
  referral_code: string;
  full_name: string | null;
  email: string | null;
  identifier: string | null;
}

export async function sendWeeklyAffiliateReports(): Promise<void> {
  const log = createLogger({ requestId: "affiliate-report-cron" } as never);

  if (!isMailConfigured()) {
    log.warn("Weekly affiliate report skipped — SMTP is not configured.");
    return;
  }

  // Report on the week that just finished, so the figures are settled.
  const period = currentWeekPeriod();

  // Claim the week. INSERT IGNORE + affectedRows check is the lock: the
  // PRIMARY KEY on period_start means only one caller can win this insert.
  const [claim] = await pool.query(
    `INSERT IGNORE INTO report_run_locks (period_start) VALUES (?)`,
    [period.start]
  ) as [{ affectedRows: number }, unknown];

  if (claim.affectedRows === 0) {
    log.info("Weekly affiliate report already sent for this period — skipping.", {
      periodStart: period.start,
      periodEnd: period.end,
    });
    return;
  }

  const [targets] = await pool.query(
    `SELECT ap.id, ap.referral_code, ap.full_name, ap.email,
            COALESCE(s.email, s.username) AS identifier
     FROM   affiliate_profiles ap
     LEFT   JOIN staff_users s ON s.id = ap.user_id
     WHERE  ap.deleted_at IS NULL
       AND  ap.is_active = TRUE
       AND  ap.user_id IS NOT NULL`
  ) as [TargetRow[], unknown];

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const target of targets) {
    const recipient = target.email ?? target.identifier;

    if (!recipient) {
      skipped++;
      await pool.query(
        `INSERT INTO report_runs
           (id, affiliate_id, period_start, period_end, trigger_type,
            recipient, status, error)
         VALUES (?, ?, ?, ?, 'weekly', NULL, 'failed', 'No email address on file')`,
        [crypto.randomUUID(), target.id, period.start, period.end]
      );
      continue;
    }

    const outcome = await sendAffiliateReport({
      executor: pool,
      affiliateId: target.id,
      recipient,
      period,
      trigger: "weekly",
      triggeredBy: null,
    });

    if (outcome.status === "sent") {
      sent++;
    } else if (outcome.status === "skipped") {
      skipped++;
    } else {
      failed++;
      log.error("Weekly affiliate report failed", {
        affiliateId: target.id,
        error: outcome.error,
      });
    }
  }

  log.info("Weekly affiliate reports complete", { period, sent, failed, skipped });
}
