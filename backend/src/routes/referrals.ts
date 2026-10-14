/**
 * src/routes/referrals.ts
 * Asella Organic — Affiliate & Commission System (MySQL)
 *
 * Admin surface. Every route requires an admin session. Affiliate self-service
 * lives in routes/affiliatePortal.ts and never reaches this file.
 *
 * Commission crediting itself is NOT done here — it happens in the MySQL
 * trigger trg_order_delivered_commission when an order transitions to
 * 'Delivered'. Rule precedence for that trigger lives in lib/commission.ts
 * (mirrored in SQL) so the two stay in step.
 */

import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { require2FA } from "../middleware/2fa.js";
import { validate } from "../middleware/validate.js";
import { randomId } from "../lib/security.js";
import { buildAffiliateReport, currentWeekPeriod, renderAffiliateReportHtml, sendAffiliateReport } from "../lib/affiliateReport.js";
import { isMailConfigured } from "../lib/mailer.js";
import { z } from "zod";
import { entityIdParam } from "../lib/ids.js";

const router = Router();

// Every route in this file is admin-only. Applied once at the router level so
// a future route added below cannot accidentally ship without the guard.
router.use(authenticate, authorise("admin"));

const num = (v: unknown): number => Number(v ?? 0);

const paramId = entityIdParam;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  commission_type:  z.enum(["percentage", "fixed"]),
  commission_value: z.number().positive(),
  min_order_amount: z.number().nonnegative().default(0),
  max_commission:   z.number().positive().optional(),
});

const AffiliateRuleSchema = z.object({
  commission_type:  z.enum(["percentage", "fixed"]),
  commission_value: z.number().positive(),
  min_order_amount: z.number().nonnegative().default(0),
  max_commission:   z.number().positive().optional(),
});

const CreateAffiliateSchema = z.object({
  staff_id:  z.string().uuid("staff_id must be a valid UUID").optional(),
  full_name: z.string().trim().min(2, "full_name must be at least 2 characters").optional(),
  email:     z.string().email("Invalid email").optional(),
  phone:     z.string().trim().optional(),
}).refine(
  (d) => !!d.staff_id || !!d.full_name,
  { message: "Provide staff_id (for staff affiliate) OR full_name (for external affiliate)" }
);

const UpdateAffiliateSchema = z.object({
  full_name: z.string().trim().min(2).optional(),
  email:     z.string().email().optional(),
  phone:     z.string().trim().optional(),
  is_active: z.boolean().optional(),
}).refine(obj => Object.values(obj).some(v => v !== undefined), {
  message: "At least one field is required",
});

// ─── Commission config (global rule) ─────────────────────────────────────────

router.get("/config", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM referral_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
  ) as [RowDataPacket[], unknown];
  res.json({ success: true, data: rows[0] ?? null });
});

