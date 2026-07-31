/**
 * src/routes/expenses.ts
 * Asella Organic — Expenses Management Routes
 *
 * Endpoints:
 *   GET    /api/expenses           → list all expenses (filtered)
 *   GET    /api/expenses/summary   → KPI data for dashboard
 *   POST   /api/expenses           → manually record an expense
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { mirrorExpenseToSheets } from "../lib/sheets.js";
import { createLogger }          from "../lib/logger.js";


const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────

const CreateExpenseSchema = z.object({
  category:    z.enum(["vendor_purchase", "operational", "salary", "affiliate_payout", "other"]),
  description: z.string().trim().min(2).max(500),
  amount:      z.number().positive("Amount must be greater than 0"),
  notes:       z.string().trim().max(1000).optional(),
});

// ─── GET /api/expenses ────────────────────────────────────────────────────
// List all expenses with optional filters

router.get(
  "/",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const { category, from, to, page = "1", limit = "50" } = req.query as Record<string, string | undefined>;

    const PAGE   = Math.max(1, parseInt(page ?? "1", 10));
    const LIMIT  = Math.min(100, parseInt(limit ?? "50", 10));
    const OFFSET = (PAGE - 1) * LIMIT;

    const conditions: string[] = ["e.voided_at IS NULL"];
    const values: unknown[]    = [];

    if (category) { conditions.push("e.category = ?");     values.push(category); }
    if (from)     { conditions.push("e.created_at >= ?");   values.push(from); }
    if (to)       { conditions.push("e.created_at <= ?");   values.push(`${to} 23:59:59`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM expenses e ${where}`,
        values
      ) as [any[], any];

      const [rows] = await pool.query(
        `SELECT
           e.id,
           e.category,
           e.description,
           e.amount,
           e.vendor_order_id,
           e.notes,
           e.created_at,
           su.full_name AS recorded_by_name,
           su.username  AS recorded_by_username,
           vo.order_id  AS vendor_order_ref,
           vo.vendor_name
         FROM expenses e
         LEFT JOIN staff_users su ON e.recorded_by = su.id
         LEFT JOIN vendor_orders vo ON e.vendor_order_id = vo.id
         ${where}
         ORDER BY e.created_at DESC
         LIMIT ? OFFSET ?`,
        [...values, LIMIT, OFFSET]
      ) as [any[], any];

      res.json({
        success: true,
        data: rows,
        meta: {
          total: Number(total),
          page:  PAGE,
          limit: LIMIT,
          pages: Math.ceil(Number(total) / LIMIT),
        },
      });
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to list expenses", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/expenses/summary ────────────────────────────────────────────
// KPI data: totals, breakdown by category, monthly

router.get(
  "/summary",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { from, to } = req.query as Record<string, string | undefined>;

      const dateConditions: string[] = ["voided_at IS NULL"];
      const dateValues: unknown[] = [];

      if (from) { dateConditions.push("created_at >= ?"); dateValues.push(from); }
      if (to) { dateConditions.push("created_at <= ?"); dateValues.push(`${to} 23:59:59`); }

      const dateWhere = dateConditions.length ? `WHERE ${dateConditions.join(" AND ")}` : "";

      // Overall totals
      const [[totals]] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN category != 'vendor_purchase' THEN amount ELSE 0 END), 0) AS total_expenses,
           COALESCE(SUM(CASE WHEN category = 'vendor_purchase' THEN amount ELSE 0 END), 0) AS total_vendor_purchases,
           COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND category != 'vendor_purchase'
                             THEN amount ELSE 0 END), 0)                                AS this_month,
           COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND category != 'vendor_purchase'
                             THEN amount ELSE 0 END), 0)                                AS last_30_days,
           COUNT(*)                                                                      AS total_count
         FROM expenses
         ${dateWhere}`,
        dateValues
      ) as [any[], any];

      // Category breakdown
      const [categories] = await pool.query(
        `SELECT
           category,
           COALESCE(SUM(amount), 0) AS total,
           COUNT(*)                 AS count
         FROM expenses
         ${dateWhere}
         GROUP BY category
         ORDER BY total DESC`,
         dateValues
      ) as [any[], any];

      // Monthly totals (last 6 months) - operating expenses only
      const [monthly] = await pool.query(
        `SELECT
           DATE_FORMAT(created_at, '%Y-%m') AS month,
           COALESCE(SUM(amount), 0)         AS total,
           COUNT(*)                         AS count
         FROM expenses
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND category != 'vendor_purchase' AND voided_at IS NULL
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY month DESC`
      ) as [any[], any];

      // Calculate average monthly operating expenses
      const monthCount = monthly.length || 1;
      const avgMonthly = Number(totals.total_expenses) / Math.max(monthCount, 1);

      res.json({
        success: true,
        data: {
          total_expenses: Number(totals.total_expenses),
          total_vendor_purchases: Number(totals.total_vendor_purchases),
          this_month:     Number(totals.this_month),
          last_30_days:   Number(totals.last_30_days),
          total_count:    Number(totals.total_count),
          avg_monthly:    Math.round(avgMonthly * 100) / 100,
          categories,
          monthly,
        },
      });
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to fetch expense summary", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── POST /api/expenses ───────────────────────────────────────────────────
// Manually record a non-vendor expense

router.post(
  "/",
  authenticate,
  authorise("admin", "manager"),
  validate(CreateExpenseSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { category, description, amount, notes } = req.body as z.infer<typeof CreateExpenseSchema>;
    const id = crypto.randomUUID();

    try {
      await pool.query(
        `INSERT INTO expenses (id, category, description, amount, recorded_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, category, description, amount, req.user!.id, notes ?? null]
      );

      const [rows] = await pool.query(
        `SELECT e.*, su.full_name AS recorded_by_name
         FROM expenses e
         LEFT JOIN staff_users su ON e.recorded_by = su.id
         WHERE e.id = ?`,
        [id]
      ) as [any[], any];

      void mirrorExpenseToSheets({
        id,
        category,
        description,
        amount,
        recordedBy: req.user?.username ?? null,
        notes: notes ?? null,
      });

      const log = createLogger(req);
      log.info("Expense recorded", { id, category, amount });
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to record expense", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── PATCH /api/expenses/:id ──────────────────────────────────────────────
// Edit an existing expense (cannot edit system categories)

const UpdateExpenseSchema = z.object({
  amount:      z.number().positive("Amount must be greater than 0").optional(),
  description: z.string().trim().min(2).max(500).optional(),
  notes:       z.string().trim().max(1000).optional(),
});

router.patch(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateExpenseSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { amount, description, notes } = req.body as z.infer<typeof UpdateExpenseSchema>;

    try {
      const [existingRows] = await pool.query(
        `SELECT category, voided_at FROM expenses WHERE id = ?`,
        [id]
      ) as [any[], any];

      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ success: false, error: "Expense not found" });
        return;
      }
      if (existing.voided_at) {
        res.status(400).json({ success: false, error: "Cannot edit a voided expense" });
        return;
      }
      if (existing.category === "vendor_purchase" || existing.category === "affiliate_payout") {
        res.status(400).json({ success: false, error: "Cannot edit system-generated expenses" });
        return;
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (amount !== undefined) { updates.push("amount = ?"); values.push(amount); }
      if (description !== undefined) { updates.push("description = ?"); values.push(description); }
      if (notes !== undefined) { updates.push("notes = ?"); values.push(notes); }

      if (updates.length > 0) {
        values.push(id);
        await pool.query(
          `UPDATE expenses SET ${updates.join(", ")} WHERE id = ?`,
          values
        );
      }

      const [updatedRows] = await pool.query(
        `SELECT e.*, su.full_name AS recorded_by_name
         FROM expenses e
         LEFT JOIN staff_users su ON e.recorded_by = su.id
         WHERE e.id = ?`,
        [id]
      ) as [any[], any];

      res.json({ success: true, data: updatedRows[0] });
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to update expense", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── DELETE /api/expenses/:id ─────────────────────────────────────────────
// Soft-void an expense (admin only)

const VoidExpenseSchema = z.object({
  reason: z.string().trim().min(3, "Void reason is required").max(255),
});

router.delete(
  "/:id",
  authenticate,
  authorise("admin"),
  validate(VoidExpenseSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { reason } = req.body as z.infer<typeof VoidExpenseSchema>;

    try {
      const [existingRows] = await pool.query(
        `SELECT category, voided_at FROM expenses WHERE id = ?`,
        [id]
      ) as [any[], any];

      const existing = existingRows[0];
      if (!existing) {
        res.status(404).json({ success: false, error: "Expense not found" });
        return;
      }
      if (existing.voided_at) {
        res.status(400).json({ success: false, error: "Expense is already voided" });
        return;
      }
      if (existing.category === "vendor_purchase" || existing.category === "affiliate_payout") {
        res.status(400).json({ success: false, error: "Cannot void system-generated expenses directly. Please use the appropriate system workflow." });
        return;
      }

      await pool.query(
        `UPDATE expenses SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ?`,
        [req.user!.id, reason, id]
      );

      res.json({ success: true, message: "Expense successfully voided" });
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to void expense", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
