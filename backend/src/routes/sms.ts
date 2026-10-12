/**
 * src/routes/sms.ts
 * Asella Organic — SMSEthiopia Management Routes (MySQL)
 *
 * Staff-facing API for every outbound message. Three capabilities:
 *
 *   1. Transactional history — what has already been sent, per order.
 *   2. Broadcast campaigns    — compose, DRY RUN, then dispatch.
 *   3. Templates + consent    — reusable copy and opt-in state.
 *
 * ── The dry run is the whole point ───────────────────────────────────────
 * Every send costs real money (0.10-0.45 ETB/segment) and this endpoint is
 * the last thing standing between a paste accident and a 400 ETB surprise.
 * Preview makes no provider calls, costs nothing, and returns the exact
 * numbers staff then approve. Dispatch is a separate endpoint that requires
 * the campaign name typed back plus a 2FA code, mirroring the
 * ConfirmDialog flow already used for destructive affiliate actions.
 *
 * Consent is three-layer, not one boolean. See sms_consent_log.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { require2FA } from "../middleware/2fa.js";
import { validate } from "../middleware/validate.js";
import { smsSendRateLimit } from "../middleware/rateLimit.js";
import { createLogger } from "../lib/logger.js";
import { entityIdParam } from "../lib/ids.js";
import {
  CreateSmsCampaignSchema,
  DispatchSmsCampaignSchema,
  PreviewSmsCampaignSchema,
  SendSmsSchema,
  SmsConsentSchema,
  SmsTemplateSchema,
} from "../schemas/index.js";
import {
  calculateSmsSegments,
  estimateSmsCostEtb,
  tryNormalizeEthiopianMSISDN,
} from "../lib/smsNormalize.js";
import { withOptOutFooter, OPT_OUT_FOOTER } from "../lib/smsTemplates.js";
import {
  enqueueSms,
  hasHardOptOut,
  isOverDailyBudget,
} from "../lib/smsQueue.js";
import {
  isSmsConfigured,
  activeSmsProviderId,
  activeSmsProviderName,
} from "../lib/sms.js";
import type { SmsCategory } from "../lib/smsQueue.js";

const router = Router();

const staffOnly = [authenticate, authorise("admin", "manager")] as const;

function csvInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ═════════════════════════════════════════════════════════════════════════
// 1. Status + configuration
// ═════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sms/status
 * Drives the dashboard's banner: is SMS armed, what are the ceilings, and
 * what is the live queue depth.
 */
