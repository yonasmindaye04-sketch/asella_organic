/**
 * src/lib/smsQueue.ts
 * Asella Organic — MySQL-backed SMS queue and dispatcher
 *
 * Why MySQL and not BullMQ/Redis
 * ──────────────────────────────
 * The API runs single-instance under PM2 (exec_mode: fork, instances: 1).
 * There is no cross-process race to solve, so a distributed queue buys
 * nothing and costs a second datastore to keep alive, back up, and secure.
 * Exactly-once claiming is `SELECT ... FOR UPDATE SKIP LOCKED` — the same
 * transactional idiom already used for orders and inventory.
 *
 * The upside is that the queue and the audit log are the same table, so
 * there is no second copy to reconcile under exactly the conditions
 * (partial failure, restart mid-batch) where that is hardest.
 *
 * ── Status vocabulary ────────────────────────────────────────────────────
 * Deliberately no "delivered". SMSEthiopia v1 returns { sent, id,
 * description } with `id` documented as reserved and always 0, so no
 * per-message delivery receipt can be correlated. "submitted" is the
 * highest state we can honestly report.
 */

import crypto from "crypto";
import pool from "../config/db.js";
import {
  sendSms,
  isSmsDispatchEnabled,
  isSmsConfigured,
  activeSmsTransport,
} from "./sms.js";
import type { SendResult } from "./sms.js";
import {
  calculateSmsSegments,
  estimateSmsCostEtb,
  normalizeEthiopianMSISDN,
} from "./smsNormalize.js";
import { logger } from "./logger.js";

export type SmsCategory = "transactional" | "marketing" | "broadcast";
export type SmsMessageStatus =
  | "queued" | "sending" | "submitted" | "rejected" | "failed" | "skipped";

// ── Enqueue ─────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  category: SmsCategory;
  to: string;
  body: string;
  customerId?: string | null;
  customerName?: string | null;
  orderId?: string | null;
  campaignId?: string | null;
  templateId?: string | null;
  /** Null means "send on the next dispatcher tick". */
  scheduledAt?: Date | null;
}

/**
 * Write one message to the queue. Never throws.
 *
 * Returns null when the recipient cannot be normalized, and the row is
 * written as 'skipped' rather than dropped so the audit trail shows why a
 * person in a campaign list never received anything.
 */
