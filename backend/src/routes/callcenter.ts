/**
 * src/routes/callcenter.ts
 * Asella Organic — Call Center Role Routes
 *
 * GET    /api/callcenter/me/stats     Personal KPIs (call_center only)
 * GET    /api/callcenter/me/orders    Own orders, paginated (call_center only)
 * POST   /api/callcenter/log-call     Log an incoming call (call_center only)
 * GET    /api/callcenter/agents       All call center agents + stats (admin, manager)
 */

import { Router, Request, Response } from "express";
import pool             from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/callcenter/log-call  — record one incoming call
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/log-call",
  authenticate,
  authorise("call_center"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = req.user!.id;
      const { note } = req.body as { note?: string };

      await pool.query(
        `INSERT INTO call_logs (id, staff_id, note)
         VALUES (UUID(), ?, ?)`,
        [staffId, note ?? null]
      );

      log.info("Call logged", { staffId });
      res.json({ success: true, data: { message: "Call logged." } });
    } catch (err) {
      const log2 = createLogger(req);
      log2.error("Failed to log call", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/callcenter/me/stats  — personal KPIs for the logged-in call center agent
// Query params: ?from ?to (YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/me/stats",
  authenticate,
  authorise("call_center"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = req.user!.id;
      const { from, to } = req.query as Record<string, string | undefined>;

      let dateFilter = "";
      const dp: unknown[] = [];
      if (from && to) {
        dateFilter = " AND created_at BETWEEN ? AND ?";
        dp.push(`${from} 00:00:00`, `${to} 23:59:59`);
      }

      let callDateFilter = "";
      const cdp: unknown[] = [];
      if (from && to) {
        callDateFilter = " AND logged_at BETWEEN ? AND ?";
        cdp.push(`${from} 00:00:00`, `${to} 23:59:59`);
      }

      const [orderRows] = await pool.query(
        `SELECT
           COUNT(*) AS total_orders,
           SUM(status = 'Delivered') AS delivered,
           SUM(status IN ('Cancelled','CANCELLED')) AS cancelled,
           SUM(status NOT IN ('Delivered','Cancelled','CANCELLED')) AS pending
         FROM orders
         WHERE created_by_staff_id = ?
           AND deleted_at IS NULL${dateFilter}`,
        [staffId, ...dp]
      ) as [any[], any];

      const [callRows] = await pool.query(
        `SELECT COUNT(*) AS call_count
         FROM call_logs
         WHERE staff_id = ?${callDateFilter}`,
        [staffId, ...cdp]
      ) as [any[], any];

      const s = orderRows[0] || {};
      res.json({
        success: true,
        data: {
          total_orders: Number(s.total_orders || 0),
          delivered:    Number(s.delivered    || 0),
          cancelled:    Number(s.cancelled    || 0),
          pending:      Number(s.pending      || 0),
          call_count:   Number(callRows[0]?.call_count || 0),
        },
      });
    } catch (err) {
      log.error("Failed to fetch call center stats", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/callcenter/me/orders  — paginated orders created by this agent
// Query params: ?page ?limit ?status ?from ?to ?search
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/me/orders",
  authenticate,
  authorise("call_center"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = req.user!.id;
      const {
        status, search, from, to,
        page  = "1",
        limit = "50",
      } = req.query as Record<string, string>;

      const conditions: string[] = [
        "o.deleted_at IS NULL",
        "o.created_by_staff_id = ?",
      ];
      const values: unknown[] = [staffId];

      if (status) { conditions.push("o.status = ?");        values.push(status); }
      if (from)   { conditions.push("o.created_at >= ?");   values.push(from); }
      if (to)     { conditions.push("o.created_at <= ?");   values.push(`${to} 23:59:59`); }
      if (search) {
        conditions.push("(o.customer_name LIKE ? OR o.phone LIKE ? OR o.id LIKE ?)");
        values.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const where    = `WHERE ${conditions.join(" AND ")}`;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS count FROM orders o ${where}`, values
      ) as [any[], any];
      const total = parseInt(countRows[0].count as string, 10);

      const [data] = await pool.query(
        `SELECT o.id, o.customer_name, o.phone, o.city, o.source,
                o.order_type, o.status, o.payment_status, o.total,
                o.notes, o.created_at, o.updated_at
         FROM orders o
         ${where}
         ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
        [...values, limitNum, offset]
      ) as [any[], any];

      log.info("Call center agent orders listed", { pageNum, limitNum, total });
      res.json({
        success: true,
        data,
        total,
        page:    pageNum,
        limit:   limitNum,
        meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      log.error("Failed to list call center orders", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/callcenter/agents  — all call_center staff + their stats (admin/manager)
// Query params: ?from ?to (YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/agents",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { from, to } = req.query as Record<string, string | undefined>;

      let orderDateFilter = "";
      const odp: unknown[] = [];
      if (from && to) {
        orderDateFilter = " AND o.created_at BETWEEN ? AND ?";
        odp.push(`${from} 00:00:00`, `${to} 23:59:59`);
      }

      let callDateFilter = "";
      const cdp: unknown[] = [];
      if (from && to) {
        callDateFilter = " AND cl.logged_at BETWEEN ? AND ?";
        cdp.push(`${from} 00:00:00`, `${to} 23:59:59`);
      }

      const [rows] = await pool.query(
        `SELECT
           su.id,
           su.full_name,
           su.username,
           su.email,
           su.phone,
           su.active,
           su.created_at,
           COUNT(DISTINCT o.id)                                        AS total_orders,
           SUM(o.status = 'Delivered')                                 AS delivered,
           SUM(o.status IN ('Cancelled','CANCELLED'))                  AS cancelled,
           SUM(o.status NOT IN ('Delivered','Cancelled','CANCELLED'))  AS pending,
           COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED') THEN o.total ELSE 0 END), 0) AS revenue,
           (SELECT COUNT(*) FROM call_logs cl WHERE cl.staff_id = su.id${callDateFilter}) AS call_count
         FROM staff_users su
         LEFT JOIN orders o
           ON o.created_by_staff_id = su.id
           AND o.deleted_at IS NULL${orderDateFilter}
         WHERE su.role = 'call_center'
           AND su.deleted_at IS NULL
         GROUP BY su.id, su.full_name, su.username, su.email, su.phone, su.active, su.created_at
         ORDER BY su.full_name ASC`,
        [...cdp, ...odp]
      ) as [any[], any];

      const agents = rows.map((r: any) => ({
        ...r,
        total_orders: Number(r.total_orders || 0),
        delivered:    Number(r.delivered    || 0),
        cancelled:    Number(r.cancelled    || 0),
        pending:      Number(r.pending      || 0),
        revenue:      Number(r.revenue      || 0),
        call_count:   Number(r.call_count   || 0),
        delivery_rate: Number(r.total_orders) > 0
          ? Number(((Number(r.delivered) / Number(r.total_orders)) * 100).toFixed(1))
          : 0,
      }));

      log.info("Call center agents listed", { count: agents.length });
      res.json({ success: true, data: agents });
    } catch (err) {
      log.error("Failed to list call center agents", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
