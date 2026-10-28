/**
 * src/routes/callcenter.ts
 * Asella Organic — Call Center Role Routes
 *
 * GET    /api/callcenter/me/stats     Personal KPIs (call_center only)
 * GET    /api/callcenter/me/orders    Own orders, paginated (call_center only)
 * GET    /api/callcenter/me/daily-report   One aggregated call report per day (call_center only)
 * POST   /api/callcenter/me/daily-report   Submit / update that daily report (call_center only)
 * POST   /api/callcenter/log-call     Legacy per-call logging (call_center only)
 * GET    /api/callcenter/agents       All call center agents + stats (admin, manager)
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { z } from "zod";

const router = Router();

// ── Daily call report helpers ────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isoDay(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value ?? "").slice(0, 10);
}

async function currentReportDate(): Promise<string> {
  const [rows] = await pool.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today"
  ) as [any[], any];
  return String(rows[0]?.today ?? new Date().toISOString().slice(0, 10));
}

interface DayOrderStats {
  system_orders:      number;
  delivery_orders:    number;
  pickup_orders:      number;
  other_type_orders:  number;
  addis_orders:       number;
  other_region_orders: number;
  abroad_orders:      number;
  total_sales:        number;
  order_ids:          string[];
}

/**
 * Totals for the orders this agent created on the report date. These values
 * are never accepted from the client — they are recalculated on every preview
 * and every submission.
 */
async function computeDayOrderStats(
  staffId: string,
  reportDate: string
): Promise<DayOrderStats> {
  const [rows] = await pool.query(
    `SELECT id, order_type, city, total
       FROM orders
      WHERE created_by_staff_id = ?
        AND deleted_at IS NULL
        AND created_at >= ?
        AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY created_at ASC, id ASC`,
    [staffId, reportDate, reportDate]
  ) as [any[], any];

  let delivery = 0;
  let pickup = 0;
  let addis = 0;
  let otherRegion = 0;
  let abroad = 0;
  let sales = 0;
  const orderIds: string[] = [];

  for (const row of rows) {
    orderIds.push(row.id);
    const type = String(row.order_type ?? "").trim().toLowerCase();
    if (type === "delivery") delivery += 1;
    else if (type === "pickup") pickup += 1;

    const city = String(row.city ?? "").trim().toLowerCase();
    if (city.startsWith("addis")) addis += 1;
    else if (city.includes("abroad")) abroad += 1;
    else if (city !== "") otherRegion += 1;

    sales += Number(row.total ?? 0) || 0;
  }

  return {
    system_orders:       rows.length,
    delivery_orders:     delivery,
    pickup_orders:       pickup,
    other_type_orders:   rows.length - delivery - pickup,
    addis_orders:        addis,
    other_region_orders: otherRegion,
    abroad_orders:       abroad,
    total_sales:         Math.round(sales * 100) / 100,
    order_ids:           orderIds,
  };
}

function publicDayStats(stats: DayOrderStats) {
  return {
    system_orders:       stats.system_orders,
    delivery_orders:     stats.delivery_orders,
    pickup_orders:       stats.pickup_orders,
    other_type_orders:   stats.other_type_orders,
    addis_orders:        stats.addis_orders,
    other_region_orders: stats.other_region_orders,
    abroad_orders:       stats.abroad_orders,
    total_sales:         stats.total_sales,
  };
}

