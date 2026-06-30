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

    const conditions: string[] = [];
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
      console.error("[GET /expenses]", err);
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
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Overall totals
      const [[totals]] = await pool.query(
        `SELECT
           COALESCE(SUM(amount), 0)                                                     AS total_expenses,
           COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                             THEN amount ELSE 0 END), 0)                                AS this_month,
           COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                             THEN amount ELSE 0 END), 0)                                AS last_30_days,
           COUNT(*)                                                                      AS total_count
         FROM expenses`
      ) as [any[], any];

      // Category breakdown
      const [categories] = await pool.query(
        `SELECT
           category,
           COALESCE(SUM(amount), 0) AS total,
           COUNT(*)                 AS count
         FROM expenses
         GROUP BY category
         ORDER BY total DESC`
      ) as [any[], any];

      // Monthly totals (last 6 months)
      const [monthly] = await pool.query(
        `SELECT
           DATE_FORMAT(created_at, '%Y-%m') AS month,
           COALESCE(SUM(amount), 0)         AS total,
           COUNT(*)                         AS count
         FROM expenses
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m')
         ORDER BY month DESC`
      ) as [any[], any];

      // Calculate average monthly
      const monthCount = monthly.length || 1;
      const avgMonthly = Number(totals.total_expenses) / Math.max(monthCount, 1);

      res.json({
        success: true,
        data: {
          total_expenses: Number(totals.total_expenses),
          this_month:     Number(totals.this_month),
          last_30_days:   Number(totals.last_30_days),
          total_count:    Number(totals.total_count),
          avg_monthly:    Math.round(avgMonthly * 100) / 100,
          categories,
          monthly,
        },
      });
    } catch (err) {
      console.error("[GET /expenses/summary]", err);
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

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("[POST /expenses]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