export async function enqueueSms(
  options: EnqueueOptions,
): Promise<{ id: string; status: SmsMessageStatus; error?: string }> {
  const id = crypto.randomUUID();
  const { segmentCount, encoding } = calculateSmsSegments(options.body);
  const cost = estimateSmsCostEtb(segmentCount);

  let toMsisdn: string | null = null;
  let skipReason: string | null = null;

  try {
    toMsisdn = normalizeEthiopianMSISDN(options.to);
  } catch {
    skipReason = "invalid_msisdn";
  }

  const hardOptOut = options.customerId
    ? await hasHardOptOut(options.customerId)
    : false;
  if (hardOptOut) skipReason = "opted_out";

  const status: SmsMessageStatus = skipReason ? "skipped" : "queued";

  await pool.query(
    `INSERT INTO sms_messages
       (id, category, campaign_id, order_id, template_id, to_msisdn,
        customer_id, customer_name, body, status, skip_reason,
        segment_count, encoding, cost_min_etb, cost_max_etb, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      options.category,
      options.campaignId ?? null,
      options.orderId ?? null,
      options.templateId ?? null,
      // The column is CHAR(12) NOT NULL; a row we could not normalize still
      // needs a placeholder that can never be dialled.
      toMsisdn ?? "000000000000",
      options.customerId ?? null,
      options.customerName ?? null,
      options.body,
      status,
      skipReason,
      segmentCount,
      encoding,
      cost.min,
      cost.max,
      status === "queued" ? new Date() : null,
    ],
  );

  return skipReason
    ? { id, status, error: skipReason }
    : { id, status };
}

/**
 * Consent check for a recipient before a send is queued.
 * A hard opt-out suppresses every category, including order updates.
 */
export async function hasHardOptOut(customerId: string): Promise<boolean> {
  const [rows] = await pool.query(
    "SELECT sms_opt_out_at FROM customers WHERE id = ? LIMIT 1",
    [customerId],
  ) as [any[], any];
  return Boolean(rows[0]?.sms_opt_out_at);
}

/** Whether a recipient may receive marketing/broadcast content. */
export async function hasMarketingConsent(
  customerId: string | null,
  toMsisdn: string,
): Promise<boolean> {
  if (customerId) {
    const [rows] = await pool.query(
      `SELECT sms_marketing_opt_in, sms_opt_out_at
         FROM customers WHERE id = ? LIMIT 1`,
      [customerId],
    ) as [any[], any];
    if (rows[0]?.sms_opt_out_at) return false;
    return Boolean(rows[0]?.sms_marketing_opt_in);
  }
  // An explicit list with no customer row has no consent record; a number
  // that opted out globally is still excluded.
  const [rows] = await pool.query(
    `SELECT 1 FROM customers WHERE phone LIKE ? AND sms_opt_out_at IS NOT NULL LIMIT 1`,
    [`%${toMsisdn.slice(-9)}`],
  ) as [any[], any];
  return rows.length === 0;
}

// ── Claim ───────────────────────────────────────────────────────────────

interface ClaimedRow {
  id: string;
  to_msisdn: string;
  body: string;
  segment_count: number;
  encoding: "GSM-7" | "UNICODE";
  attempt_count: number;
}

/**
 * Claim a batch of due messages atomically.
 *
 * SKIP LOCKED is what makes this safe to call from more than one place:
 * two callers never receive the same row. With a single process it is
 * belt-and-braces, but it also means a future second instance cannot
 * double-send an OTP or a campaign.
 *
 * Priority order: transactional before marketing, so an order update is
 * never stuck behind a 500-recipient broadcast.
 */
async function claimBatch(limit: number): Promise<ClaimedRow[]> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, to_msisdn, body, segment_count, encoding, attempt_count
         FROM sms_messages
        WHERE status = 'queued'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (scheduled_at IS NULL OR scheduled_at <= NOW())
        ORDER BY
          CASE category
            WHEN 'transactional' THEN 0
            WHEN 'marketing'     THEN 1
            ELSE 2
          END,
          created_at
        LIMIT ?
        FOR UPDATE SKIP LOCKED`,
      [limit],
    ) as [any[], any];

    if (rows.length === 0) {
      await connection.commit();
      return [];
    }

    const ids = rows.map((r: any) => r.id);
    await connection.query(
      `UPDATE sms_messages
          SET status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = NOW()
        WHERE id IN (?)`,
      [ids],
    );

    await connection.commit();
    return rows as ClaimedRow[];
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ── Outcomes ────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

/** Exponential backoff: 30s, 2m, 8m. Chosen short enough that a brief
 *  provider outage resolves inside the same working session. */
function backoffMs(attempt: number): number {
  const schedule = [30_000, 120_000, 480_000];
  return schedule[Math.min(Math.max(attempt, 1), schedule.length) - 1]!;
}

async function markSubmitted(
  row: ClaimedRow,
  result: SendResult,
): Promise<void> {
  await pool.query(
    `UPDATE sms_messages
        SET status = 'submitted', sent_at = NOW(), provider_ref = ?,
            http_status = ?, error_message = NULL, error_code = NULL
      WHERE id = ?`,
    [result.providerRef ?? null, result.httpStatus ?? null, row.id],
  );
  await recordSpend(row);
}

async function markRejected(
  row: ClaimedRow,
  result: SendResult,
): Promise<void> {
  // A rejection is terminal. Retrying a number the provider refused wastes
  // a rate-limit slot and, on a free test tier, a quota unit.
  await pool.query(
    `UPDATE sms_messages
        SET status = 'rejected', error_message = ?, error_code = ?, http_status = ?
      WHERE id = ?`,
    [result.error ?? "Rejected by provider", String(result.outcome), result.httpStatus ?? null, row.id],
  );
}

async function markFailed(
  row: ClaimedRow,
  result: SendResult,
): Promise<void> {
  if (row.attempt_count < MAX_ATTEMPTS) {
    // Requeue with backoff. status returns to 'queued' so the claim query
    // picks it up once next_attempt_at passes.
    const delay = backoffMs(row.attempt_count);
    await pool.query(
      `UPDATE sms_messages
          SET status = 'queued', next_attempt_at = ?, error_message = ?
        WHERE id = ?`,
      [new Date(Date.now() + delay), result.error ?? "Transient failure", row.id],
    );
    return;
  }

  await pool.query(
    `UPDATE sms_messages
        SET status = 'failed', error_message = ?
      WHERE id = ?`,
    [result.error ?? "Retries exhausted", row.id],
  );
}

async function recordSpend(row: ClaimedRow): Promise<void> {
  await pool.query(
    `INSERT INTO sms_daily_spend (spend_date, message_count, segment_count, cost_min_etb, cost_max_etb)
     VALUES (CURDATE(), 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       message_count = message_count + 1,
       segment_count = segment_count + ?,
       cost_min_etb  = cost_min_etb + ?,
       cost_max_etb  = cost_max_etb + ?`,
    [row.segment_count, row.segment_count * 0.1, row.segment_count * 0.45,
     row.segment_count, row.segment_count * 0.1, row.segment_count * 0.45],
  );
}

/**
 * Daily ceiling. Uses the WORST-case price from each queued message so a
 * campaign that would blow the limit is stopped before it starts rather
 * than discovered mid-send.
 */
export async function isOverDailyBudget(): Promise<boolean> {
  const limit = Number(process.env.SMS_MAX_DAILY_COST_ETB ?? 3000);
  if (!Number.isFinite(limit) || limit <= 0) return false;

  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(cost_max_etb), 0) AS worst_case
       FROM sms_messages
      WHERE status IN ('queued','sending') AND created_at >= CURDATE()`,
  ) as [any[], any];

  const [spent] = await pool.query(
    "SELECT cost_max_etb AS today FROM sms_daily_spend WHERE spend_date = CURDATE()",
  ) as [any[], any];

  const total = Number(spent[0]?.today ?? 0) + Number(rows[0]?.worst_case ?? 0);
  return total > limit;
}

// ── Dispatcher ──────────────────────────────────────────────────────────

let running = false;

/**
 * Effective dispatch pacing after the active transport's constraints.
 *
 * SMS_DISPATCH_INTERVAL_MS and SMS_DISPATCH_BATCH_SIZE were written for an
 * HTTP provider, where a request is a request and the only limit is the
 * carrier. They are not universal, and applying them unchanged to a
 * handset-backed provider would fire a 25-message burst at a phone that can
 * reliably manage one message every few seconds. Every message past the
 * first would contend for the same radio, and the failures would arrive as
 * provider errors, which read like a broken account rather than a pacing
 * problem and are not retryable.
 *
 * So the transport gets a floor on the interval and a ceiling on the batch,
 * and the more conservative of (configured, transport) wins in both
 * directions. Operators can still slow a fast provider down; they cannot
 * outrun a slow one.
 *
 * Exported so the clamps are testable without standing up a dispatcher.
 */
export function effectiveSmsPacing(): {
  batchSize: number;
  intervalMs: number;
  /** True when the transport's limits, not the operator's settings, are binding. */
  clampedByProvider: boolean;
} {
  const transport = activeSmsTransport();

  const configuredBatch = Number(process.env.SMS_DISPATCH_BATCH_SIZE ?? 25);
  const configuredInterval = Number(process.env.SMS_DISPATCH_INTERVAL_MS ?? 2000);

  const batchSize = Math.max(
    1,
    Math.min(configuredBatch, transport.maxBatchSize),
  );
  const intervalMs = Math.max(configuredInterval, transport.minIntervalMs);

  return {
    batchSize,
    intervalMs,
    clampedByProvider:
      batchSize !== configuredBatch || intervalMs !== configuredInterval,
  };
}

/**
 * Drain one batch. Safe to call on a timer; the `running` flag prevents
 * overlapping ticks if a slow provider response outlasts the interval.
 */
export async function dispatchSmsBatch(): Promise<{ sent: number; failed: number }> {
  if (running) return { sent: 0, failed: 0 };

  if (!isSmsDispatchEnabled()) {
    return { sent: 0, failed: 0 };
  }

  running = true;
  let sent = 0;
  let failed = 0;

  try {
    if (await isOverDailyBudget()) {
      await pool.query(
        `INSERT INTO sms_daily_spend (spend_date, blocked_at)
         VALUES (CURDATE(), NOW())
         ON DUPLICATE KEY UPDATE blocked_at = NOW()`,
      );
      logger.warn("SMS daily budget exhausted - dispatcher idle until tomorrow");
      return { sent: 0, failed: 0 };
    }

    const { batchSize } = effectiveSmsPacing();
    const rows = await claimBatch(batchSize);

    for (const row of rows) {
      const result = await sendSms(row.to_msisdn, row.body);

      if (result.outcome === "accepted") {
        await markSubmitted(row, result);
        sent += 1;
      } else if (result.outcome === "rejected") {
        await markRejected(row, result);
        failed += 1;
      } else {
        await markFailed(row, result);
        failed += 1;
      }
    }

    if (rows.length > 0) {
      logger.info(`SMS dispatched: ${rows.length} attempted, ${sent} submitted, ${failed} not submitted`);
    }
  // A stuck row in 'sending' means the process died between the claim and
    // the outcome write. Those are requeued rather than failed: we do not
    // know whether the provider received them, and losing a message is worse
    // than the small chance of sending one twice.
    const recovered = await recoverStuckMessages();
    if (recovered > 0) {
      logger.warn(`SMS: recovered ${recovered} abandoned message(s) from a previous run`);
    }
  } catch (err) {
    logger.error("SMS dispatcher tick failed", err);
  } finally {
    running = false;
  }

  return { sent, failed };
}

/**
 * Recover rows abandoned in 'sending' — the process died mid-batch between
 * the claim and the outcome write. Without this those rows would sit in a
 * transient state forever and never be retried or reported.
 */
export async function recoverStuckMessages(): Promise<number> {
  const [result] = await pool.query(
    `UPDATE sms_messages
        SET status = 'queued',
            next_attempt_at = NOW(),
            error_message = 'Recovered after dispatcher interruption'
      WHERE status = 'sending'
        AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
  ) as [any, any];

  return result?.affectedRows ?? 0;
}

