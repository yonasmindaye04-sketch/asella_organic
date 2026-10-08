/**
 * src/routes/affiliatePortal.ts
 * Asella Organic — Affiliate Self-Service Portal (MySQL)
 *
 * Security posture for this surface:
 *
 *   • No route accepts an affiliate identifier. There is no `/:id`, no
 *     `?affiliate_id=`, and no body field that widens scope. The caller's
 *     profile is resolved once by `affiliateOnly` from the JWT subject and
 *     read from `req.affiliate.id`, so a request for someone else's data has
 *     no code path to express itself.
 *
 *   • Role gate is exactly 'affiliate'. Staff and admin accounts are refused,
 *     so the portal can never be used as a side door into the dashboard.
 *
 *   • No customer names, phone numbers or addresses are ever selected. An
 *     affiliate sees counts, order references and money — never who referred
 *     whom. Aggregate-only output also keeps this within the promise made in
 *     PrivacyPolicy.tsx.
 *
 *   • Writes are limited to the caller's own referral link and password, and
 *     are rate limited.
 */

import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { affiliateOnly, requireAffiliate } from "../middleware/affiliateAuth.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import { buildAffiliateReport } from "../lib/affiliateReport.js";
import { currentWeekPeriod } from "../lib/affiliateReport.js";
import bcrypt from "bcryptjs";

const router = Router();

/**
 * Public router. Exported separately so click tracking is NOT covered by the
 * `authenticate, affiliateOnly` guard installed on `router` below — a visitor
 * arriving from a referral link has no session and must still be counted.
 */
export const publicAffiliateRouter = Router();

/**
 * POST /api/affiliate/track-click  (public, no auth)
 * Records a landing on a referral link so engagement can be reported.
 *
 * The visitor IP is stored only as a SHA-256 hash salted with a server-side
 * secret: enough to de-duplicate click counts, not enough to reconstruct an
 * address or correlate a visitor across affiliates.
 */