router.get("/config/history", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM referral_configs ORDER BY created_at DESC`
  ) as [RowDataPacket[], unknown];
  res.json({ success: true, data: rows });
});

router.post("/config", validate(ConfigSchema), async (req, res) => {
  const { commission_type, commission_value, min_order_amount, max_commission } =
    req.body as z.infer<typeof ConfigSchema>;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`UPDATE referral_configs SET is_active = false`);

    const newId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO referral_configs
         (id, commission_type, commission_value, min_order_amount, max_commission, is_active)
       VALUES (?, ?, ?, ?, ?, true)`,
      [newId, commission_type, commission_value, min_order_amount, max_commission ?? null]
    );

    const [rows] = await connection.query(
      `SELECT * FROM referral_configs WHERE id = ?`, [newId]
    ) as [RowDataPacket[], unknown];

    await connection.commit();
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await connection.rollback();
    console.error("[POST /referrals/config]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

// ─── Per-affiliate commission rules (item 1) ─────────────────────────────────

/**
 * GET /affiliates/:id/rule
 * Returns the affiliate's rule plus whether it is currently in effect, so the
 * UI can show "individual (active)" vs "falls back to standard".
 */
router.get("/affiliates/:id/rule", async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const [profileRows] = await pool.query(
    `SELECT id, rule_type FROM affiliate_profiles WHERE id = ? AND deleted_at IS NULL`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];
  if (!profileRows[0]) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }

  const [ruleRows] = await pool.query(
    `SELECT * FROM affiliate_commission_rules WHERE affiliate_id = ?`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];

  const [globalRows] = await pool.query(
    `SELECT * FROM referral_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
  ) as [RowDataPacket[], unknown];

  const profile = profileRows[0] as RowDataPacket;
  const rule = (ruleRows[0] ?? null) as RowDataPacket | null;

  res.json({
    success: true,
    data: {
      rule_type: profile.rule_type,
      // The individual rule only takes effect when rule_type = 'custom' AND the
      // rule row is active — otherwise the global config applies.
      effective: profile.rule_type === "custom" && rule !== null && Boolean(rule.is_active),
      rule,
      global_rule: globalRows[0] ?? null,
    },
  });
});

/**
 * PUT /affiliates/:id/rule
 * Upserts the affiliate's own rate. Writes to affiliate_commission_rules and
 * flips rule_type to 'custom' in one transaction so the rule is never visible
 * before it is actually consulted.
 */
router.put("/affiliates/:id/rule", validate(AffiliateRuleSchema), async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const body = req.body as z.infer<typeof AffiliateRuleSchema>;

  const [profileRows] = await pool.query(
    `SELECT id FROM affiliate_profiles WHERE id = ? AND deleted_at IS NULL`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];
  if (!profileRows[0]) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO affiliate_commission_rules
         (id, affiliate_id, commission_type, commission_value,
          min_order_amount, max_commission, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         commission_type  = VALUES(commission_type),
         commission_value = VALUES(commission_value),
         min_order_amount = VALUES(min_order_amount),
         max_commission   = VALUES(max_commission),
         is_active        = TRUE,
         updated_at       = NOW()`,
      [
        crypto.randomUUID(), affiliateId, body.commission_type,
        body.commission_value, body.min_order_amount, body.max_commission ?? null,
      ]
    );

    await connection.query(
      `UPDATE affiliate_profiles SET rule_type = 'custom', updated_at = NOW() WHERE id = ?`,
      [affiliateId]
    );

    const [rows] = await connection.query(
      `SELECT r.*, ap.rule_type
       FROM   affiliate_commission_rules r
       JOIN   affiliate_profiles ap ON ap.id = r.affiliate_id
       WHERE  r.affiliate_id = ?`,
      [affiliateId]
    ) as [RowDataPacket[], unknown];

    await connection.commit();
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    await connection.rollback();
    console.error("[PUT /referrals/affiliates/:id/rule]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

/**
 * DELETE /affiliates/:id/rule
 * Removes the individual rate and reverts the affiliate to the standard rule.
 * Already-credited commissions keep the rate they were calculated at, which is
 * snapshotted onto each ledger row.
 */
router.delete("/affiliates/:id/rule", async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const [profileRows] = await pool.query(
    `SELECT id FROM affiliate_profiles WHERE id = ? AND deleted_at IS NULL`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];
  if (!profileRows[0]) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `DELETE FROM affiliate_commission_rules WHERE affiliate_id = ?`, [affiliateId]
    );
    await connection.query(
      `UPDATE affiliate_profiles SET rule_type = 'global', updated_at = NOW() WHERE id = ?`,
      [affiliateId]
    );
    await connection.commit();
    res.json({ success: true, data: { message: "Reverted to the standard commission rule." } });
  } catch (err) {
    await connection.rollback();
    console.error("[DELETE /referrals/affiliates/:id/rule]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

// ─── Affiliate CRUD ──────────────────────────────────────────────────────────

router.post("/affiliates", validate(CreateAffiliateSchema), async (req, res) => {
  const body = req.body as z.infer<typeof CreateAffiliateSchema>;

  let code = "";
  for (let i = 0; i < 5; i++) {
    const candidate = `ASL-${randomId(3)}`;
    const [rows] = await pool.query(
      `SELECT 1 FROM affiliate_profiles WHERE referral_code = ?`, [candidate]
    ) as [RowDataPacket[], unknown];
    if (rows.length === 0) { code = candidate; break; }
  }
  if (!code) {
    res.status(500).json({ success: false, error: "Failed to generate unique referral code" });
    return;
  }

  if (body.staff_id) {
    const [staffRows] = await pool.query(
      `SELECT id, full_name FROM staff_users WHERE id = ? AND active = true AND deleted_at IS NULL`,
      [body.staff_id]
    ) as [RowDataPacket[], unknown];
    const staff = staffRows[0] as RowDataPacket | undefined;
    if (!staff) {
      res.status(404).json({ success: false, error: "Staff member not found or inactive" });
      return;
    }

    const [existingRows] = await pool.query(
      `SELECT id FROM affiliate_profiles WHERE user_id = ? AND deleted_at IS NULL`, [body.staff_id]
    ) as [RowDataPacket[], unknown];
    if (existingRows.length > 0) {
      res.status(409).json({ success: false, error: "Staff member already has an affiliate profile" });
      return;
    }

    const newId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO affiliate_profiles (id, user_id, referral_code, is_active)
       VALUES (?, ?, ?, true)`,
      [newId, body.staff_id, code]
    );
    return res.status(201).json({
      success: true,
      data: {
        id: newId,
        referral_code: code,
        affiliate_name: staff.full_name,
        type: "staff",
      },
    });
  }

  // External affiliate. Portal access is provisioned separately via
  // POST /affiliates/:id/portal-access — creating a profile does not by
  // itself create a login.
  const newExtId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO affiliate_profiles (id, user_id, full_name, email, phone, referral_code, is_active)
     VALUES (?, NULL, ?, ?, ?, ?, true)`,
    [newExtId, body.full_name, body.email ?? null, body.phone ?? null, code]
  );
  return res.status(201).json({
    success: true,
    data: {
      id: newExtId,
      referral_code: code,
      affiliate_name: body.full_name,
      type: "external",
    },
  });
});

/**
 * GET /affiliates
 *
 * Aggregates come from correlated subqueries rather than a multi-table join:
 * joining customers and referral_commissions together produced a cartesian
 * product, which inflated SUM(commission_amount) and the customer counts.
 */
router.get("/affiliates", async (req, res) => {
  const { active, from, to, rule_type } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ["ap.deleted_at IS NULL"];
  const values: unknown[] = [];
  const windowFrom = `${from} 00:00:00`;
  const windowTo   = `${to} 23:59:59`;

  if (active !== undefined) {
    conditions.push(`ap.is_active = ?`);
    values.push(active === "true");
  }
  if (rule_type === "custom" || rule_type === "global") {
    conditions.push(`ap.rule_type = ?`);
    values.push(rule_type);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  // Period-scoped aggregates only apply when both bounds are supplied;
  // otherwise each subquery falls back to lifetime totals.
  const scoped = Boolean(from && to);
  const custFilter   = scoped ? `AND referred_at BETWEEN ? AND ?` : "";
  const commFilter   = scoped ? `AND calculated_at BETWEEN ? AND ?` : "";
  const subValues    = scoped
    ? [windowFrom, windowTo, windowFrom, windowTo, windowFrom, windowTo,
       windowFrom, windowTo, windowFrom, windowTo]
    : [];

  const [rows] = await pool.query(
    `SELECT
       ap.id, ap.referral_code, ap.is_active, ap.rule_type,
       ap.total_earnings, ap.total_referrals, ap.clawback_pending, ap.created_at,
       COALESCE(s.full_name, ap.full_name)   AS full_name,
       COALESCE(s.username,  ap.email)        AS identifier,
       CASE WHEN ap.user_id IS NOT NULL THEN 'staff' ELSE 'external' END AS affiliate_type,
       (SELECT COUNT(*) FROM customers c
         WHERE c.referred_by_affiliate_id = ap.id
           AND c.deleted_at IS NULL ${custFilter})              AS total_customers,
       (SELECT COALESCE(SUM(rc.commission_amount), 0)
          FROM referral_commissions rc
         WHERE rc.affiliate_id = ap.id ${commFilter})            AS total_commissions_amount,
       (SELECT COUNT(*) FROM referral_commissions rc
         WHERE rc.affiliate_id = ap.id AND rc.status = 'pending' ${commFilter})
                                                                    AS pending_count,
       (SELECT COUNT(*) FROM referral_commissions rc
         WHERE rc.affiliate_id = ap.id AND rc.status = 'paid' ${commFilter})
                                                                    AS paid_count
     FROM affiliate_profiles ap
     LEFT JOIN staff_users s ON ap.user_id = s.id
     ${where}
     ORDER BY total_commissions_amount DESC`,
    [...subValues, ...values]
  ) as [RowDataPacket[], unknown];

  res.json({ success: true, data: rows });
});

router.get("/affiliates/:id", async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const [affRows] = await pool.query(
    `SELECT ap.*,
       COALESCE(s.full_name, ap.full_name) AS display_name,
       COALESCE(s.username,  ap.email)     AS identifier,
       CASE WHEN ap.user_id IS NOT NULL THEN 'staff' ELSE 'external' END AS affiliate_type
     FROM affiliate_profiles ap
     LEFT JOIN staff_users s ON ap.user_id = s.id
     WHERE ap.id = ? AND ap.deleted_at IS NULL`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];

  const affiliate = affRows[0] as RowDataPacket | undefined;
  if (!affiliate) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }

  const [customers] = await pool.query(
    `SELECT id, name, phone, city, total_orders, total_spent, referred_at
     FROM customers WHERE referred_by_affiliate_id = ? AND deleted_at IS NULL
     ORDER BY referred_at DESC LIMIT 10`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];

  res.json({ success: true, data: { ...affiliate, recent_customers: customers } });
});

router.patch("/affiliates/:id", validate(UpdateAffiliateSchema), async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const body = req.body as z.infer<typeof UpdateAffiliateSchema>;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.full_name !== undefined) { updates.push(`full_name = ?`); values.push(body.full_name); }
  if (body.email     !== undefined) { updates.push(`email = ?`);     values.push(body.email); }
  if (body.phone     !== undefined) { updates.push(`phone = ?`);     values.push(body.phone); }
  if (body.is_active !== undefined) { updates.push(`is_active = ?`); values.push(body.is_active); }

  values.push(affiliateId);
  try {
    const [result] = await pool.query(
      `UPDATE affiliate_profiles SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      values
    ) as [{ affectedRows: number }, unknown];
    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: "Affiliate not found" });
      return;
    }
    res.json({ success: true, data: { message: "Affiliate updated." } });
  } catch (err) {
    console.error("[PATCH /referrals/affiliates/:id]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /affiliates/:id/portal-access  (item 2)
 * Provisions a staff_users login with role 'affiliate' so an affiliate can
 * reach their own dashboard. Returns the generated password exactly once.
 *
 * Staff affiliates already have a login and are rejected here — they should
 * simply use their existing account.
 */
router.post("/affiliates/:id/portal-access", require2FA, async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const [rows] = await pool.query(
    `SELECT ap.id, ap.user_id, ap.full_name, ap.email, ap.phone, ap.is_active,
            ap.deleted_at, ap.referral_code
     FROM   affiliate_profiles ap
     WHERE  ap.id = ?`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];

  const profile = rows[0] as RowDataPacket | undefined;
  if (!profile || profile.deleted_at) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }
  if (!profile.is_active) {
    res.status(409).json({ success: false, error: "Activate the affiliate before granting portal access." });
    return;
  }
  if (profile.user_id) {
    res.status(409).json({
      success: false,
      error: "This affiliate already has a linked account and should log in with it.",
    });
    return;
  }

  const email = profile.email as string | null;
  if (!email) {
    res.status(422).json({
      success: false,
      error: "Add an email address to this affiliate before granting portal access.",
    });
    return;
  }

  const [emailRows] = await pool.query(
    `SELECT id FROM staff_users WHERE email = ? AND deleted_at IS NULL`, [email]
  ) as [RowDataPacket[], unknown];
  if (emailRows.length > 0) {
    res.status(409).json({ success: false, error: "That email is already used by another account." });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const userId = crypto.randomUUID();
    // `affiliate_profiles.referral_code` is NOT NULL UNIQUE, so a suffixed
    // username derived from it is unique as well.
    //
    // referral_code has to be selected above for this to work: without it
    // the expression collapsed every affiliate onto the literal username
    // "aff_". staff_users.username is UNIQUE, so the first grant silently
    // created a junk login and every later grant died on
    //   ER_DUP_ENTRY Duplicate entry 'aff_' for key 'username'
    // which the generic catch reported as a 500. The random fallback keeps
    // a missing code from reproducing that.
    const codePart = String(profile.referral_code ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const username = `aff_${codePart || crypto.randomBytes(4).toString("hex")}`;
    // Temporary password — the affiliate must change it on first login.
    const tempPassword = `Asella!${crypto.randomBytes(6).toString("hex")}`;

    await connection.query(
      `INSERT INTO staff_users
         (id, username, password_hash, full_name, role, email, phone, active, must_change_password)
       VALUES (?, ?, ?, ?, 'affiliate', ?, ?, TRUE, TRUE)`,
      [
        userId, username,
        await bcrypt.hash(tempPassword, 10),
        profile.full_name ?? username, email, profile.phone ?? null,
      ]
    );

    await connection.query(
      `UPDATE affiliate_profiles SET user_id = ?, updated_at = NOW() WHERE id = ?`,
      [userId, affiliateId]
    );

    await connection.query(
      `INSERT INTO audit_log (table_name, record_id, actor, action, new_values)
       VALUES ('affiliate_profiles', ?, ?, 'AFFILIATE_PORTAL_ACCESS', ?)`,
      [affiliateId, req.user!.id, JSON.stringify({ userId, username })]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: {
        user_id: userId,
        username,
        temporary_password: tempPassword,
        note: "Shown once. The affiliate must change it on first login.",
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("[POST /referrals/affiliates/:id/portal-access]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

/**
 * DELETE /affiliates/:id  (item 3)
 * Soft delete. Deactivation is kept as a separate, reversible action; this
 * removes the affiliate from the system while preserving the commission
 * ledger, because referral_commissions would otherwise cascade-delete the
 * financial history.
 *
 * Refuses while money is still owed, so an affiliate cannot be removed with
 * unpaid commissions outstanding.
 */
router.delete("/affiliates/:id", require2FA, async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const [rows] = await pool.query(
    `SELECT ap.id, COALESCE(s.full_name, ap.full_name, ap.referral_code) AS name,
            (SELECT COUNT(*) FROM referral_commissions rc
              WHERE rc.affiliate_id = ap.id AND rc.status = 'pending')  AS pending_count,
            (SELECT COALESCE(SUM(rc.commission_amount), 0)
               FROM referral_commissions rc
              WHERE rc.affiliate_id = ap.id AND rc.status = 'pending') AS pending_amount
     FROM   affiliate_profiles ap
     LEFT   JOIN staff_users s ON s.id = ap.user_id
     WHERE  ap.id = ? AND ap.deleted_at IS NULL`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];

  const affiliate = rows[0] as RowDataPacket | undefined;
  if (!affiliate) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }

  if (num(affiliate.pending_count) > 0) {
    res.status(409).json({
      success: false,
      error: `${affiliate.name} has ${num(affiliate.pending_count)} unpaid commission(s) totalling ETB ${num(affiliate.pending_amount).toFixed(2)}. Mark them paid or reverse them first.`,
    });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE affiliate_profiles
       SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [affiliateId]
    );

    // Revoke any linked portal login.
    if (affiliate.user_id) {
      await connection.query(
        `UPDATE staff_users SET active = FALSE, updated_at = NOW() WHERE id = ?`,
        [(affiliate as RowDataPacket).user_id as string]
      );
      await connection.query(
        `DELETE FROM refresh_tokens WHERE user_id = ?`,
        [(affiliate as RowDataPacket).user_id as string]
      );
    }

    // Referral codes must stay unique; free the code for reuse.
    await connection.query(
      `UPDATE affiliate_profiles
       SET referral_code = CONCAT(referral_code, '-RETIRED-', LEFT(id, 8))
       WHERE id = ?`,
      [affiliateId]
    );

    await connection.query(
      `INSERT INTO audit_log (table_name, record_id, actor, action, new_values)
       VALUES ('affiliate_profiles', ?, ?, 'AFFILIATE_DELETED', ?)`,
      [affiliateId, req.user!.id, JSON.stringify({ name: affiliate.name })]
    );

    await connection.commit();
    res.json({ success: true, data: { message: `${affiliate.name} deleted. Commission history retained.` } });
  } catch (err) {
    await connection.rollback();
    console.error("[DELETE /referrals/affiliates/:id]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

// ─── Commissions ─────────────────────────────────────────────────────────────

router.get("/affiliates/:id/commissions", async (req, res) => {
  const affiliateId = paramId(req.params.id);
  if (!affiliateId) {
    res.status(400).json({ success: false, error: "Invalid affiliate ID" });
    return;
  }

  const page   = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit  = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "20")));
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT rc.*, c.name AS customer_name, c.phone AS customer_phone
     FROM   referral_commissions rc
     LEFT   JOIN customers c ON rc.customer_id = c.id
     WHERE  rc.affiliate_id = ?
     ORDER  BY rc.calculated_at DESC LIMIT ? OFFSET ?`,
    [affiliateId, limit, offset]
  ) as [RowDataPacket[], unknown];

  const [cntRows] = await pool.query(
    `SELECT COUNT(*) as count FROM referral_commissions WHERE affiliate_id = ?`,
    [affiliateId]
  ) as [RowDataPacket[], unknown];

  res.json({
    success: true,
    data: rows,
    total: parseInt(String((cntRows[0] as RowDataPacket).count), 10),
    page,
    limit,
  });
});

router.get("/commissions", async (req, res) => {
  const { status, affiliate_id } = req.query as Record<string, string | undefined>;
  const page   = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit  = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50")));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (status)          { conditions.push(`rc.status = ?`);        values.push(status); }
  if (affiliate_id)    { conditions.push(`rc.affiliate_id = ?`);  values.push(affiliate_id); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `SELECT rc.id, rc.order_id, rc.commission_amount, rc.commission_type,
            rc.commission_value, rc.order_total, rc.status, rc.rule_source,
            rc.clawback_settled, rc.reversal_reason, rc.reversed_at,
            rc.calculated_at, rc.paid_at,
            COALESCE(s.full_name, ap.full_name) AS affiliate_name,
            ap.referral_code,
            c.name  AS customer_name,
            c.phone AS customer_phone
     FROM   referral_commissions rc
     JOIN   affiliate_profiles ap ON rc.affiliate_id = ap.id
     LEFT   JOIN staff_users   s   ON ap.user_id = s.id
     LEFT   JOIN customers     c   ON rc.customer_id = c.id
     ${where}
     ORDER  BY rc.calculated_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  ) as [RowDataPacket[], unknown];

  const [cntRows] = await pool.query(
    `SELECT COUNT(*) as count FROM referral_commissions rc ${where}`, values
  ) as [RowDataPacket[], unknown];

  res.json({
    success: true,
    data: rows,
    total: parseInt(String((cntRows[0] as RowDataPacket).count), 10),
    page,
    limit,
  });
});

/**
 * PATCH /commissions/:id/pay
 *
 * Marks paid and books the matching expense in a single transaction, so a
 * failure can never leave a paid commission with no expense record (or the
 * reverse) — the previous implementation updated the status and inserted the
 * expense as two independent statements.
 *
 * Refuses to pay a reversed commission or one whose order is no longer
 * delivered. Any outstanding clawback is netted off the expense.
 */
router.patch("/commissions/:id/pay", require2FA, async (req, res) => {
  const commissionId = paramId(req.params.id);
  if (!commissionId) {
    res.status(400).json({ success: false, error: "Invalid commission ID" });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the row so two concurrent Mark Paid calls cannot both proceed.
    const [existRows] = await connection.query(
      `SELECT rc.*, ap.referral_code, ap.clawback_pending,
              COALESCE(s.full_name, ap.full_name, ap.referral_code) AS affiliate_name,
              o.status AS order_status
       FROM   referral_commissions rc
       JOIN   affiliate_profiles ap ON rc.affiliate_id = ap.id
       LEFT   JOIN staff_users   s   ON ap.user_id = s.id
       LEFT   JOIN orders        o   ON o.id = rc.order_id
       WHERE  rc.id = ?
       FOR UPDATE`,
      [commissionId]
    ) as [RowDataPacket[], unknown];

    const commission = existRows[0] as RowDataPacket | undefined;
    if (!commission) {
      await connection.rollback();
      res.status(404).json({ success: false, error: "Commission not found" });
      return;
    }
    if (commission.status === "paid") {
      await connection.rollback();
      res.status(409).json({ success: false, error: "Commission already marked as paid" });
      return;
    }
    if (commission.status === "reversed") {
      await connection.rollback();
      res.status(409).json({
        success: false,
        error: "This commission was reversed and cannot be paid.",
      });
      return;
    }

    const orderStatus = commission.order_status as string | null;
    if (commission.order_id && orderStatus && orderStatus !== "Delivered") {
      await connection.rollback();
      res.status(409).json({
        success: false,
        error: `Order ${commission.order_id} is "${orderStatus}", not "Delivered". This commission can no longer be paid.`,
      });
      return;
    }

    const amount = num(commission.commission_amount);

    // Net any clawback owed by this affiliate against this payout.
    const clawback = num(commission.clawback_pending);
    const netPayout = Math.max(0, amount - clawback);

    await connection.query(
      `UPDATE referral_commissions
       SET status = 'paid', paid_at = NOW(), paid_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [req.user!.id, commissionId]
    );

    await connection.query(
      `INSERT INTO commission_events
         (id, commission_id, affiliate_id, order_id, event_type,
          from_status, to_status, amount, actor, note)
       VALUES (?, ?, ?, ?, 'PAID', 'pending', 'paid', ?, ?, ?)`,
      [
        crypto.randomUUID(), commissionId, commission.affiliate_id,
        commission.order_id, amount, req.user!.id,
        clawback > 0 ? `Paid ${netPayout.toFixed(2)} net of ${clawback.toFixed(2)} clawback` : null,
      ]
    );

    // Book the payout as an expense so it deducts from revenue.
    if (netPayout > 0) {
      await connection.query(
        `INSERT INTO expenses (id, category, description, amount, notes, recorded_by)
         VALUES (?, 'affiliate_payout', ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          `Affiliate commission payout to ${commission.affiliate_name} (${commission.referral_code})`,
          netPayout,
          `Commission ID: ${commissionId}, Order: ${commission.order_id ?? "N/A"}`,
          req.user!.id,
        ]
      );
    }

    // Clawback is settled once it has been withheld from a payout.
    if (clawback > 0) {
      await connection.query(
        `UPDATE affiliate_profiles SET clawback_pending = 0, updated_at = NOW() WHERE id = ?`,
        [commission.affiliate_id]
      );
      await connection.query(
        `UPDATE referral_commissions SET clawback_settled = 0
         WHERE affiliate_id = ? AND status = 'paid' AND clawback_settled = 1`,
        [commission.affiliate_id]
      );
    }

    const [updated] = await connection.query(
      `SELECT * FROM referral_commissions WHERE id = ?`, [commissionId]
    ) as [RowDataPacket[], unknown];

    await connection.commit();

    res.json({
      success: true,
      data: { ...(updated[0] as RowDataPacket), net_payout: netPayout, clawback_applied: clawback },
    });
  } catch (err) {
    await connection.rollback();
    console.error("[PATCH /referrals/commissions/:id/pay]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

/**
 * POST /commissions/:id/reverse
 * Manual reversal when an admin needs to claw back a commission for a reason
 * other than an order status change. Order-status-driven reversal happens
 * automatically in the trigger.
 */
router.post("/commissions/:id/reverse", require2FA, async (req, res) => {
  const commissionId = paramId(req.params.id);
  if (!commissionId) {
    res.status(400).json({ success: false, error: "Invalid commission ID" });
    return;
  }

  const reason = typeof (req.body as { reason?: unknown })?.reason === "string"
    ? String((req.body as { reason: string }).reason).trim().slice(0, 255)
    : "Manual reversal by administrator";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, affiliate_id, order_id, status, commission_amount
       FROM referral_commissions WHERE id = ? FOR UPDATE`,
      [commissionId]
    ) as [RowDataPacket[], unknown];

    const commission = rows[0] as RowDataPacket | undefined;
    if (!commission) {
      await connection.rollback();
      res.status(404).json({ success: false, error: "Commission not found" });
      return;
    }
    if (commission.status === "reversed") {
      await connection.rollback();
      res.status(409).json({ success: false, error: "Commission is already reversed" });
      return;
    }
    if (commission.status === "paid") {
      await connection.rollback();
      res.status(409).json({
        success: false,
        error: "This commission was already paid. Cancel the order so the clawback is raised automatically.",
      });
      return;
    }

    await connection.query(
      `UPDATE referral_commissions
       SET status = 'reversed', reversed_at = NOW(), reversal_reason = ?
       WHERE id = ?`,
      [reason, commissionId]
    );

    await connection.query(
      `INSERT INTO commission_events
         (id, commission_id, affiliate_id, order_id, event_type,
          from_status, to_status, amount, actor, note)
       VALUES (?, ?, ?, ?, 'REVERSED', 'pending', 'reversed', ?, ?, ?)`,
      [
        crypto.randomUUID(), commissionId, commission.affiliate_id,
        commission.order_id, num(commission.commission_amount), req.user!.id, reason,
      ]
    );

    await connection.query(
      `UPDATE affiliate_profiles ap
       SET ap.total_earnings = (
             SELECT COALESCE(SUM(rc.commission_amount), 0)
             FROM   referral_commissions rc
             WHERE  rc.affiliate_id = ap.id AND rc.status <> 'reversed'
           ),
           ap.updated_at = NOW()
       WHERE  ap.id = ?`,
      [commission.affiliate_id]
    );

    await connection.commit();
    res.json({ success: true, data: { message: "Commission reversed." } });
  } catch (err) {
    await connection.rollback();
    console.error("[POST /referrals/commissions/:id/reverse]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

/** GET /commissions/:id/events — the audit trail for one commission. */
router.get("/commissions/:id/events", async (req, res) => {
  const commissionId = paramId(req.params.id);
  if (!commissionId) {
    res.status(400).json({ success: false, error: "Invalid commission ID" });
    return;
  }
  const [rows] = await pool.query(
    `SELECT * FROM commission_events WHERE commission_id = ? ORDER BY occurred_at ASC`,
    [commissionId]
  ) as [RowDataPacket[], unknown];
  res.json({ success: true, data: rows });
});

// ─── Stats ───────────────────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  const [statsRows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM affiliate_profiles WHERE deleted_at IS NULL)  AS total_affiliates,
       (SELECT COUNT(*) FROM affiliate_profiles
         WHERE deleted_at IS NULL AND is_active = TRUE)                   AS active_affiliates,
       (SELECT COUNT(DISTINCT referred_by_affiliate_id) FROM customers
         WHERE referred_by_affiliate_id IS NOT NULL AND deleted_at IS NULL) AS total_referred_customers,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM referral_commissions
         WHERE status <> 'reversed')                                      AS total_commissions_generated,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM referral_commissions
         WHERE status = 'paid')                                            AS total_paid,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM referral_commissions
         WHERE status = 'pending')                                         AS total_pending,
       (SELECT COUNT(*) FROM referral_commissions WHERE status = 'pending') AS pending_count,
       (SELECT COALESCE(SUM(commission_amount), 0) FROM referral_commissions
         WHERE status = 'reversed')                                        AS total_reversed,
       (SELECT COALESCE(SUM(clawback_pending), 0) FROM affiliate_profiles
         WHERE deleted_at IS NULL)                                         AS clawback_pending`
  ) as [RowDataPacket[], unknown];

  res.json({ success: true, data: statsRows[0] });
});

// ─── Reports (item 5) ────────────────────────────────────────────────────────

interface ReportTargetRow extends RowDataPacket {
  id: string;
  referral_code: string;
  full_name: string | null;
  email: string | null;
  identifier: string | null;
  is_active: number;
}

/** Affiliates that can actually receive a report: active, not deleted, emailed. */
async function reportTargets(affiliateId?: string): Promise<ReportTargetRow[]> {
  const params: unknown[] = [];
  let filter = `WHERE ap.deleted_at IS NULL AND ap.is_active = TRUE AND ap.user_id IS NOT NULL`;
  if (affiliateId) { filter += ` AND ap.id = ?`; params.push(affiliateId); }

  const [rows] = await pool.query(
    `SELECT ap.id, ap.referral_code, ap.full_name, ap.email,
            COALESCE(s.full_name, s.email, s.username) AS identifier, ap.is_active
     FROM   affiliate_profiles ap
     LEFT   JOIN staff_users s ON s.id = ap.user_id
     ${filter}`,
    params
  ) as [ReportTargetRow[], unknown];
  return rows;
}

/** GET /reports/preview?affiliate_id=…&from=…&to=… — HTML preview, no send. */
router.get("/reports/preview", async (req, res) => {
  const { affiliate_id, from, to } = req.query as Record<string, string | undefined>;

  const targets = await reportTargets(affiliate_id);
  if (targets.length === 0) {
    res.status(404).json({
      success: false,
      error: "No reportable affiliate found. Portal access must be granted and the account must be active.",
    });
    return;
  }

  const period = from && to
    ? { start: from, end: to }
    : currentWeekPeriod();

  const target = targets[0]!;
  const data = await buildAffiliateReport(pool, target.id, period);

  res.type("html").send(renderAffiliateReportHtml(data));
});

/** GET /reports/recipients — who can be emailed, so the UI is not guessing. */
router.get("/reports/recipients", async (_req, res) => {
  const targets = await reportTargets();
  res.json({
    success: true,
    // Both fields live inside `data` so the payload shape matches every other
    // endpoint in this router. The UI reads one object, not two siblings.
    data: {
      recipients: targets.map((t) => ({
        id: t.id,
        referral_code: t.referral_code,
        name: t.full_name ?? t.identifier ?? t.referral_code,
        email: t.email ?? t.identifier,
        has_email: Boolean(t.email ?? t.identifier),
      })),
      mail_configured: isMailConfigured(),
    },
  });
});

/**
 * POST /reports/send
 * body: { affiliate_id?: string, from?: string, to?: string }
 * Omitting affiliate_id sends to every eligible affiliate.
 */
router.post("/reports/send", require2FA, async (req, res) => {
  if (!isMailConfigured()) {
    res.status(503).json({
      success: false,
      error: "Email is not configured. Set SMTP_USER and SMTP_PASS before sending reports.",
    });
    return;
  }

  const body = (req.body ?? {}) as { affiliate_id?: string; from?: string; to?: string };
  const period = body.from && body.to
    ? { start: body.from, end: body.to }
    : currentWeekPeriod();

  const targets = await reportTargets(body.affiliate_id);
  if (targets.length === 0) {
    res.status(404).json({
      success: false,
      error: "No reportable affiliate found for the requested selection.",
    });
    return;
  }

  const results: Array<{ affiliate_id: string; name: string; status: string; error?: string }> = [];

  for (const target of targets) {
    const recipient = target.email ?? target.identifier;
    if (!recipient) {
      results.push({
        affiliate_id: target.id,
        name: target.full_name ?? target.referral_code,
        status: "failed",
        error: "No email address on file",
      });
      continue;
    }

    const outcome = await sendAffiliateReport({
      executor: pool,
      affiliateId: target.id,
      recipient,
      period,
      trigger: "manual",
      triggeredBy: req.user!.id,
    });

    results.push({
      affiliate_id: target.id,
      name: target.full_name ?? target.referral_code,
      status: outcome.status,
      ...(outcome.error ? { error: outcome.error } : {}),
    });
  }

  res.json({
    success: true,
    data: { period, sent: results.filter((r) => r.status === "sent").length, results },
  });
});

/** GET /reports/history — recent send log. */
router.get("/reports/history", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT rr.*, ap.referral_code
     FROM   report_runs rr
     LEFT   JOIN affiliate_profiles ap ON ap.id = rr.affiliate_id
     ORDER  BY rr.created_at DESC
     LIMIT  100`,
  ) as [RowDataPacket[], unknown];
  res.json({ success: true, data: rows });
});

export default router;