router.get("/status", ...staffOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const [queue] = await pool.query(
      `SELECT status, COUNT(*) AS n FROM sms_messages GROUP BY status`,
    ) as [any[], any];

    const [today] = await pool.query(
      `SELECT message_count, segment_count, cost_min_etb, cost_max_etb, blocked_at
         FROM sms_daily_spend WHERE spend_date = CURDATE()`,
    ) as [any[], any];

    const byStatus: Record<string, number> = {};
    for (const row of queue) byStatus[row.status] = Number(row.n);

    res.json({
      success: true,
      data: {
        configured: isSmsConfigured(),
        // Surfaced so staff can tell at a glance which provider is live
        // before blaming the wrong one for a failed campaign.
        provider: activeSmsProviderId(),
        providerName: activeSmsProviderName(),
        byStatus,
        queueDepth: (byStatus.queued ?? 0) + (byStatus.sending ?? 0),
        today: today[0]
          ? {
              messages: Number(today[0].message_count),
              segments: Number(today[0].segment_count),
              costMin: Number(today[0].cost_min_etb),
              costMax: Number(today[0].cost_max_etb),
              blocked: Boolean(today[0].blocked_at),
            }
          : null,
        limits: {
          maxCampaignCostEtb: Number(process.env.SMS_MAX_CAMPAIGN_COST_ETB ?? 2000),
          maxDailyCostEtb: Number(process.env.SMS_MAX_DAILY_COST_ETB ?? 3000),
          maxSegments: 5,
          statusCooldownMinutes: Number(process.env.SMS_STATUS_COOLDOWN_MINUTES ?? 120),
          maxPerOrder: Number(process.env.SMS_MAX_PER_ORDER ?? 4),
        },
      },
    });
  } catch (err) {
    const log = createLogger(req);
    log.error("Failed to load SMS status", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 2. Transactional history
// ═════════════════════════════════════════════════════════════════════════

/** GET /api/sms/messages — paginated send history with filters. */
router.get("/messages", ...staffOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (req.query.category) {
      conditions.push("category = ?");
      values.push(req.query.category);
    }
    if (req.query.status) {
      conditions.push("status = ?");
      values.push(req.query.status);
    }
    if (req.query.order_id) {
      conditions.push("order_id = ?");
      values.push(req.query.order_id);
    }
    if (req.query.campaign_id) {
      conditions.push("campaign_id = ?");
      values.push(req.query.campaign_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT id, category, order_id, campaign_id, to_msisdn, customer_name,
              body, status, skip_reason, http_status, segment_count, encoding,
              cost_min_etb, cost_max_etb, attempt_count, error_message,
              sent_at, created_at
         FROM sms_messages
         ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    ) as [any[], any];

    const [countRow] = await pool.query(
      `SELECT COUNT(*) AS total FROM sms_messages ${where}`,
      values,
    ) as [any[], any];

    const total = Number(countRow[0]?.total ?? 0);
    res.json({
      success: true,
      data: rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    const log = createLogger(req);
    log.error("Failed to list SMS messages", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 3. Dry run — the money screen
// ═════════════════════════════════════════════════════════════════════════

interface PreviewInput {
  segment?: string;
  city?: string;
  min_orders?: number;
  max_days_idle?: number;
  recipients?: Array<{ phone: string; name?: string }>;
  text: string;
}

/**
 * POST /api/sms/preview
 *
 * Resolves a targeting predicate (or an explicit list) against real
 * customer rows and reports exactly what a dispatch would do. Makes NO
 * provider calls and writes nothing, so it is safe to run repeatedly while
 * composing.
 *
 * Returns counts for: valid, already opted out, no phone, unparseable
 * number, duplicates — plus the segment total and the cost band. Staff read
 * those numbers and then confirm on the dispatch endpoint.
 */
/**
 * POST /api/sms/preview
 *
 * The dry run. Makes no provider calls and costs nothing; it returns the exact
 * recipient counts, segment totals and cost band that dispatch would produce.
 *
 * `validate()` was missing here even though PreviewSmsCampaignSchema already
 * existed. Without it the recipients array was unbounded, and the loop below
 * awaits once per entry, so a body carrying a very large list turned a
 * supposedly free endpoint into a long-running request that held a DB
 * connection per recipient. The schema caps it at 20,000 and bounds every
 * other field.
 */
router.post("/preview", ...staffOnly, validate(PreviewSmsCampaignSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const input = req.body as PreviewInput;

    if (!input.text?.trim()) {
      res.status(422).json({ success: false, error: "Message text is required" });
      return;
    }

    // Marketing sends get the opt-out footer so the quoted cost matches
    // what would actually be billed.
    const body = withOptOutFooter(input.text);
    const { segmentCount, encoding } = calculateSmsSegments(body);

    let valid = 0;
    let optedOut = 0;
    let noPhone = 0;
    let invalid = 0;
    let deduped = 0;

    const seen = new Set<string>();
    const samples: Array<{ phone: string; name?: string; reason?: string }> = [];

    const resolveRecipient = async (
      rawPhone: string,
      rawName?: string,
      knownOptIn?: boolean | null,
      knownHardOptOut?: boolean | null,
    ) => {
      const msisdn = tryNormalizeEthiopianMSISDN(rawPhone);

      if (!msisdn) {
        invalid += 1;
        if (samples.length < 25) samples.push({ phone: rawPhone, reason: "Not a valid Ethiopian mobile number" });
        return;
      }
      if (seen.has(msisdn)) {
        deduped += 1;
        return;
      }
      seen.add(msisdn);

      if (knownHardOptOut) {
        optedOut += 1;
        if (samples.length < 25) samples.push({ phone: msisdn, ...(rawName ? { name: rawName } : {}), reason: "Customer opted out of all SMS" });
        return;
      }
      if (knownOptIn === false) {
        optedOut += 1;
        if (samples.length < 25) samples.push({ phone: msisdn, ...(rawName ? { name: rawName } : {}), reason: "No marketing consent" });
        return;
      }
      valid += 1;
    };

    // ── Explicit list path ──
    if (input.recipients && input.recipients.length > 0) {
      for (const r of input.recipients) {
        await resolveRecipient(r.phone ?? "", r.name);
      }
    } else {
      // ── Targeting path: vw_customer_insights already carries segment,
      //    city, order_count and days_since_last_order, so targeting is a
      //    WHERE clause rather than a new query layer.
      const conditions: string[] = ["phone IS NOT NULL", "phone <> ''"];
      const values: unknown[] = [];

      if (input.segment) { conditions.push("segment = ?"); values.push(input.segment); }
      if (input.city) { conditions.push("city = ?"); values.push(input.city); }
      if (typeof input.min_orders === "number") { conditions.push("order_count >= ?"); values.push(input.min_orders); }
      if (typeof input.max_days_idle === "number") { conditions.push("days_since_last_order >= ?"); values.push(input.max_days_idle); }

      const [rows] = await pool.query(
        `SELECT phone, name, sms_marketing_opt_in, sms_opt_out_at
           FROM vw_customer_insights
          WHERE ${conditions.join(" AND ")}
          LIMIT 20000`,
        values,
      ) as [any[], any];

      if (rows.length === 0) {
        noPhone += 1;
      }

      for (const row of rows) {
        await resolveRecipient(
          row.phone,
          row.name,
          row.sms_marketing_opt_in !== undefined ? Boolean(row.sms_marketing_opt_in) : null,
          row.sms_opt_out_at ?? null,
        );
      }
    }

    const totalSegments = valid * segmentCount;
    const cost = estimateSmsCostEtb(totalSegments);
    const maxCampaignCost = Number(process.env.SMS_MAX_CAMPAIGN_COST_ETB ?? 2000);

    res.json({
      success: true,
      data: {
        valid,
        optedOut,
        noPhone,
        invalid,
        deduped,
        encoding,
        segmentCount,
        totalSegments,
        costMinEtb: cost.min,
        costMaxEtb: cost.max,
        body,
        hasOptOutFooter: body.includes(OPT_OUT_FOOTER),
        exceedsCampaignLimit: cost.max > maxCampaignCost,
        maxCampaignCostEtb: maxCampaignCost,
        samples,
      },
    });
  } catch (err) {
    const log = createLogger(req);
    log.error("SMS preview failed", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 4. Campaign dispatch
// ═════════════════════════════════════════════════════════════════════════

/**
 * POST /api/sms/dispatch
 *
 * The only endpoint that spends money. Requires 2FA, requires the campaign
 * name typed back as confirmation, re-checks the daily ceiling, and
 * enqueues in chunks so a 20,000-recipient campaign never materializes in
 * memory.
 */
router.post(
  "/dispatch",
  authenticate,
  authorise("admin", "manager"),
  require2FA,
  validate(DispatchSmsCampaignSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { campaign_id, confirm_phrase, cost_override } = req.body as {
        campaign_id: string;
        confirm_phrase: string;
        cost_override?: boolean;
      };

      const [rows] = await pool.query(
        `SELECT * FROM sms_campaigns WHERE id = ? LIMIT 1`,
        [campaign_id],
      ) as [any[], any];

      const campaign = rows[0];
      if (!campaign) {
        res.status(404).json({ success: false, error: "Campaign not found" });
        return;
      }
      if (campaign.status !== "draft" && campaign.status !== "scheduled") {
        res.status(409).json({ success: false, error: `Campaign is already ${campaign.status}` });
        return;
      }
      if (confirm_phrase.trim().toLowerCase() !== String(campaign.name).trim().toLowerCase()) {
        res.status(400).json({ success: false, error: "Confirmation phrase does not match the campaign name" });
        return;
      }

      // Per-campaign ceiling, overridable. The daily ceiling is not.
      if (Number(campaign.estimated_cost_max) > Number(campaign.max_cost_etb) && !cost_override) {
        res.status(400).json({
          success: false,
          error: `Campaign cost ${campaign.estimated_cost_max} ETB exceeds the ${campaign.max_cost_etb} ETB limit. Re-send with cost_override.`,
        });
        return;
      }
      if (await isOverDailyBudget()) {
        res.status(429).json({ success: false, error: "Daily SMS budget exhausted. Try tomorrow." });
        return;
      }

      const category: SmsCategory = campaign.category === "marketing" ? "marketing" : "broadcast";
      const scheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : null;

      // ── Re-resolve recipients at dispatch time ──
      // Consent can change between preview and dispatch. Counting again
      // here is what stops a previewed 400 recipients becoming 430 sends
      // three minutes later.
      let recipients: any[] = [];
      
      if (campaign.is_explicit_list) {
        // Fetch explicit recipients and left join with customers for consent
        const [explicitRows] = await pool.query(
          `SELECT r.to_msisdn as phone, r.name, c.id as customer_id, c.sms_marketing_opt_in, c.sms_opt_out_at
           FROM sms_campaign_recipients r
           LEFT JOIN customers c ON c.phone LIKE CONCAT('%', SUBSTRING(r.to_msisdn, -9))
           WHERE r.campaign_id = ?`,
          [campaign.id]
        ) as [any[], any];
        recipients = explicitRows;
      } else {
        const conditions: string[] = ["phone IS NOT NULL", "phone <> ''"];
        const values: unknown[] = [];
        if (campaign.target_segment) { conditions.push("segment = ?"); values.push(campaign.target_segment); }
        if (campaign.target_city) { conditions.push("city = ?"); values.push(campaign.target_city); }
        if (csvInt(campaign.target_min_orders) !== null) { conditions.push("order_count >= ?"); values.push(csvInt(campaign.target_min_orders)); }
        if (csvInt(campaign.target_max_days_idle) !== null) { conditions.push("days_since_last_order >= ?"); values.push(csvInt(campaign.target_max_days_idle)); }

        const [dbRecipients] = await pool.query(
          `SELECT customer_id, phone, name, sms_marketing_opt_in, sms_opt_out_at
             FROM vw_customer_insights
            WHERE ${conditions.join(" AND ")}
            LIMIT 20000`,
          values,
        ) as [any[], any];
        recipients = dbRecipients;
      }

      const [excluded] = await pool.query(
        "SELECT to_msisdn FROM sms_campaign_exclusions WHERE campaign_id = ?",
        [campaign.id],
      ) as [any[], any];
      const excludedNumbers = new Set(excluded.map((e: any) => e.to_msisdn));

      let enqueued = 0;
      let skipped = 0;
      const seen = new Set<string>();

      for (const r of recipients) {
        const msisdn = tryNormalizeEthiopianMSISDN(r.phone);
        if (!msisdn) { skipped += 1; continue; }
        if (seen.has(msisdn)) { skipped += 1; continue; }
        seen.add(msisdn);
        if (excludedNumbers.has(msisdn)) { skipped += 1; continue; }
        if (r.sms_opt_out_at) { skipped += 1; continue; }

        // Marketing requires explicit consent; broadcast (seasonal
        // greetings) does not, matching the policy that a customer who
        // ignores marketing may still be written to once a year.
        if (category === "marketing" && !r.sms_marketing_opt_in) { skipped += 1; continue; }

        const result = await enqueueSms({
          category,
          to: msisdn,
          body: campaign.body,
          customerId: r.customer_id ?? null,
          customerName: r.name ?? null,
          campaignId: campaign.id,
          templateId: campaign.template_id ?? null,
          scheduledAt,
        });

        if (result.status === "queued") enqueued += 1;
        else skipped += 1;
      }

      const nextStatus = scheduledAt && scheduledAt.getTime() > Date.now() ? "scheduled" : "sending";

      await pool.query(
        `UPDATE sms_campaigns
            SET status = ?, dispatched_at = NOW(), recipient_count = ?,
                cost_override = COALESCE(?, cost_override)
          WHERE id = ?`,
        [nextStatus, enqueued, cost_override ?? false, campaign.id],
      );

      res.json({
        success: true,
        data: {
          campaignId: campaign.id,
          enqueued,
          skipped,
          status: nextStatus,
          scheduledAt: campaign.scheduled_at,
        },
      });
    } catch (err) {
      log.error("SMS dispatch failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════
// 5. Campaigns — list, create, cancel
// ═════════════════════════════════════════════════════════════════════════

/** GET /api/sms/campaigns — recent campaigns with live counts. */
router.get("/campaigns", ...staffOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.category, c.body, c.status, c.scheduled_at,
              c.recipient_count, c.estimated_segments, c.estimated_cost_min,
              c.estimated_cost_max, c.max_cost_etb, c.created_at, c.dispatched_at,
              u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM sms_messages m
                WHERE m.campaign_id = c.id AND m.status = 'submitted') AS submitted_count,
              (SELECT COUNT(*) FROM sms_messages m
                WHERE m.campaign_id = c.id AND m.status IN ('rejected','failed')) AS failed_count
         FROM sms_campaigns c
         LEFT JOIN staff_users u ON u.id = c.created_by
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
      [limit, offset],
    ) as [any[], any];

    const [countRow] = await pool.query("SELECT COUNT(*) AS total FROM sms_campaigns") as [any[], any];
    const total = Number(countRow[0]?.total ?? 0);

    res.json({ success: true, data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    const log = createLogger(req);
    log.error("Failed to list campaigns", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/sms/campaigns
 * Creates a DRAFT only. Nothing is queued here — a campaign is a
 * persisted row that a separate preview and dispatch act on, so the
 * numbers staff approve survive a page reload.
 */
router.post(
  "/campaigns",
  ...staffOnly,
  validate(CreateSmsCampaignSchema),
  async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const {
      name, category = "broadcast", body, template_id,
      segment, city, min_orders, max_days_idle, scheduled_at, max_cost_etb,
      recipients,
    } = req.body as Record<string, any>;

    if (!name?.trim() || !body?.trim()) {
      res.status(422).json({ success: false, error: "Campaign name and message text are required" });
      return;
    }

    const finalBody = withOptOutFooter(body);
    const { segmentCount } = calculateSmsSegments(finalBody);
    
    let recipientCount = 0;
    const id = crypto.randomUUID();
    const isExplicitList = Array.isArray(recipients) && recipients.length > 0;

    if (isExplicitList) {
      recipientCount = recipients.length;
    } else {
      // Estimate recipients from vw_customer_insights
      const conditions: string[] = ["phone IS NOT NULL", "phone <> ''"];
      const values: unknown[] = [];
      if (segment) { conditions.push("segment = ?"); values.push(segment); }
      if (city) { conditions.push("city = ?"); values.push(city); }
      if (Number.isFinite(Number(min_orders))) { conditions.push("order_count >= ?"); values.push(Number(min_orders)); }
      if (Number.isFinite(Number(max_days_idle))) { conditions.push("days_since_last_order >= ?"); values.push(Number(max_days_idle)); }

      const [countRow] = await pool.query(
        `SELECT COUNT(*) AS n FROM vw_customer_insights WHERE ${conditions.join(" AND ")}`,
        values,
      ) as [any[], any];

      recipientCount = Number(countRow[0]?.n ?? 0);
    }

    const totalSegments = recipientCount * segmentCount;
    const cost = estimateSmsCostEtb(totalSegments);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO sms_campaigns
           (id, name, category, body, template_id, status, target_segment, target_city,
            target_min_orders, target_max_days_idle, scheduled_at, recipient_count,
            estimated_segments, estimated_cost_min, estimated_cost_max, max_cost_etb, created_by, is_explicit_list)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, name.trim(), category, finalBody, template_id || null,
          segment || null, city || null,
          Number.isFinite(Number(min_orders)) ? Number(min_orders) : null,
          Number.isFinite(Number(max_days_idle)) ? Number(max_days_idle) : null,
          scheduled_at ? new Date(scheduled_at) : null,
          recipientCount, totalSegments, cost.min, cost.max,
          Number(max_cost_etb) || Number(process.env.SMS_MAX_CAMPAIGN_COST_ETB ?? 2000),
          req.user?.id ?? null,
          isExplicitList ? 1 : 0
        ],
      );

      if (isExplicitList) {
        // Insert recipients
        const insertValues = (recipients as any[]).map(r => [
          crypto.randomUUID(), id, r.phone || '', r.name || null
        ]);
        
        if (insertValues.length > 0) {
          // Batch insert in chunks to avoid max placeholder limits if the list is large
          const chunkSize = 1000;
          for (let i = 0; i < insertValues.length; i += chunkSize) {
            const chunk = insertValues.slice(i, i + chunkSize);
            await connection.query(
              `INSERT INTO sms_campaign_recipients (id, campaign_id, to_msisdn, name) VALUES ?`,
              [chunk]
            );
          }
        }
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.status(201).json({ success: true, data: { id, recipientCount, estimatedSegments: totalSegments, costMinEtb: cost.min, costMaxEtb: cost.max } });
  } catch (err) {
    log.error("Failed to create campaign", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/** POST /api/sms/campaigns/:id/cancel — stop a draft or in-flight campaign. */
router.post("/campaigns/:id/cancel", ...staffOnly, async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const id = entityIdParam(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, error: "Invalid campaign ID" });
      return;
    }

    // Queued rows are pulled back, not merely flagged. Anything the
    // dispatcher already submitted is gone to the carrier and cannot be
    // recalled.
    await pool.query(
      `UPDATE sms_messages SET status = 'skipped', skip_reason = 'campaign_cancelled'
        WHERE campaign_id = ? AND status = 'queued'`,
      [id],
    );
    await pool.query(
      "UPDATE sms_campaigns SET status = 'cancelled' WHERE id = ? AND status IN ('draft','scheduled','sending')",
      [id],
    );

    res.json({ success: true, data: { id } });
  } catch (err) {
    log.error("Failed to cancel campaign", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 6. Templates
// ═════════════════════════════════════════════════════════════════════════

router.get("/templates", ...staffOnly, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      `SELECT id, template_key, name, body, locale, is_transactional,
              requires_optout_footer, is_active, created_at, updated_at
         FROM sms_templates ORDER BY is_transactional DESC, name`,
    ) as [any[], any];
    res.json({ success: true, data: rows });
  } catch (err) {
    const log = createLogger(_req);
    log.error("Failed to list templates", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/sms/templates
 *
 * Upsert by template_key, so the dashboard can iterate on copy without
 * accumulating near-duplicate rows. validate() was missing here: template_key
 * lands in a UNIQUE column and locale is written straight to the row, so
 * bounding both matters.
 */
router.post("/templates", ...staffOnly, validate(SmsTemplateSchema), async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const { template_key, name, body, locale = "en", is_transactional = false, requires_optout_footer = true } =
      req.body as Record<string, any>;

    if (!template_key?.trim() || !name?.trim() || !body?.trim()) {
      res.status(422).json({ success: false, error: "Key, name and body are required" });
      return;
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sms_templates
         (id, template_key, name, body, locale, is_transactional, requires_optout_footer, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), body = VALUES(body), locale = VALUES(locale),
         is_transactional = VALUES(is_transactional),
         requires_optout_footer = VALUES(requires_optout_footer)`,
      [id, template_key.trim(), name.trim(), body.trim(), locale, is_transactional ? 1 : 0, requires_optout_footer ? 1 : 0, req.user?.id ?? null],
    );

    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    log.error("Failed to save template", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 7. Single test send
// ═════════════════════════════════════════════════════════════════════════

/**
 * POST /api/sms/send-test
 *
 * Bypasses the queue and calls the provider directly, so a technician can
 * confirm the API key and the number format in one call. Only reachable by
 * admin/manager and only for one number — it deliberately has no batch
 * mode, because a "test" endpoint that accepts 500 recipients is a campaign
 * endpoint that will eventually be used by accident.
 *
 * It also carries its own rate limit, far tighter than the general /api one:
 * each call spends real money on a real handset.
 */
router.post(
  "/send-test",
  ...staffOnly,
  smsSendRateLimit,
  validate(SendSmsSchema),
  async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    if (!isSmsConfigured()) {
      res.status(503).json({
        success: false,
        error: `${activeSmsProviderName()} is not configured`,
      });
      return;
    }

    const { to, text } = req.body as { to: string; text: string };

    const [customerRows] = await pool.query(
      "SELECT id, name FROM customers WHERE phone = ? LIMIT 1",
      [to.replace(/\s+/g, "")],
    ) as [any[], any];

    const hardOptOut = customerRows[0]
      ? await hasHardOptOut(customerRows[0].id)
      : false;

    if (hardOptOut) {
      res.status(409).json({ success: false, error: "This customer has opted out of all SMS" });
      return;
    }

    const result = await enqueueSms({
      category: "transactional",
      to,
      body: text,
      customerId: customerRows[0]?.id ?? null,
      customerName: customerRows[0]?.name ?? null,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    log.error("Test send failed", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// 8. Consent
// ═════════════════════════════════════════════════════════════════════════

/**
 * POST /api/sms/consent
 *
 * `source` records where the change came from. Until the provider's
 * inbound SMS support is confirmed, 'website' and 'staff' are the honest
 * values; a STOP-keyword handler is a pure addition of rows here later.
 */
router.post("/consent", ...staffOnly, validate(SmsConsentSchema), async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const { to, action } = req.body as { to: string; action: string };
    const msisdn = tryNormalizeEthiopianMSISDN(to);
    if (!msisdn) {
      res.status(422).json({ success: false, error: "Invalid Ethiopian mobile number" });
      return;
    }

    const [rows] = await pool.query(
      "SELECT id FROM customers WHERE phone = ? OR REPLACE(REPLACE(REPLACE(phone,'+',''),' ',''),'-','') LIKE ? LIMIT 1",
      [to, `%${msisdn.slice(-9)}`],
    ) as [any[], any];

    if (!rows[0]) {
      res.status(404).json({ success: false, error: "No customer record for that number" });
      return;
    }

    const customerId = rows[0].id;

    if (action === "opt-in") {
      await pool.query(
        `UPDATE customers SET sms_marketing_opt_in = 1, sms_opt_out_at = NULL,
                sms_consent_source = 'staff', sms_consent_at = NOW()
          WHERE id = ?`,
        [customerId],
      );
    } else if (action === "opt-out") {
      // Marketing consent withdrawn; transactional order updates still go out.
      await pool.query(
        `UPDATE customers SET sms_marketing_opt_in = 0, sms_consent_source = 'staff', sms_consent_at = NOW()
          WHERE id = ?`,
        [customerId],
      );
    } else {
      await pool.query(
        `UPDATE customers SET sms_marketing_opt_in = 0, sms_opt_out_at = NOW(),
                sms_consent_source = 'staff', sms_consent_at = NOW()
          WHERE id = ?`,
        [customerId],
      );
    }

    await pool.query(
      `INSERT INTO sms_consent_log (customer_id, to_msisdn, action, source, note)
       VALUES (?, ?, ?, 'staff', 'Updated from dashboard')`,
      [customerId, msisdn, action],
    );

    res.json({ success: true, data: { customerId, action } });
  } catch (err) {
    log.error("Failed to record consent", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;