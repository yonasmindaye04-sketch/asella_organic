/**
 * src/routes/staff.ts
 * Asella Organic — Staff Management + 2FA Routes (MySQL)
 *
 * GET    /api/staff              List staff (paginated, filterable)
 * GET    /api/staff/:id          Single staff member
 * POST   /api/staff              Create staff (admin)
 * PATCH  /api/staff/:id          Update staff (admin)
 * DELETE /api/staff/:id          Soft-delete (admin + 2FA)
 * PATCH  /api/staff/:id/password Reset password (admin + 2FA)
 *
 * POST   /api/staff/2fa/setup    Generate TOTP secret + QR code (caller)
 * POST   /api/staff/2fa/verify   Confirm code → enable 2FA (caller)
 * DELETE /api/staff/2fa/disable  Disable 2FA (caller, requires valid token)
 */

import { Router, Request, Response } from "express";
import bcrypt         from "bcryptjs";
import crypto         from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode         from "qrcode";
import pool           from "../config/db.js";
import { authenticate, authorise, invalidateUserStatusCache } from "../middleware/auth.js";
import { require2FA }  from "../middleware/2fa.js";
import { createLogger } from "../lib/logger.js";
import { entityIdParam } from "../lib/ids.js";

const router = Router();

const BCRYPT_ROUNDS = 12;