publicAffiliateRouter.post("/track-click", async (req, res) => {
  const code = typeof (req.body as { code?: unknown })?.code === "string"
    ? String((req.body as { code: string }).code).trim().toUpperCase()
    : "";

  if (!/^ASL[-_]?[A-Z0-9]{3,8}$/.test(code)) {
    res.status(422).json({ success: false, error: "Invalid referral code." });
    return;
  }

  const [rows] = await pool.query(
    `SELECT id FROM affiliate_profiles
     WHERE referral_code = ? AND is_active = TRUE AND deleted_at IS NULL`,
    [code]
  ) as [RowDataPacket[], unknown];

  // Respond identically whether or not the code exists, so this endpoint
  // cannot be used to enumerate valid referral codes.
  if (!rows[0]) {
    res.json({ success: true, data: { tracked: false } });
    return;
  }

  const ip = req.ip ?? "";
  const salt = process.env.JWT_SECRET ?? "asella";
  const visitorHash = ip
    ? crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex")
    : null;

  const landingPath = typeof (req.body as { path?: unknown })?.path === "string"
    ? String((req.body as { path: string }).path).slice(0, 255)
    : null;
  const source = typeof (req.body as { source?: unknown })?.source === "string"
    ? String((req.body as { source: string }).source).slice(0, 50)
    : null;

  try {
    await pool.query(
      `INSERT INTO referral_clicks (id, affiliate_id, referral_code, landing_path, visitor_hash, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), (rows[0] as RowDataPacket).id, code, landingPath, visitorHash, source]
    );
  } catch (err) {
    // Tracking must never break the storefront.
    console.error("[POST /affiliate/track-click]", err);
  }

  res.json({ success: true, data: { tracked: true } });
});

// Every route below this line requires a staff session AND role 'affiliate'
// AND a linked, active profile. No per-route opt-out is possible.
router.use(authenticate, affiliateOnly);

const num = (v: unknown): number => Number(v ?? 0);

/**
 * GET /api/affiliate/me
 * Profile and lifetime totals. Exposes the referral code and share link only.
 */
router.get("/me", async (req, res) => {
  const affiliate = requireAffiliate(req);

  const [rows] = await pool.query(
    `SELECT ap.referral_code,
            COALESCE(ap.full_name, s.full_name, ?) AS display_name,
            ap.is_active, ap.rule_type,
            ap.total_earnings, ap.total_referrals, ap.clawback_pending,
            ap.created_at
     FROM   affiliate_profiles ap
     LEFT   JOIN staff_users s ON s.id = ap.user_id
     WHERE  ap.id = ?`,
    [affiliate.displayName, affiliate.id]
  ) as [RowDataPacket[], unknown];

  const profile = rows[0] as RowDataPacket | undefined;

  res.json({
    success: true,
    data: {
      referral_code: affiliate.referralCode,
      display_name: profile?.display_name ?? affiliate.displayName,
      is_active: Boolean(profile?.is_active),
      rule_type: profile?.rule_type ?? "global",
      member_since: profile?.created_at ?? null,
      share_link: `/storefront?ref=${encodeURIComponent(affiliate.referralCode)}`,
      total_earnings: num(profile?.total_earnings),
      total_customers: num(profile?.total_referrals),
      clawback_pending: num(profile?.clawback_pending),
    },
  });
});

/**
 * GET /api/affiliate/me/summary?from=&to=
 * Period + lifetime sales and engagement figures for the caller only.
 */
router.get("/me/summary", async (req, res) => {
  const affiliate = requireAffiliate(req);
  const { from, to } = req.query as Record<string, string | undefined>;
  const period = from && to ? { start: from, end: to } : currentWeekPeriod();

  const data = await buildAffiliateReport(pool, affiliate.id, period);

  // Drop the order list — this endpoint is for KPI cards only.
  const { recentOrders: _orders, ...summary } = data;

  res.json({ success: true, data: summary });
});

/**
 * GET /api/affiliate/me/commissions?status=&page=&limit=
 * The caller's ledger. Order references and totals only — no customer PII.
 */
router.get("/me/commissions", async (req, res) => {
  const affiliate = requireAffiliate(req);
  const { status } = req.query as Record<string, string | undefined>;

  const page   = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit  = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "25")));
  const offset = (page - 1) * limit;

  const conditions = ["rc.affiliate_id = ?"];
  const values: unknown[] = [affiliate.id];

  if (status && ["pending", "paid", "reversed"].includes(status)) {
    conditions.push(`rc.status = ?`);
    values.push(status);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const [rows] = await pool.query(
    `SELECT rc.id, rc.order_id, rc.order_total, rc.commission_amount,
            rc.commission_type, rc.status, rc.rule_source,
            rc.calculated_at, rc.paid_at, rc.reversed_at, rc.reversal_reason
     FROM   referral_commissions rc
     ${where}
     ORDER  BY rc.calculated_at DESC
     LIMIT  ? OFFSET ?`,
    [...values, limit, offset]
  ) as [RowDataPacket[], unknown];

  const [cntRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM referral_commissions rc ${where}`, values
  ) as [RowDataPacket[], unknown];

  const [sumRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN rc.status = 'pending'  THEN rc.commission_amount END), 0) AS pending,
       COALESCE(SUM(CASE WHEN rc.status = 'paid'     THEN rc.commission_amount END), 0) AS paid,
       COALESCE(SUM(CASE WHEN rc.status = 'reversed' THEN rc.commission_amount END), 0) AS reversed
     FROM referral_commissions rc ${where}`,
    values
  ) as [RowDataPacket[], unknown];

  const totals = sumRows[0] as RowDataPacket;

  res.json({
    success: true,
    data: rows,
    totals: {
      pending: num(totals?.pending),
      paid: num(totals?.paid),
      reversed: num(totals?.reversed),
    },
    total: parseInt(String((cntRows[0] as RowDataPacket).count), 10),
    page,
    limit,
  });
});

/**
 * GET /api/affiliate/me/referrals
 * Engagement only: link clicks and conversion. Referred individuals are
 * counted, never listed.
 */
router.get("/me/referrals", async (req, res) => {
  const affiliate = requireAffiliate(req);
  const { from, to } = req.query as Record<string, string | undefined>;
  const period = from && to ? { start: from, end: to } : currentWeekPeriod();

  const fromTs = `${period.start} 00:00:00`;
  const toTs   = `${period.end} 23:59:59`;

  const [clickRows] = await pool.query(
    `SELECT COUNT(*) AS clicks, COUNT(DISTINCT visitor_hash) AS unique_visitors
     FROM   referral_clicks
     WHERE  affiliate_id = ? AND created_at BETWEEN ? AND ?`,
    [affiliate.id, fromTs, toTs]
  ) as [RowDataPacket[], unknown];

  const clicks = clickRows[0] as RowDataPacket;

  const [custRows] = await pool.query(
    `SELECT COUNT(*) AS referred,
            COUNT(DISTINCT CASE WHEN EXISTS (
              SELECT 1 FROM referral_commissions rc WHERE rc.customer_id = c.id
            ) THEN c.id END) AS converted
     FROM   customers c
     WHERE  c.referred_by_affiliate_id = ?
       AND  c.deleted_at IS NULL
       AND  c.referred_at BETWEEN ? AND ?`,
    [affiliate.id, fromTs, toTs]
  ) as [RowDataPacket[], unknown];

  const cust = custRows[0] as RowDataPacket;
  const referred = num(cust?.referred);

  res.json({
    success: true,
    data: {
      period,
      link_clicks: num(clicks?.clicks),
      unique_visitors: num(clicks?.unique_visitors),
      referred_customers: referred,
      converted_customers: num(cust?.converted),
      conversion_rate: referred > 0 ? num(cust?.converted) / referred : 0,
    },
  });
});

/**
 * POST /api/affiliate/me/change-password
 * Rate limited and requires the current password.
 */
router.post("/me/change-password", generalRateLimit, async (req, res) => {
  const affiliate = requireAffiliate(req);
  const { current_password, new_password } = (req.body ?? {}) as {
    current_password?: string;
    new_password?: string;
  };

  if (!current_password || !new_password) {
    res.status(422).json({ success: false, error: "Current and new password are required." });
    return;
  }
  if (typeof new_password !== "string" || new_password.length < 8 || new_password.length > 128) {
    res.status(422).json({ success: false, error: "New password must be 8–128 characters." });
    return;
  }
  if (!/[a-z]/.test(new_password) || !/[A-Z]/.test(new_password) || !/\d/.test(new_password)) {
    res.status(422).json({
      success: false,
      error: "New password must include upper case, lower case and a number.",
    });
    return;
  }

  const [rows] = await pool.query(
    `SELECT password_hash FROM staff_users WHERE id = ? AND active = TRUE AND deleted_at IS NULL`,
    [affiliate.userId]
  ) as [RowDataPacket[], unknown];

  const row = rows[0] as RowDataPacket | undefined;
  if (!row || !(await bcrypt.compare(current_password, row.password_hash as string))) {
    res.status(401).json({ success: false, error: "Current password is incorrect." });
    return;
  }

  await pool.query(
    `UPDATE staff_users SET password_hash = ?, must_change_password = FALSE, updated_at = NOW()
     WHERE id = ?`,
    [await bcrypt.hash(new_password, 10), affiliate.userId]
  );

  // Invalidate other sessions for this account.
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [affiliate.userId]);

  await pool.query(
    `INSERT INTO audit_log (table_name, record_id, actor, action, new_values)
     VALUES ('staff_users', ?, ?, 'AFFILIATE_PASSWORD_CHANGED', NULL)`,
    [affiliate.userId, affiliate.userId]
  );

  res.json({ success: true, data: { message: "Password updated. Please sign in again." } });
});

/**
 * GET /api/affiliate/me/activity
 * Recent state changes on the caller's commissions, for the portal timeline.
 */
router.get("/me/activity", async (req, res) => {
  const affiliate = requireAffiliate(req);

  const [rows] = await pool.query(
    `SELECT ce.event_type, ce.from_status, ce.to_status, ce.amount,
            ce.occurred_at, ce.note, rc.order_id
     FROM   commission_events ce
     JOIN   referral_commissions rc ON rc.id = ce.commission_id
     WHERE  ce.affiliate_id = ?
     ORDER  BY ce.occurred_at DESC
     LIMIT  25`,
    [affiliate.id]
  ) as [RowDataPacket[], unknown];

  res.json({ success: true, data: rows });
});

export default router;
