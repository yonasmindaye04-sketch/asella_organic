/**
 * src/routes/referrals.ts
 * Asella Organic — Affiliate & Commission System (MySQL)
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { randomId } from "../lib/security.js";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (s: string) => UUID_RE.test(s);

const router = Router();

const ConfigSchema = z.object({
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

router.get("/config", authenticate, authorise("admin"), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM referral_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
  ) as [any[], any];
  res.json({ success: true, data: rows[0] ?? null });
});

router.get("/config/history", authenticate, authorise("admin"), async (_req, res) => {
  const [rows] = await pool.query(`SELECT * FROM referral_configs ORDER BY created_at DESC`) as [any[], any];
  res.json({ success: true, data: rows });
});

router.post("/config", authenticate, authorise("admin"), validate(ConfigSchema),
  async (req, res) => {
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
      
      const [rows] = await connection.query(`SELECT * FROM referral_configs WHERE id = ?`, [newId]) as [any[], any];
      await connection.commit();
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      await connection.rollback();
      console.error("[POST /referrals/config]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      connection.release();
    }
  }
);

router.post("/affiliates", authenticate, authorise("admin"),
  validate(CreateAffiliateSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof CreateAffiliateSchema>;

    let code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = `ASL-${randomId(3)}`;
      const [rows] = await pool.query(
        `SELECT 1 FROM affiliate_profiles WHERE referral_code = ?`, [candidate]
      ) as [any[], any];
      if (rows.length === 0) { code = candidate; break; }
    }
    if (!code) {
      res.status(500).json({ success: false, error: "Failed to generate unique referral code" });
      return;
    }

    if (body.staff_id) {
      const [staffRows] = await pool.query(
        `SELECT id, full_name FROM staff_users WHERE id = ? AND active = true`,
        [body.staff_id]
      ) as [any[], any];
      const staff = staffRows[0];
      if (!staff) {
        res.status(404).json({ success: false, error: "Staff member not found or inactive" });
        return;
      }
      const [existingRows] = await pool.query(
        `SELECT id FROM affiliate_profiles WHERE user_id = ?`, [body.staff_id]
      ) as [any[], any];
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
          id:             newId,
          referral_code:  code,
          affiliate_name: staff.full_name,
          type:           "staff",
        },
      });
    }

    const newExtId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO affiliate_profiles (id, user_id, full_name, email, phone, referral_code, is_active)
       VALUES (?, NULL, ?, ?, ?, ?, true)`,
      [newExtId, body.full_name, body.email ?? null, body.phone ?? null, code]
    );
    return res.status(201).json({
      success: true,
      data: {
        id:             newExtId,
        referral_code:  code,
        affiliate_name: body.full_name,
        type:           "external",
      },
    });
  }
);

router.get("/affiliates", authenticate, authorise("admin"), async (req, res) => {
  const { active } = req.query;
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (active !== undefined) {
    conditions.push(`ap.is_active = ?`);
    values.push(active === "true");
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT
       ap.id, ap.referral_code, ap.is_active,
       ap.total_earnings, ap.total_referrals, ap.created_at,
       COALESCE(s.full_name, ap.full_name)   AS full_name,
       COALESCE(s.username,  ap.email)        AS identifier,
       CASE WHEN ap.user_id IS NOT NULL THEN 'staff' ELSE 'external' END AS affiliate_type,
       COUNT(DISTINCT c.id)                        AS total_customers,
       COALESCE(SUM(rc.commission_amount), 0)       AS total_commissions_amount,
       COUNT(CASE WHEN rc.status='pending' THEN 1 END) AS pending_count,
       COUNT(CASE WHEN rc.status='paid'    THEN 1 END) AS paid_count
     FROM affiliate_profiles ap
     LEFT JOIN staff_users          s  ON ap.user_id = s.id
     LEFT JOIN customers            c  ON c.referred_by_affiliate_id = ap.id
     LEFT JOIN referral_commissions rc ON rc.affiliate_id = ap.id
     ${where}
     GROUP BY ap.id, ap.referral_code, ap.is_active, ap.total_earnings,
              ap.total_referrals, ap.created_at, ap.full_name, ap.email,
              s.full_name, s.username, ap.user_id
     ORDER BY ap.total_earnings DESC`,
    values
  ) as [any[], any];
  res.json({ success: true, data: rows });
});

router.get("/affiliates/:id", authenticate, authorise("admin"), async (req, res) => {
  const [affRows] = await pool.query(
    `SELECT ap.*,
       COALESCE(s.full_name, ap.full_name) AS display_name,
       COALESCE(s.username,  ap.email)     AS identifier,
       CASE WHEN ap.user_id IS NOT NULL THEN 'staff' ELSE 'external' END AS affiliate_type
     FROM affiliate_profiles ap
     LEFT JOIN staff_users s ON ap.user_id = s.id
     WHERE ap.id = ?`,
    [req.params.id]
  ) as [any[], any];
  const affiliate = affRows[0];
  if (!affiliate) {
    res.status(404).json({ success: false, error: "Affiliate not found" });
    return;
  }
  const [customers] = await pool.query(
    `SELECT id, name, phone, city, total_orders, total_spent, referred_at
     FROM customers WHERE referred_by_affiliate_id = ? AND deleted_at IS NULL
     ORDER BY referred_at DESC LIMIT 10`,
    [req.params.id]
  ) as [any[], any];
  res.json({ success: true, data: { ...affiliate, recent_customers: customers } });
});

router.patch("/affiliates/:id", authenticate, authorise("admin"),
  validate(UpdateAffiliateSchema),
  async (req, res) => {
    const affiliateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!affiliateId || !isValidUUID(affiliateId)) {
      res.status(400).json({ success: false, error: "Invalid affiliate ID" });
      return;
    }
    const body = req.body as z.infer<typeof UpdateAffiliateSchema>;
    const updates: string[] = [];
    const values:  unknown[] = [];

    if (body.full_name !== undefined) { updates.push(`full_name = ?`); values.push(body.full_name); }
    if (body.email     !== undefined) { updates.push(`email = ?`);     values.push(body.email); }
    if (body.phone     !== undefined) { updates.push(`phone = ?`);     values.push(body.phone); }
    if (body.is_active !== undefined) { updates.push(`is_active = ?`); values.push(body.is_active); }

    values.push(affiliateId);
    try {
      const [result] = await pool.query(
        `UPDATE affiliate_profiles SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = ?`,
        values
      ) as [any, any];
      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Affiliate not found" });
        return;
      }
      res.json({ success: true, data: { message: "Affiliate updated." } });
    } catch (err) {
      console.error("[PATCH /referrals/affiliates/:id]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.get("/affiliates/:id/commissions", authenticate, authorise("admin"),
  async (req, res) => {
    const page   = Math.max(1, parseInt((req.query.page  as string) || "1"));
    const limit  = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const offset = (page - 1) * limit;
    
    const [rows] = await pool.query(
      `SELECT rc.*, c.name AS customer_name, c.phone AS customer_phone
       FROM referral_commissions rc
       LEFT JOIN customers c ON rc.customer_id = c.id
       WHERE rc.affiliate_id = ?
       ORDER BY rc.calculated_at DESC LIMIT ? OFFSET ?`,
      [req.params.id, limit, offset]
    ) as [any[], any];
    
    const [cntRows] = await pool.query(
      `SELECT COUNT(*) as count FROM referral_commissions WHERE affiliate_id = ?`, [req.params.id]
    ) as [any[], any];
    
    res.json({ success: true, data: rows, total: parseInt(cntRows[0].count as string, 10), page, limit });
  }
);

router.get("/commissions", authenticate, authorise("admin"), async (req, res) => {
  const { status } = req.query;
  const page   = Math.max(1, parseInt((req.query.page  as string) || "1"));
  const limit  = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "50")));
  const offset = (page - 1) * limit;
  
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (status) { conditions.push(`rc.status = ?`); values.push(status); }
  
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const queryValues = [...values, limit, offset];
  
  const [rows] = await pool.query(
    `SELECT rc.id, rc.order_id, rc.commission_amount, rc.commission_type,
            rc.commission_value, rc.order_total, rc.status,
            rc.calculated_at, rc.paid_at,
            COALESCE(s.full_name, ap.full_name) AS affiliate_name,
            ap.referral_code,
            c.name  AS customer_name,
            c.phone AS customer_phone
     FROM referral_commissions rc
     JOIN affiliate_profiles ap ON rc.affiliate_id = ap.id
     LEFT JOIN staff_users   s  ON ap.user_id = s.id
     LEFT JOIN customers     c  ON rc.customer_id = c.id
     ${where}
     ORDER BY rc.calculated_at DESC LIMIT ? OFFSET ?`,
    queryValues
  ) as [any[], any];
  
  const [cntRows] = await pool.query(
    `SELECT COUNT(*) as count FROM referral_commissions rc ${where}`, values
  ) as [any[], any];
  
  res.json({ success: true, data: rows, total: parseInt(cntRows[0].count as string, 10), page, limit });
});

router.patch("/commissions/:id/pay", authenticate, authorise("admin"), async (req, res) => {
  const [existRows] = await pool.query(
    `SELECT id, status FROM referral_commissions WHERE id = ?`, [req.params.id]
  ) as [any[], any];
  const existing = existRows[0];
  if (!existing) {
    res.status(404).json({ success: false, error: "Commission not found" });
    return;
  }
  if (existing.status === "paid") {
    res.status(409).json({ success: false, error: "Commission already marked as paid" });
    return;
  }
  await pool.query(
    `UPDATE referral_commissions SET status = 'paid', paid_at = NOW()
     WHERE id = ?`,
    [req.params.id]
  );
  
  const [updated] = await pool.query(`SELECT * FROM referral_commissions WHERE id = ?`, [req.params.id]) as [any[], any];
  res.json({ success: true, data: updated[0] });
});

router.get("/stats", authenticate, authorise("admin"), async (_req, res) => {
  const [statsRows] = await pool.query(
    `SELECT
       COUNT(DISTINCT ap.id)                                                AS total_affiliates,
       COUNT(DISTINCT CASE WHEN ap.is_active THEN ap.id END)               AS active_affiliates,
       COUNT(DISTINCT c.id)                                                AS total_referred_customers,
       COALESCE(SUM(rc.commission_amount), 0)                              AS total_commissions_generated,
       COALESCE(SUM(CASE WHEN rc.status='paid'    THEN rc.commission_amount END), 0) AS total_paid,
       COALESCE(SUM(CASE WHEN rc.status='pending' THEN rc.commission_amount END), 0) AS total_pending,
       COUNT(CASE WHEN rc.status='pending' THEN 1 END)                     AS pending_count
     FROM affiliate_profiles ap
     LEFT JOIN customers            c  ON c.referred_by_affiliate_id = ap.id
     LEFT JOIN referral_commissions rc ON rc.affiliate_id = ap.id`
  ) as [any[], any];
  res.json({ success: true, data: statsRows[0] });
});

export default router;