const VALID_ROLES = ["admin", "manager", "employee", "affiliate", "delivery", "vendor", "driver", "call_center", "store_manager"] as const;
type StaffRole    = typeof VALID_ROLES[number];
const isValidRole = (r: unknown): r is StaffRole => VALID_ROLES.includes(r as StaffRole);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/staff  — paginated list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { role, search, page = "1", limit = "50", from, to } = req.query as Record<string, string>;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      const conditions: string[] = ["deleted_at IS NULL"];
      const params:     unknown[] = [];

      if (role && isValidRole(role)) {
        conditions.push("role = ?");
        params.push(role);
      }
      if (search) {
        conditions.push("(full_name LIKE ? OR username LIKE ? OR email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      
      let dateFilterStr = "";
      const dateParams: unknown[] = [];
      if (from && to) {
        dateFilterStr = " AND created_at BETWEEN ? AND ?";
        dateParams.push(`${from} 00:00:00`, `${to} 23:59:59`);
      }

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM staff_users ${where}`,
        params
      ) as [any[], any];
      const total = parseInt(countRows[0]?.total ?? "0", 10);

      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, email, phone, telegram_username, active,
                two_factor_enabled, created_at, updated_at,
                (SELECT COUNT(*) FROM orders WHERE created_by_staff_id = staff_users.id${dateFilterStr}) AS orders_placed_count,
                (SELECT COUNT(*) FROM orders WHERE created_by_staff_id = staff_users.id AND status = 'Delivered'${dateFilterStr}) AS orders_delivered_count,
                (SELECT COALESCE(SUM(total),0) FROM orders
                 WHERE created_by_staff_id = staff_users.id
                   AND status NOT IN ('Cancelled','CANCELLED')${dateFilterStr}) AS revenue_generated
         FROM staff_users ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...dateParams, ...dateParams, ...dateParams, ...params, limitNum, offset]
      ) as [any[], any];

      log.info("Staff listed", { page: pageNum, limit: limitNum, total });
      res.json({
        success: true,
        data:    rows,
        meta:    { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      log.error("Failed to list staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/staff/:id/performance  — full analytics for one employee
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:id/performance",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = entityIdParam(req.params.id);
      if (!staffId) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }

      const { from, to } = req.query as Record<string, string | undefined>;

      // Build date filter clause + params
      let dateFilter = "";
      const dp: unknown[] = [];
      if (from && to) {
        dateFilter = " AND o.created_at BETWEEN ? AND ?";
        dp.push(`${from} 00:00:00`, `${to} 23:59:59`);
      }

      // ── 1. Staff info ────────────────────────────────────────────
      const [staffRows] = await pool.query(
        `SELECT id, full_name, role, email, phone, telegram_username, created_at
         FROM staff_users WHERE id = ? AND deleted_at IS NULL`,
        [staffId]
      ) as [any[], any];
      if (!staffRows[0]) {
        res.status(404).json({ success: false, error: "Staff member not found" });
        return;
      }

      // ── 2. Summary KPIs ──────────────────────────────────────────
      const [summaryRows] = await pool.query(
        `SELECT
           COUNT(*)                                                         AS total_orders,
           SUM(o.status = 'Delivered')                                      AS delivered,
           SUM(o.status IN ('Cancelled','CANCELLED'))                       AS cancelled,
           SUM(o.status NOT IN ('Delivered','Cancelled','CANCELLED'))       AS pending,
           COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED') THEN o.total ELSE 0 END),0) AS revenue,
           COALESCE(AVG(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED') THEN o.total END),0)         AS avg_order_value,
           MIN(o.created_at)                                                AS first_order_at,
           MAX(o.created_at)                                                AS last_order_at
         FROM orders o
         WHERE o.created_by_staff_id = ? AND o.deleted_at IS NULL${dateFilter}`,
        [staffId, ...dp]
      ) as [any[], any];
      const s = summaryRows[0] || {};
      const totalOrders   = Number(s.total_orders   || 0);
      const delivered     = Number(s.delivered       || 0);
      const cancelled     = Number(s.cancelled       || 0);
      const pending       = Number(s.pending         || 0);
      const revenue       = Number(s.revenue         || 0);
      const avgOrderValue = Number(s.avg_order_value || 0);

      // days between first and last order (or 1 minimum)
      const daySpan = s.first_order_at && s.last_order_at
        ? Math.max(1, Math.ceil((new Date(s.last_order_at).getTime() - new Date(s.first_order_at).getTime()) / 86_400_000) + 1)
        : 1;
      const ordersPerDay      = totalOrders   / daySpan;
      const deliveryRate      = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0;
      const cancellationRate  = totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0;

      // ── 3. Revenue over time (daily) ─────────────────────────────
      const [revenueRows] = await pool.query(
        `SELECT DATE(o.created_at) AS date,
                COUNT(*)            AS orders,
                COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED') THEN o.total ELSE 0 END),0) AS revenue
         FROM orders o
         WHERE o.created_by_staff_id = ? AND o.deleted_at IS NULL${dateFilter}
         GROUP BY DATE(o.created_at)
         ORDER BY date ASC`,
        [staffId, ...dp]
      ) as [any[], any];

      // ── 4. By channel / source ───────────────────────────────────
      const [channelRows] = await pool.query(
        `SELECT o.source,
                COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED') THEN o.total ELSE 0 END),0) AS revenue
         FROM orders o
         WHERE o.created_by_staff_id = ? AND o.deleted_at IS NULL${dateFilter}
         GROUP BY o.source
         ORDER BY revenue DESC`,
        [staffId, ...dp]
      ) as [any[], any];

      // ── 5. Top products ──────────────────────────────────────────
      const [productRows] = await pool.query(
        `SELECT oi.item_name,
                oi.package_size,
                SUM(oi.quantity)                  AS qty,
                SUM(oi.quantity * oi.unit_price)  AS revenue,
                COUNT(DISTINCT o.id)              AS order_count
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.created_by_staff_id = ?
           AND o.deleted_at IS NULL
           AND o.status NOT IN ('Cancelled','CANCELLED')${dateFilter.replace(/o\./g, "o.")}
         GROUP BY oi.item_name, oi.package_size
         ORDER BY revenue DESC
         LIMIT 10`,
        [staffId, ...dp]
      ) as [any[], any];

      // ── 6. By city ───────────────────────────────────────────────
      const [cityRows] = await pool.query(
        `SELECT o.city,
                COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED') THEN o.total ELSE 0 END),0) AS revenue
         FROM orders o
         WHERE o.created_by_staff_id = ? AND o.deleted_at IS NULL${dateFilter}
         GROUP BY o.city
         ORDER BY revenue DESC`,
        [staffId, ...dp]
      ) as [any[], any];

      // ── 7. Peak hours ─────────────────────────────────────────────
      const [hourRows] = await pool.query(
        `SELECT HOUR(o.created_at) AS hour, COUNT(*) AS orders
         FROM orders o
         WHERE o.created_by_staff_id = ? AND o.deleted_at IS NULL${dateFilter}
         GROUP BY HOUR(o.created_at)
         ORDER BY hour ASC`,
        [staffId, ...dp]
      ) as [any[], any];

      // ── 8. Recent orders ─────────────────────────────────────────
      const [recentRows] = await pool.query(
        `SELECT o.id, o.customer_name, o.city, o.source, o.total, o.status, o.created_at
         FROM orders o
         WHERE o.created_by_staff_id = ? AND o.deleted_at IS NULL${dateFilter}
         ORDER BY o.created_at DESC
         LIMIT 15`,
        [staffId, ...dp]
      ) as [any[], any];

      // ── 9. Delivery workload (drivers only) ──────────────────────────
      //
      // Sourced from delivery_assignments, not orders.assigned_to.
      //
      // orders.assigned_to is the Telegram bot's raw write target and holds
      // two incompatible shapes — the current bare handle and a legacy
      // "@handle (chat_id)" form — so it cannot be joined reliably.
      // delivery_assignments is the normalised table the bot also writes, one
      // row per accepted job, with claimed_at as the timestamp. That is the
      // same source the team rollup in routes/performance.ts uses, so a
      // driver's numbers agree between the panel and this drill-down.
      //
      // The delivery timestamp comes from order_status_history, not
      // orders.updated_at: updated_at is bumped by later edits (notes, item
      // changes) and would silently rewrite delivery history.
      let delivery: Record<string, number> | null = null;
      if (staffRows[0].telegram_username) {
        const tgUsername = staffRows[0].telegram_username;

        const [deliveryRows] = await pool.query(
          `SELECT
             COUNT(o.id)                                                     AS total_assigned,
             COALESCE(SUM(o.status = 'Delivered'), 0)                        AS delivered,
             COALESCE(SUM(o.status IN ('Cancelled','CANCELLED')), 0)          AS cancelled,
             COALESCE(SUM(o.status NOT IN ('Delivered','Cancelled','CANCELLED')), 0) AS pending,
             COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED')
                               THEN o.total ELSE 0 END), 0)                 AS revenue,
             COALESCE(SUM(CASE WHEN o.status = 'Delivered'
                                AND dh.delivered_at IS NOT NULL
                                AND o.delivery_date IS NOT NULL
                               THEN 1 ELSE 0 END), 0)                        AS with_promised_date,
             COALESCE(SUM(CASE WHEN o.status = 'Delivered'
                                AND dh.delivered_at IS NOT NULL
                                AND o.delivery_date IS NOT NULL
                                AND DATE(dh.delivered_at) <= o.delivery_date
                               THEN 1 ELSE 0 END), 0)                        AS on_time
           FROM delivery_assignments da
           JOIN orders o
                ON o.id = da.order_id
               AND o.deleted_at IS NULL
           LEFT JOIN (
             SELECT order_id, MIN(created_at) AS delivered_at
             FROM order_status_history
             WHERE new_status = 'Delivered'
             GROUP BY order_id
           ) dh ON dh.order_id = o.id
           WHERE da.driver_username = ?
             AND da.claimed_at BETWEEN ? AND ?`,
          [tgUsername, `${from ?? "1970-01-01"} 00:00:00`, `${to ?? "2999-12-31"} 23:59:59`]
        ) as [any[], any];

        let rejected = 0;
        try {
          // The rejections table is optional — it arrived in a later
          // migration than the orders table, so an older database has no
          // rows and possibly no table at all.
          const [rejRows] = await pool.query(
            `SELECT COUNT(*) AS rejected
             FROM delivery_rejections
             WHERE driver_username = ?
               AND rejected_at BETWEEN ? AND ?`,
            [tgUsername, `${from ?? "1970-01-01"} 00:00:00`, `${to ?? "2999-12-31"} 23:59:59`]
          ) as [any[], any];
          rejected = Number(rejRows[0]?.rejected || 0);
        } catch {
          // The rejections table may not exist on an older database.
          rejected = 0;
        }

        const d = deliveryRows[0] || {};
        const assigned = Number(d.total_assigned || 0);
        const deliveredCount = Number(d.delivered || 0);
        const onTime   = Number(d.on_time || 0);
        const promised = Number(d.with_promised_date || 0);

        delivery = {
          total_assigned:   assigned,
          delivered:        deliveredCount,
          cancelled:        Number(d.cancelled || 0),
          pending:          Number(d.pending || 0),
          revenue:          Number(d.revenue || 0),
          rejected,
          delivery_rate:    assigned > 0
            ? Number(((deliveredCount / assigned) * 100).toFixed(1))
            : 0,
          acceptance_rate:  assigned + rejected > 0
            ? Number(((assigned / (assigned + rejected)) * 100).toFixed(1))
            : 0,
          on_time_rate:     promised > 0 ? Number(((onTime / promised) * 100).toFixed(1)) : 0,
        };

        // A driver role with no jobs in the window still gets the delivery
        // KPI layout (all zeroes); a salesperson who happens to drive only
        // gets it when there is delivery work to report, so their ordinary
        // sales drill-down is unchanged.
        if (staffRows[0].role !== "delivery" && assigned === 0 && rejected === 0) {
          delivery = null;
        }
      }

      res.json({
        success: true,
        data: {
          staff: staffRows[0],
          summary: {
            total_orders:      totalOrders,
            delivered,
            cancelled,
            pending,
            revenue,
            avg_order_value:   Math.round(avgOrderValue),
            delivery_rate:     Number(deliveryRate.toFixed(1)),
            cancellation_rate: Number(cancellationRate.toFixed(1)),
            orders_per_day:    Number(ordersPerDay.toFixed(1)),
          },
          delivery,
          revenue_over_time: revenueRows,
          by_channel:        channelRows,
          top_products:      productRows,
          by_city:           cityRows,
          peak_hours:        hourRows,
          recent_orders:     recentRows,
        },
      });
    } catch (err) {
      log.error("Failed to fetch staff performance", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/staff/delivery-performance — delivery team performance rollup
// Tracks orders accepted/delivered/rejected by delivery drivers, with
// custom date filtering, day/week/month grouping, and location patterns.
// ─────────────────────────────────────────────────────────────────────────────
function getWeekNumber(d: Date): number {
  // ISO week: Thursday-based week, week 1 contains the first Thursday of the year.
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(copy.getFullYear(), 0, 1));
  return Math.ceil(((copy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

router.get(
  "/delivery-performance",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const {
        driver,
        from,
        to,
        period = "day",
        city,
        location,
        status,
        page = "1",
        limit = "50",
      } = req.query as Record<string, string>;

      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      // ── Build shared WHERE clauses ──────────────────────────────────
      const conditions: string[] = ["o.deleted_at IS NULL"];
      const values: unknown[] = [];
      const rejConditions: string[] = ["1=1"];
      const rejValues: unknown[] = [];

      const addDateFilter = (conds: string[], vals: unknown[], col: string) => {
        if (from && to) {
          conds.push(`${col} BETWEEN ? AND ?`);
          vals.push(`${from} 00:00:00`, `${to} 23:59:59`);
        } else if (from) {
          conds.push(`${col} >= ?`);
          vals.push(`${from} 00:00:00`);
        } else if (to) {
          conds.push(`${col} <= ?`);
          vals.push(`${to} 23:59:59`);
        }
      };

      addDateFilter(conditions, values, "da.claimed_at");
      addDateFilter(rejConditions, rejValues, "dr.rejected_at");

      if (driver) {
        conditions.push("da.driver_username = ?");
        values.push(driver);
        rejConditions.push("dr.driver_username = ?");
        rejValues.push(driver);
      }
      if (city) {
        conditions.push("o.city LIKE ?");
        values.push(`%${city}%`);
      }
      if (location) {
        conditions.push("o.location LIKE ?");
        values.push(`%${location}%`);
      }
      if (status) {
        conditions.push("o.status = ?");
        values.push(status);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const rejWhere = `WHERE ${rejConditions.join(" AND ")}`;

      // ── 1. All accepted deliveries in range (base dataset) ──────────
      const [baseRows] = await pool.query(
        `SELECT
           da.order_id,
           da.driver_username,
           da.claimed_at,
           da.delivered_at,
           o.status,
           o.city,
           o.location,
           o.delivery_date,
           o.created_at,
           su.full_name AS driver_full_name,
           su.id AS driver_staff_id
         FROM delivery_assignments da
         JOIN orders o ON o.id = da.order_id
         LEFT JOIN staff_users su ON su.username = da.driver_username AND su.deleted_at IS NULL
         ${where}
         ORDER BY da.claimed_at DESC`,
        values
      ) as [any[], any];

      // ── 2. Rejections per driver ────────────────────────────────────
      const [rejRows] = await pool.query(
        `SELECT driver_username, COUNT(*) AS rejected_count
         FROM delivery_rejections dr
         ${rejWhere}
         GROUP BY driver_username`,
        rejValues
      ) as [any[], any];

      const rejMap = new Map<string, number>();
      for (const r of rejRows) rejMap.set(r.driver_username, Number(r.rejected_count || 0));

      // ── 3. Summary KPIs ─────────────────────────────────────────────
      const totalAssigned = baseRows.length;
      const totalDelivered = baseRows.filter((r) => r.status === "Delivered").length;
      const totalRejected = Array.from(rejMap.values()).reduce((a, b) => a + b, 0);
      const totalPending = totalAssigned - totalDelivered;

      const acceptRate = totalAssigned > 0 ? (totalAssigned / (totalAssigned + totalRejected)) * 100 : 0;
      const rejectRate = (totalAssigned + totalRejected) > 0 ? (totalRejected / (totalAssigned + totalRejected)) * 100 : 0;
      const completionRate = totalAssigned > 0 ? (totalDelivered / totalAssigned) * 100 : 0;

      const firstClaim = baseRows.length > 0
        ? baseRows.reduce((min: Date, r: any) => (new Date(r.claimed_at) < min ? new Date(r.claimed_at) : min), new Date(baseRows[0].claimed_at))
        : null;
      const lastClaim = baseRows.length > 0
        ? baseRows.reduce((max: Date, r: any) => (new Date(r.claimed_at) > max ? new Date(r.claimed_at) : max), new Date(baseRows[0].claimed_at))
        : null;
      const daySpan = firstClaim && lastClaim ? Math.max(1, Math.ceil((lastClaim.getTime() - firstClaim.getTime()) / 86_400_000) + 1) : 1;
      const weekSpan = Math.max(1, Math.ceil(daySpan / 7));
      const avgPerDay = totalAssigned / daySpan;
      const avgPerWeek = totalAssigned / weekSpan;

      // ── 4. Time series grouped by period ────────────────────────────
      const periodKey = (dateStr: string): string => {
        const d = new Date(dateStr);
        if (period === "week") {
          return `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
        }
        if (period === "month") {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
        // day (default)
        return d.toISOString().split("T")[0] ?? "";
      };

      const tsMap = new Map<string, { accepted: number; delivered: number }>();
      for (const r of baseRows) {
        const key = periodKey(String(r.claimed_at ?? ""));
        if (!tsMap.has(key)) tsMap.set(key, { accepted: 0, delivered: 0 });
        const bucket = tsMap.get(key)!;
        bucket.accepted += 1;
        if (r.status === "Delivered") bucket.delivered += 1;
      }
      const timeSeries = Array.from(tsMap.entries())
        .map(([periodLabel, counts]) => ({
          period: periodLabel,
          accepted: counts.accepted,
          delivered: counts.delivered,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // ── 5. Per-driver breakdown ─────────────────────────────────────
      const driverMap = new Map<string, {
        driver_username: string;
        driver_staff_id: string | null;
        driver_full_name: string | null;
        accepted: number;
        delivered: number;
        rejected: number;
      }>();
      for (const r of baseRows) {
        const key = r.driver_username;
        if (!driverMap.has(key)) {
          driverMap.set(key, {
            driver_username: key,
            driver_staff_id: r.driver_staff_id ?? null,
            driver_full_name: r.driver_full_name ?? null,
            accepted: 0,
            delivered: 0,
            rejected: rejMap.get(key) || 0,
          });
        }
        const b = driverMap.get(key)!;
        b.accepted += 1;
        if (r.status === "Delivered") b.delivered += 1;
      }
      const byDriver = Array.from(driverMap.values())
        .map((d) => ({
          ...d,
          accept_rate: d.accepted > 0 ? Number(((d.accepted / (d.accepted + d.rejected)) * 100).toFixed(1)) : 0,
          reject_rate: (d.accepted + d.rejected) > 0 ? Number(((d.rejected / (d.accepted + d.rejected)) * 100).toFixed(1)) : 0,
          completion_rate: d.accepted > 0 ? Number(((d.delivered / d.accepted) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.accepted - a.accepted);

      // ── 6. Location pattern analysis (delivered orders only) ────────
      const locMap = new Map<string, { city: string; location: string | null; delivered: number }>();
      for (const r of baseRows) {
        if (r.status !== "Delivered") continue;
        const key = `${r.city}||${r.location ?? ""}`;
        if (!locMap.has(key)) locMap.set(key, { city: r.city, location: r.location ?? null, delivered: 0 });
        locMap.get(key)!.delivered += 1;
      }
      const totalDeliveredCount = totalDelivered || 1;
      const byLocation = Array.from(locMap.values())
        .map((l) => ({ ...l, pct: Number(((l.delivered / totalDeliveredCount) * 100).toFixed(1)) }))
        .sort((a, b) => b.delivered - a.delivered);

      // ── 7. Recent deliveries (paginated) ────────────────────────────
      const recent = baseRows.slice(offset, offset + limitNum).map((r) => ({
        order_id: r.order_id,
        driver_username: r.driver_username,
        driver_full_name: r.driver_full_name,
        city: r.city,
        location: r.location,
        status: r.status,
        claimed_at: r.claimed_at,
        delivered_at: r.delivered_at,
        delivery_date: r.delivery_date,
      }));

      log.info("Delivery performance fetched", {
        totalAssigned,
        totalDelivered,
        totalRejected,
        driverCount: driverMap.size,
      });

      res.json({
        success: true,
        data: {
          summary: {
            total_assigned: totalAssigned,
            total_delivered: totalDelivered,
            total_rejected: totalRejected,
            total_pending: totalPending,
            accept_rate: Number(acceptRate.toFixed(1)),
            reject_rate: Number(rejectRate.toFixed(1)),
            completion_rate: Number(completionRate.toFixed(1)),
            avg_orders_per_day: Number(avgPerDay.toFixed(1)),
            avg_orders_per_week: Number(avgPerWeek.toFixed(1)),
          },
          time_series: timeSeries,
          by_driver: byDriver,
          by_location: byLocation,
          recent_deliveries: recent,
        },
        meta: { total: totalAssigned, page: pageNum, limit: limitNum, pages: Math.ceil(totalAssigned / limitNum) },
      });
    } catch (err) {
      log.error("Failed to fetch delivery performance", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/staff/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = entityIdParam(req.params.id);
      if (!staffId) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, email, phone, telegram_username, active,
                two_factor_enabled, created_at, updated_at
         FROM staff_users
          WHERE id = ? AND deleted_at IS NULL`,
        [staffId]
      ) as [any[], any];

      if (!rows[0]) {
        res.status(404).json({ success: false, error: "Staff member not found" });
        return;
      }
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      log.error("Failed to fetch staff member", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/staff  — create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  authorise("admin"),
  // Creating a user is enough for permanent takeover — CreateStaffSchema
  // accepts any role, including admin. DELETE and the password routes below
  // already require 2FA; this one did not.
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { username, password, full_name, role, email, phone, telegram_username } = req.body as {
        username?: string; password?: string; full_name?: string;
        role?: string; email?: string; phone?: string; telegram_username?: string;
      };

      if (!username || !password || !full_name || !role) {
        res.status(400).json({ success: false, error: "username, password, full_name, and role are required." });
        return;
      }
      if (!isValidRole(role)) {
        res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ success: false, error: "Password must be at least 8 characters." });
        return;
      }

      const [existing] = await pool.query(
        `SELECT id FROM staff_users WHERE username = ? AND deleted_at IS NULL`,
        [username.toLowerCase()]
      ) as [any[], any];
      if (existing.length > 0) {
        res.status(409).json({ success: false, error: "Username already exists." });
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const newId        = crypto.randomUUID();

      await pool.query(
        `INSERT INTO staff_users (id, username, password_hash, full_name, role, email, phone, telegram_username)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, username.toLowerCase(), passwordHash, full_name, role, email ?? null, phone ?? null, telegram_username ?? null]
      );

      await pool.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, new_values)
         VALUES ('staff_users', ?, ?, 'STAFF_CREATED', ?)`,
        [newId, req.user!.id, JSON.stringify({ username, full_name, role })]
      ).catch(() => {});

      log.info("Staff created", { newId, username, role });
      res.status(201).json({ success: true, data: { id: newId, username, full_name, role } });
    } catch (err) {
      log.error("Failed to create staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/staff/:id  — update
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  authenticate,
  authorise("admin"),
  // `role` is in the updatable set, so this is an escalation primitive as
  // well as an edit. Requires 2FA for the same reason DELETE does.
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = entityIdParam(req.params.id);
      if (!staffId) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }

      const { full_name, role, email, phone, telegram_username, active } = req.body as {
        full_name?: string; role?: string; email?: string; phone?: string; telegram_username?: string; active?: boolean;
      };

      if (role && !isValidRole(role)) {
        res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
        return;
      }

      const updates: string[] = [];
      const values:  unknown[] = [];

      for (const [field, val] of Object.entries({ full_name, role, email, phone, telegram_username, active })) {
        if (val !== undefined) { updates.push(`${field} = ?`); values.push(val); }
      }
      if (updates.length === 0) {
        res.status(400).json({ success: false, error: "No valid fields to update." });
        return;
      }

      values.push(staffId);
      const [result] = await pool.query(
        `UPDATE staff_users SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = ? AND deleted_at IS NULL`,
        values
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }

      invalidateUserStatusCache(staffId);
      if (active === false) {
        await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [staffId]).catch(() => {});
      }
      log.info("Staff updated", { staffId: req.params.id });
      res.json({ success: true, data: { message: "Staff updated." } });
    } catch (err) {
      log.error("Failed to update staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/staff/:id/password  — admin password reset
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  "/:id/password",
  authenticate,
  authorise("admin"),
  // Resetting any user's password is a full account takeover. The sibling
  // PATCH /:id/password below already required 2FA; this duplicate PUT did
  // not, so the control was one endpoint away from being meaningless.
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = req.params.id;
      const { password } = req.body;
      if (!password || password.length < 8) {
        res.status(400).json({ success: false, error: "Password must be at least 8 characters." });
        return;
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const [result] = await pool.query(
        `UPDATE staff_users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
        [passwordHash, staffId]
      ) as [any, any];
      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }
      log.info("Staff password reset", { staffId });
      res.json({ success: true, data: { message: "Password updated." } });
    } catch (err) {
      log.error("Failed to reset password", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/staff/:id  — soft-delete (admin + 2FA)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorise("admin"),
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = entityIdParam(req.params.id);
      if (!staffId) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }
      if (staffId === req.user!.id) {
        res.status(400).json({ success: false, error: "Cannot deactivate your own account." });
        return;
      }

      const [result] = await pool.query(
        `UPDATE staff_users SET active = false, deleted_at = NOW(), updated_at = NOW()
         WHERE id = ? AND deleted_at IS NULL`,
        [staffId]
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }

      // Revoke all active sessions for deleted user
      await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [staffId]).catch(() => {});

      await pool.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, old_values)
         VALUES ('staff_users', ?, ?, 'DELETE', ?)`,
        [staffId, req.user!.id, JSON.stringify({ deleted: staffId })]
      ).catch(() => {});

      invalidateUserStatusCache(staffId);
      log.info("Staff soft-deleted", { staffId });
      res.json({ success: true, data: { message: "Staff deactivated." } });
    } catch (err) {
      log.error("Failed to delete staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/staff/:id/password  — reset another user's password (admin + 2FA)
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id/password",
  authenticate,
  authorise("admin"),
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = entityIdParam(req.params.id);
      if (!staffId) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }

      const { new_password } = req.body as { new_password?: string };
      if (!new_password || new_password.length < 8) {
        res.status(400).json({ success: false, error: "new_password must be at least 8 characters." });
        return;
      }

      const [existing] = await pool.query(
        `SELECT id FROM staff_users WHERE id = ? AND deleted_at IS NULL`, [req.params.id]
      ) as [any[], any];
      if (!existing[0]) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }

      const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
      await pool.query(
        `UPDATE staff_users SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
        [passwordHash, req.params.id]
      );

      // Revoke all sessions after password change
      await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [req.params.id]).catch(() => {});

      log.info("Staff password reset", { staffId: req.params.id, by: req.user!.id });
      res.json({ success: true, data: { message: "Password updated. All sessions revoked." } });
    } catch (err) {
      log.error("Failed to reset password", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/staff/2fa/setup  — generate TOTP secret + QR code for caller
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/2fa/setup",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [rows] = await pool.query(
        `SELECT username, two_factor_enabled FROM staff_users WHERE id = ? AND active = true`,
        [req.user!.id]
      ) as [any[], any];

      if (!rows[0]) {
        res.status(404).json({ success: false, error: "User not found." });
        return;
      }
      if (rows[0].two_factor_enabled) {
        res.status(409).json({ success: false, error: "2FA is already enabled. Disable it first to reset." });
        return;
      }

      const secret      = generateSecret();
      const otpauthUrl  = generateURI({ secret, issuer: "Asella Organic", label: rows[0].username });
      const qrCodeData  = await qrcode.toDataURL(otpauthUrl);

      // Store secret (not yet enabled — enabled only after /2fa/verify)
      await pool.query(
        `UPDATE staff_users SET two_factor_secret = ?, updated_at = NOW() WHERE id = ?`,
        [secret, req.user!.id]
      );

      log.info("2FA setup initiated", { userId: req.user!.id });
      res.json({
        success: true,
        data: {
          message:          "Scan the QR code with your authenticator app, then call POST /api/staff/2fa/verify.",
          qr_code:          qrCodeData,
          manual_entry_key: secret,
        },
      });
    } catch (err) {
      log.error("2FA setup failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/staff/2fa/verify  — confirm TOTP code and enable 2FA
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/2fa/verify",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { token } = req.body as { token?: string };
      if (!token) {
        res.status(400).json({ success: false, error: "token is required." });
        return;
      }

      const [rows] = await pool.query(
        `SELECT two_factor_secret, two_factor_enabled FROM staff_users WHERE id = ?`,
        [req.user!.id]
      ) as [any[], any];

      const staff = rows[0];
      if (!staff?.two_factor_secret) {
        res.status(400).json({ success: false, error: "No 2FA setup found. Call POST /api/staff/2fa/setup first." });
        return;
      }
      if (staff.two_factor_enabled) {
        res.status(409).json({ success: false, error: "2FA is already enabled." });
        return;
      }

      const result = verifySync({ token, secret: staff.two_factor_secret });
      const isValid = result.valid;
      if (!isValid) {
        res.status(401).json({ success: false, error: "Invalid TOTP code. Please try again." });
        return;
      }

      await pool.query(
        `UPDATE staff_users SET two_factor_enabled = true, updated_at = NOW() WHERE id = ?`,
        [req.user!.id]
      );

      log.info("2FA enabled", { userId: req.user!.id });
      res.json({ success: true, data: { message: "2FA has been enabled for your account." } });
    } catch (err) {
      log.error("2FA verify failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/staff/2fa/disable  — disable 2FA (requires current valid token)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/2fa/disable",
  authenticate,
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      await pool.query(
        `UPDATE staff_users
         SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW()
         WHERE id = ?`,
        [req.user!.id]
      );
      log.info("2FA disabled", { userId: req.user!.id });
      res.json({ success: true, data: { message: "2FA has been disabled." } });
    } catch (err) {
      log.error("2FA disable failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