export const CallCenterDailyReportSchema = z.object({
  report_date:    z.string().regex(DATE_RE, "report_date must be YYYY-MM-DD"),
  calls_received: z.coerce.number().int().min(0).max(1_000_000),
  calls_ordered:  z.coerce.number().int().min(0).max(1_000_000),
  calls_rejected: z.coerce.number().int().min(0).max(1_000_000),
  notes:          z.string().trim().max(500).optional(),
});


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
// GET /api/callcenter/me/daily-report?date=YYYY-MM-DD
//
// One aggregated call report per agent per day. The agent supplies the call
// counts; delivery/pickup and location/sales totals are calculated from the
// orders that agent created on the selected date.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/me/daily-report",
  authenticate,
  authorise("call_center"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const requested = String(req.query.date ?? "").trim();
      const today = await currentReportDate();
      const reportDate = requested || today;

      if (!isValidDate(reportDate)) {
        res.status(422).json({ success: false, error: "date must be a valid YYYY-MM-DD value" });
        return;
      }
      if (reportDate > today) {
        res.status(422).json({ success: false, error: "Report date cannot be in the future." });
        return;
      }

      const staffId = req.user!.id;
      const stats = await computeDayOrderStats(staffId, reportDate);

      const [existingRows] = await pool.query(
        `SELECT id, calls_received, calls_ordered, calls_rejected,
                system_orders, delivery_orders, pickup_orders, other_type_orders,
                addis_orders, other_region_orders, abroad_orders, total_sales,
                notes, is_backdated, submitted_on, submitted_at
           FROM call_center_daily_reports
          WHERE staff_id = ? AND report_date = ?
          LIMIT 1`,
        [staffId, reportDate]
      ) as [any[], any];

      const existing = existingRows[0];

      res.json({
        success: true,
        data: {
          report_date: reportDate,
          today,
          is_backdated: reportDate !== today,
          stats: publicDayStats(stats),
          existing_report: existing
            ? {
                id:                  existing.id,
                calls_received:      Number(existing.calls_received || 0),
                calls_ordered:       Number(existing.calls_ordered || 0),
                calls_rejected:      Number(existing.calls_rejected || 0),
                system_orders:       Number(existing.system_orders || 0),
                delivery_orders:     Number(existing.delivery_orders || 0),
                pickup_orders:       Number(existing.pickup_orders || 0),
                other_type_orders:   Number(existing.other_type_orders || 0),
                addis_orders:        Number(existing.addis_orders || 0),
                other_region_orders: Number(existing.other_region_orders || 0),
                abroad_orders:       Number(existing.abroad_orders || 0),
                total_sales:         Number(existing.total_sales || 0),
                notes:               existing.notes,
                is_backdated:        Boolean(existing.is_backdated),
                submitted_on:        isoDay(existing.submitted_on),
                submitted_at:        existing.submitted_at,
              }
            : null,
        },
      });
    } catch (err) {
      log.error("Failed to load daily call report", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/callcenter/me/daily-report
//
// Upserts one report per agent/date. Only the call counts and notes are read
// from the request; system totals are always recalculated from orders.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/me/daily-report",
  authenticate,
  authorise("call_center"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);

    const parsed = CallCenterDailyReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      report_date: reportDate,
      calls_received: callsReceived,
      calls_ordered: callsOrdered,
      calls_rejected: callsRejected,
    } = parsed.data;
    const notes = parsed.data.notes?.trim() || null;

    if (!isValidDate(reportDate)) {
      res.status(422).json({ success: false, error: "report_date must be a valid YYYY-MM-DD date" });
      return;
    }

    if (callsOrdered + callsRejected > callsReceived) {
      res.status(422).json({
        success: false,
        error: "Orders placed plus rejected calls cannot be greater than total calls received.",
      });
      return;
    }

    try {
      const staffId = req.user!.id;
      const [staffRows] = await pool.query(
        `SELECT full_name, username FROM staff_users WHERE id = ? AND deleted_at IS NULL`,
        [staffId]
      ) as [any[], any];
      const agentName = staffRows[0]?.full_name || staffRows[0]?.username || "Call Center Agent";

      const today = await currentReportDate();
      if (reportDate > today) {
        res.status(422).json({ success: false, error: "Report date cannot be in the future." });
        return;
      }

      // Authoritative system side — never read these from the request.
      const stats = await computeDayOrderStats(staffId, reportDate);
      const isBackdated = reportDate !== today;
      const ordersMatch = callsOrdered === stats.system_orders;

      const connection = await pool.getConnection();
      let reportId = crypto.randomUUID();
      let updated = false;
      let oldValues: Record<string, unknown> | null = null;

      try {
        await connection.beginTransaction();

        const [existingRows] = (await connection.query(
          `SELECT id, calls_received, calls_ordered, calls_rejected,
                  system_orders, delivery_orders, pickup_orders, other_type_orders,
                  addis_orders, other_region_orders, abroad_orders, total_sales,
                  notes, is_backdated, submitted_on, submitted_at
             FROM call_center_daily_reports
            WHERE staff_id = ? AND report_date = ?
            LIMIT 1
            FOR UPDATE`,
          [staffId, reportDate]
        )) as [any[], any];

        const existing = existingRows[0];

        if (existing) {
          reportId = existing.id;
          updated = true;
          oldValues = {
            calls_received:      Number(existing.calls_received || 0),
            calls_ordered:       Number(existing.calls_ordered || 0),
            calls_rejected:      Number(existing.calls_rejected || 0),
            system_orders:       Number(existing.system_orders || 0),
            total_sales:         Number(existing.total_sales || 0),
            notes:               existing.notes,
            is_backdated:        Boolean(existing.is_backdated),
            submitted_on:        isoDay(existing.submitted_on),
            submitted_at:        existing.submitted_at,
          };

          await connection.query(
            `UPDATE call_center_daily_reports
                SET calls_received = ?, calls_ordered = ?, calls_rejected = ?,
                    system_orders = ?, delivery_orders = ?, pickup_orders = ?,
                    other_type_orders = ?, addis_orders = ?, other_region_orders = ?,
                    abroad_orders = ?, total_sales = ?, notes = ?,
                    is_backdated = ?, submitted_on = ?, submitted_at = NOW()
              WHERE id = ?`,
            [
              callsReceived,
              callsOrdered,
              callsRejected,
              stats.system_orders,
              stats.delivery_orders,
              stats.pickup_orders,
              stats.other_type_orders,
              stats.addis_orders,
              stats.other_region_orders,
              stats.abroad_orders,
              stats.total_sales,
              notes,
              isBackdated ? 1 : 0,
              today,
              reportId,
            ]
          );
        } else {
          await connection.query(
            `INSERT INTO call_center_daily_reports
               (id, staff_id, report_date, calls_received, calls_ordered, calls_rejected,
                system_orders, delivery_orders, pickup_orders, other_type_orders,
                addis_orders, other_region_orders, abroad_orders, total_sales,
                notes, is_backdated, submitted_on, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              reportId,
              staffId,
              reportDate,
              callsReceived,
              callsOrdered,
              callsRejected,
              stats.system_orders,
              stats.delivery_orders,
              stats.pickup_orders,
              stats.other_type_orders,
              stats.addis_orders,
              stats.other_region_orders,
              stats.abroad_orders,
              stats.total_sales,
              notes,
              isBackdated ? 1 : 0,
              today,
            ]
          );
        }

        await connection.query(
          `INSERT INTO audit_log
             (table_name, record_id, actor, action, old_values, new_values)
           VALUES ('call_center_daily_reports', ?, ?, ?, ?, ?)`,
          [
            reportId,
            staffId,
            isBackdated ? "CALL_REPORT_BACKDATED" : "CALL_REPORT_SUBMITTED",
            oldValues ? JSON.stringify(oldValues) : null,
            JSON.stringify({
              report_id:           reportId,
              staff_id:            staffId,
              agent_name:          agentName,
              report_date:         reportDate,
              submitted_on:        today,
              is_backdated:        isBackdated,
              updated,
              calls_received:      callsReceived,
              calls_ordered:       callsOrdered,
              calls_rejected:      callsRejected,
              unaccounted_calls:   callsReceived - callsOrdered - callsRejected,
              orders_match:        ordersMatch,
              system_orders:       stats.system_orders,
              delivery_orders:     stats.delivery_orders,
              pickup_orders:       stats.pickup_orders,
              other_type_orders:   stats.other_type_orders,
              addis_orders:        stats.addis_orders,
              other_region_orders: stats.other_region_orders,
              abroad_orders:       stats.abroad_orders,
              total_sales:         stats.total_sales,
              order_ids:           stats.order_ids,
              notes,
              request: {
                ip:         req.ip ?? null,
                user_agent: req.headers["user-agent"] ?? null,
              },
            }),
          ]
        );

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }

      log.info("Daily call report submitted", {
        staffId,
        reportId,
        report_date: reportDate,
        is_backdated: isBackdated,
        updated,
        calls_received: callsReceived,
        orders_match: ordersMatch,
      });

      res.json({
        success: true,
        message: `Daily call report for ${reportDate} ${updated ? "updated" : "submitted"} successfully.`,
        data: {
          id:              reportId,
          report_date:     reportDate,
          submitted_on:    today,
          is_backdated:    isBackdated,
          updated,
          orders_match:    ordersMatch,
          calls_received:  callsReceived,
          calls_ordered:   callsOrdered,
          calls_rejected:  callsRejected,
          ...publicDayStats(stats),
          notes,
        },
      });
    } catch (err) {
      log.error("Failed to submit daily call report", err);
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
        callDateFilter = " AND report_date BETWEEN ? AND ?";
        cdp.push(from, to);
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
        `SELECT
           COALESCE(SUM(calls_received), 0) AS call_count,
           COALESCE(SUM(calls_ordered), 0) AS calls_ordered,
           COALESCE(SUM(calls_rejected), 0) AS calls_rejected
         FROM call_center_daily_reports
         WHERE staff_id = ?${callDateFilter}`,
        [staffId, ...cdp]
      ) as [any[], any];

      const s = orderRows[0] || {};
      res.json({
        success: true,
        data: {
          total_orders:  Number(s.total_orders || 0),
          delivered:     Number(s.delivered    || 0),
          cancelled:     Number(s.cancelled    || 0),
          pending:       Number(s.pending      || 0),
          call_count:    Number(callRows[0]?.call_count || 0),
          calls_ordered: Number(callRows[0]?.calls_ordered || 0),
          calls_rejected: Number(callRows[0]?.calls_rejected || 0),
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
// GET /api/callcenter/me/report  — daily order report (call_center only)
//
// Powers the Reporting Channel tab:
//   • orders placed per day
//   • delivery vs pickup split
//   • Addis Ababa vs other-region vs abroad split
//
// Everything is scoped to orders created by the authenticated agent.
// Query params: ?from ?to (YYYY-MM-DD), defaults to the last 30 days.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/me/report",
  authenticate,
  authorise("call_center"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = req.user!.id;
      const { from: fromQ, to: toQ } = req.query as Record<string, string | undefined>;

      const isoDate = (d: Date) => d.toISOString().slice(0, 10);
      const today = new Date();
      const defaultFrom = new Date(today);
      defaultFrom.setDate(today.getDate() - 29);

      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      let from = fromQ && dateRe.test(fromQ) ? fromQ : isoDate(defaultFrom);
      let to   = toQ   && dateRe.test(toQ)   ? toQ   : isoDate(today);
      if (from > to) [from, to] = [to, from];

      const [rows] = await pool.query(
        `SELECT
           DATE(o.created_at) AS date,
           COUNT(*) AS orders,
           SUM(CASE WHEN LOWER(o.order_type) = 'delivery' THEN 1 ELSE 0 END) AS delivery_orders,
           SUM(CASE WHEN LOWER(o.order_type) = 'pickup'   THEN 1 ELSE 0 END) AS pickup_orders,
           SUM(CASE WHEN LOWER(COALESCE(o.order_type, '')) NOT IN ('delivery','pickup') THEN 1 ELSE 0 END) AS other_type_orders,
           SUM(CASE WHEN LOWER(COALESCE(o.city, '')) LIKE 'addis%' THEN 1 ELSE 0 END) AS addis_orders,
           SUM(CASE WHEN LOWER(COALESCE(o.city, '')) LIKE '%abroad%' THEN 1 ELSE 0 END) AS abroad_orders,
           SUM(CASE
                 WHEN COALESCE(o.city, '') <> ''
                  AND LOWER(o.city) NOT LIKE 'addis%'
                  AND LOWER(o.city) NOT LIKE '%abroad%'
                 THEN 1 ELSE 0
               END) AS other_region_orders,
           COALESCE(SUM(o.total), 0) AS total_sales
         FROM orders o
         WHERE o.created_by_staff_id = ?
           AND o.deleted_at IS NULL
           AND o.created_at BETWEEN ? AND ?
         GROUP BY DATE(o.created_at)
         ORDER BY date ASC`,
        [staffId, `${from} 00:00:00`, `${to} 23:59:59`]
      ) as [any[], any];

      const dailyMap = new Map<string, any>();

      for (const r of rows) {
        const date = isoDay(r.date);
        dailyMap.set(date, {
          date,
          orders:               Number(r.orders || 0),
          delivery_orders:      Number(r.delivery_orders || 0),
          pickup_orders:        Number(r.pickup_orders || 0),
          other_type_orders:    Number(r.other_type_orders || 0),
          addis_orders:         Number(r.addis_orders || 0),
          other_region_orders:  Number(r.other_region_orders || 0),
          abroad_orders:        Number(r.abroad_orders || 0),
          total_sales:          Number(r.total_sales || 0),
          calls_received:       0,
          calls_ordered:        0,
          calls_rejected:       0,
          report_submitted:     false,
          is_backdated:         false,
        });
      }

      const [reportRows] = await pool.query(
        `SELECT report_date, calls_received, calls_ordered, calls_rejected,
                is_backdated, submitted_at
           FROM call_center_daily_reports
          WHERE staff_id = ?
            AND report_date BETWEEN ? AND ?
          ORDER BY report_date ASC`,
        [staffId, from, to]
      ) as [any[], any];

      for (const r of reportRows) {
        const date = isoDay(r.report_date);
        const row = dailyMap.get(date) ?? {
          date,
          orders:               0,
          delivery_orders:      0,
          pickup_orders:        0,
          other_type_orders:    0,
          addis_orders:         0,
          other_region_orders:  0,
          abroad_orders:        0,
          total_sales:          0,
        };
        row.calls_received = Number(r.calls_received || 0);
        row.calls_ordered = Number(r.calls_ordered || 0);
        row.calls_rejected = Number(r.calls_rejected || 0);
        row.report_submitted = true;
        row.is_backdated = Boolean(r.is_backdated);
        row.submitted_at = r.submitted_at;
        dailyMap.set(date, row);
      }

      const daily = Array.from(dailyMap.values())
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const total = (key: string) => daily.reduce((sum: number, d: any) => sum + Number(d[key] || 0), 0);
      const days = Math.max(
        1,
        Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
      );

      const [callRows] = await pool.query(
        `SELECT COUNT(*) AS calls_logged
         FROM call_logs
         WHERE staff_id = ?
           AND logged_at BETWEEN ? AND ?`,
        [staffId, `${from} 00:00:00`, `${to} 23:59:59`]
      ) as [any[], any];

      res.json({
        success: true,
        data: {
          date_range: { from, to },
          summary: {
            total_orders:        total("orders"),
            delivery_orders:     total("delivery_orders"),
            pickup_orders:       total("pickup_orders"),
            other_type_orders:   total("other_type_orders"),
            addis_orders:        total("addis_orders"),
            other_region_orders: total("other_region_orders"),
            abroad_orders:       total("abroad_orders"),
            total_sales:         total("total_sales"),
            avg_orders_per_day:  Number((total("orders") / days).toFixed(1)),
            calls_received:      total("calls_received"),
            calls_ordered:       total("calls_ordered"),
            calls_rejected:      total("calls_rejected"),
            reports_submitted:   daily.filter((d: any) => d.report_submitted).length,
            calls_logged:        Number(callRows[0]?.calls_logged || 0),
          },
          daily,
        },
      });
    } catch (err) {
      log.error("Failed to build call center report", err);
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
        callDateFilter = " AND cl.report_date BETWEEN ? AND ?";
        cdp.push(from, to);
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
           (SELECT COALESCE(SUM(cl.calls_received), 0) FROM call_center_daily_reports cl WHERE cl.staff_id = su.id${callDateFilter}) AS call_count,
           (SELECT COALESCE(SUM(cl.calls_ordered), 0)  FROM call_center_daily_reports cl WHERE cl.staff_id = su.id${callDateFilter}) AS calls_ordered,
           (SELECT COALESCE(SUM(cl.calls_rejected), 0) FROM call_center_daily_reports cl WHERE cl.staff_id = su.id${callDateFilter}) AS calls_rejected
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
        calls_ordered: Number(r.calls_ordered || 0),
        calls_rejected: Number(r.calls_rejected || 0),
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