// ── Start / stop ────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;

/**
 * Begin the dispatch loop. Called once from server.ts.
 * No-ops when the active transport is unconfigured, so a machine without
 * outbound SMS credentials starts normally with SMS simply inert.
 */
export function startSmsDispatcher(): void {
  if (timer) return;

  const transport = activeSmsTransport();

  if (!isSmsConfigured()) {
    // Name the transport rather than a specific variable: with two providers
    // configured, "SMSETHIOPIA_API_KEY is not set" would be a confusing and
    // usually false thing to read on a box whose SMS is disabled because
    // TextBee is missing its device id.
    console.log(
      `[sms] Dispatcher disabled — ${transport.displayName} is not configured.`,
    );
    return;
  }

  const { batchSize, intervalMs, clampedByProvider } = effectiveSmsPacing();

  void dispatchSmsBatch();
  timer = setInterval(() => void dispatchSmsBatch(), intervalMs);

  console.log(
    `[sms] Dispatcher started on ${transport.displayName} ` +
      `(batch ${batchSize} every ${intervalMs}ms).`,
  );

  // Say so explicitly at boot. A handset-backed provider running at a
  // fraction of the configured rate looks like a malfunction from the
  // dashboard, and the logs should explain it before anyone goes looking.
  if (clampedByProvider) {
    console.log(
      `[sms] Pacing limited by ${transport.displayName}: ` +
        `${batchSize} message(s) per ${Math.round(intervalMs / 1000)}s ` +
        `(~${Math.round((batchSize * 60_000) / intervalMs)}/hour). ` +
        `SMS_DISPATCH_BATCH_SIZE / SMS_DISPATCH_INTERVAL_MS were raised to ` +
        `match what the provider can sustain.`,
    );
  }
}

export function stopSmsDispatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[sms] Dispatcher stopped.");
  }
}
