/**
 * src/routes/store-report.ts
 * Asella Organic — Sub Store Daily Pickup Report
 *
 * GET  /api/store-report/summary — system-calculated totals for one date.
 * POST /api/store-report         — store_manager saves the daily report.
 *
 * The pickup-order count and sales total are never trusted from the client.
 * They are recalculated from the orders the authenticated store manager placed
 * on the selected date. Notes and the date are the only editable fields.
 *
 * A report for a date other than the server's current date is marked as
 * backdated and written to audit_log together with the exact order IDs that
 * produced the totals, so the submission can always be reconstructed.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { sendSimpleMessage } from "../lib/telegram.js";
import { z } from "zod";

const router = Router();

export const StoreReportSchema = z.object({
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "report_date must be YYYY-MM-DD"),
  notes:       z.string().trim().max(500).optional().default(""),
});

interface StoreOrderRow {
  id:         string;
  order_type: string | null;
  status:     string | null;
  total:      string | number | null;
}

interface StoreStats {
  total_orders:       number;
  pickup_orders:      number;
  delivery_orders:    number;
  other_orders:       number;
  excluded_orders:    number;
  total_sales:        number;
  order_ids:          string[];
  excluded_order_ids: string[];
}

/** Orders in these statuses never count toward sales or pickup totals. */
const EXCLUDED_STATUSES = new Set(["cancelled", "returned"]);

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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

async function currentStoreDate(executor: any): Promise<string> {
  const [rows] = (await executor.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today"
  )) as [any[], any];
  return String(rows[0]?.today ?? new Date().toISOString().slice(0, 10));
}

/**
 * Calculate the reportable totals from the orders this manager placed.
 * Cancelled and returned orders are returned separately for transparency but
 * are excluded from the pickup count and sales total.
 */
async function computeStoreStats(
  executor: any,
  staffId: string,
  reportDate: string
): Promise<StoreStats> {
  const [rows] = (await executor.query(
    `SELECT id, order_type, status, total
       FROM orders
      WHERE created_by_staff_id = ?
        AND deleted_at IS NULL
        AND created_at >= ?
        AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY created_at ASC, id ASC`,
    [staffId, reportDate, reportDate]
  )) as [StoreOrderRow[], any];

  let pickup = 0;
  let delivery = 0;
  let sales = 0;
  const orderIds: string[] = [];
  const excludedOrderIds: string[] = [];

  for (const row of rows) {
    const status = String(row.status ?? "").trim().toLowerCase();
    if (EXCLUDED_STATUSES.has(status)) {
      excludedOrderIds.push(row.id);
      continue;
    }

    orderIds.push(row.id);
    const type = String(row.order_type ?? "").trim().toLowerCase();
    if (type === "pickup") pickup += 1;
    else if (type === "delivery") delivery += 1;
    sales += Number(row.total ?? 0);
  }

  return {
    total_orders:       orderIds.length,
    pickup_orders:      pickup,
    delivery_orders:    delivery,
    other_orders:       orderIds.length - pickup - delivery,
    excluded_orders:    excludedOrderIds.length,
    total_sales:        Math.round(sales * 100) / 100,
    order_ids:          orderIds,
    excluded_order_ids: excludedOrderIds,
  };
}

function publicStats(stats: StoreStats) {
  return {
    total_orders:    stats.total_orders,
    pickup_orders:   stats.pickup_orders,
    delivery_orders: stats.delivery_orders,
    other_orders:    stats.other_orders,
    excluded_orders: stats.excluded_orders,
    total_sales:     stats.total_sales,
  };
}

function money(value: number): string {
  return `ETB ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/store-report/summary?date=YYYY-MM-DD
//
// Read-only preview used by the form. It is intentionally authoritative: the
// same calculation runs again when the report is submitted.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/summary",
  authenticate,
  authorise("store_manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const reportDate = String(req.query.date ?? "");
      if (!isValidDate(reportDate)) {
        res.status(422).json({ success: false, error: "date must be a valid YYYY-MM-DD value" });
        return;
      }

      const today = await currentStoreDate(pool);
      if (reportDate > today) {
        res.status(422).json({ success: false, error: "Report date cannot be in the future." });
        return;
      }

      const staffId = req.user!.id;
      const stats = await computeStoreStats(pool, staffId, reportDate);

      const [existingRows] = (await pool.query(
        `SELECT id, total_orders, pickup_orders, delivery_orders, total_sales,
                notes, is_backdated, submitted_on, submitted_at
           FROM store_reports
          WHERE store_id = ? AND report_date = ?
          ORDER BY submitted_at DESC
          LIMIT 1`,
        [staffId, reportDate]
      )) as [any[], any];

      const existing = existingRows[0];

      res.json({
        success: true,
        data: {
          report_date: reportDate,
          today,
          is_backdated: reportDate !== today,
          stats: publicStats(stats),
          existing_report: existing
            ? {
                id:              existing.id,
                total_orders:    Number(existing.total_orders || 0),
                pickup_orders:   Number(existing.pickup_orders || 0),
                delivery_orders: Number(existing.delivery_orders || 0),
                total_sales:     Number(existing.total_sales || 0),
                notes:           existing.notes,
                is_backdated:    Boolean(existing.is_backdated),
                submitted_on:    isoDay(existing.submitted_on),
                submitted_at:    existing.submitted_at,
              }
            : null,
        },
      });
    } catch (err) {
      log.error("Failed to calculate store report summary", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/store-report — save one day's report.
//
// The client may send pickup_orders / total_sales, but they are stripped by the
// schema and recalculated from orders. One report row is kept per store/date;
// resubmitting updates it and records a revision in audit_log.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  authorise("store_manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);

    const parsed = StoreReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error:   "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { report_date: reportDate } = parsed.data;
    const notes = parsed.data.notes?.trim() || null;

    if (!isValidDate(reportDate)) {
      res.status(422).json({ success: false, error: "report_date must be a valid YYYY-MM-DD date" });
      return;
    }

    try {
      const storeId = req.user!.id;
      const [staffRows] = (await pool.query(
        `SELECT full_name, username FROM staff_users WHERE id = ? AND deleted_at IS NULL`,
        [storeId]
      )) as [any[], any];
      const storeName = staffRows[0]?.full_name || staffRows[0]?.username || "Store";

      const today = await currentStoreDate(pool);
      if (reportDate > today) {
        res.status(422).json({ success: false, error: "Report date cannot be in the future." });
        return;
      }

      // Authoritative calculation — never read these values from the request.
      const stats = await computeStoreStats(pool, storeId, reportDate);
      const isBackdated = reportDate !== today;

      const connection = await pool.getConnection();
      const createdId = crypto.randomUUID();
      let reportId = createdId;
      let updated = false;
      let oldValues: Record<string, unknown> | null = null;

      try {
        await connection.beginTransaction();

        const [existingRows] = (await connection.query(
          `SELECT id, total_orders, pickup_orders, delivery_orders, total_sales,
                  notes, is_backdated, submitted_on, submitted_at
             FROM store_reports
            WHERE store_id = ? AND report_date = ?
            ORDER BY submitted_at DESC
            LIMIT 1
            FOR UPDATE`,
          [storeId, reportDate]
        )) as [any[], any];

        const existing = existingRows[0];

        if (existing) {
          reportId = existing.id;
          updated = true;
          oldValues = {
            total_orders:    Number(existing.total_orders || 0),
            pickup_orders:   Number(existing.pickup_orders || 0),
            delivery_orders: Number(existing.delivery_orders || 0),
            total_sales:     Number(existing.total_sales || 0),
            notes:           existing.notes,
            is_backdated:    Boolean(existing.is_backdated),
            submitted_on:    isoDay(existing.submitted_on),
            submitted_at:    existing.submitted_at,
          };

          await connection.query(
            `UPDATE store_reports
                SET total_orders = ?, pickup_orders = ?, delivery_orders = ?,
                    total_sales = ?, notes = ?, is_backdated = ?,
                    submitted_on = ?, submitted_at = NOW()
              WHERE id = ?`,
            [
              stats.total_orders,
              stats.pickup_orders,
              stats.delivery_orders,
              stats.total_sales,
              notes,
              isBackdated ? 1 : 0,
              today,
              reportId,
            ]
          );
        } else {
          await connection.query(
            `INSERT INTO store_reports
               (id, store_id, report_date, total_orders, pickup_orders,
                delivery_orders, total_sales, notes, is_backdated,
                submitted_on, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              reportId,
              storeId,
              reportDate,
              stats.total_orders,
              stats.pickup_orders,
              stats.delivery_orders,
              stats.total_sales,
              notes,
              isBackdated ? 1 : 0,
              today,
            ]
          );
        }

        // Full, reconstructable audit record. The totals can be re-verified
        // against these order IDs even if orders are edited later.
        const auditAction = isBackdated
          ? "STORE_REPORT_BACKDATED"
          : "STORE_REPORT_SUBMITTED";

        await connection.query(
          `INSERT INTO audit_log
             (table_name, record_id, actor, action, old_values, new_values)
           VALUES ('store_reports', ?, ?, ?, ?, ?)`,
          [
            reportId,
            storeId,
            auditAction,
            oldValues ? JSON.stringify(oldValues) : null,
            JSON.stringify({
              report_id:           reportId,
              store_id:            storeId,
              store_name:          storeName,
              report_date:         reportDate,
              submitted_on:        today,
              is_backdated:        isBackdated,
              updated,
              total_orders:        stats.total_orders,
              pickup_orders:       stats.pickup_orders,
              delivery_orders:     stats.delivery_orders,
              other_orders:        stats.other_orders,
              excluded_orders:     stats.excluded_orders,
              total_sales:         stats.total_sales,
              order_ids:           stats.order_ids,
              excluded_order_ids:  stats.excluded_order_ids,
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

      // ── Notify the main store only after the report is committed ────────
      const orderLine = `${stats.pickup_orders} pickup · ${stats.delivery_orders} delivery · ${stats.total_orders} orders`;
      const backdatedLine = isBackdated
        ? `\n⚠️ Backdated entry: submitted ${today} for ${reportDate}`
        : "";
      const updatedLine = updated ? `\n♻️ Updated an existing report` : "";

      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId) {
        const msg =
          `📦 *Daily Store Report — Sub Store*\n` +
          `*Store:* ${storeName}\n` +
          `*Date:* ${reportDate}\n` +
          `*Orders:* ${orderLine}\n` +
          `*Total Sales:* ${money(stats.total_sales)}\n` +
          `${notes ? `*Notes:* ${notes}\n` : ""}` +
          `${backdatedLine}${updatedLine}`;

        void sendSimpleMessage(adminChatId, msg).catch((err) => {
          log.warn("Telegram store-report alert failed", { error: err?.message });
        });
      }

      await pool.query(
        `INSERT INTO customer_notifications (chat_id, order_id, type, title, body)
         SELECT su.telegram_chat_id, NULL, 'store_report', ?, ?
         FROM staff_users su
         WHERE su.role IN ('admin','manager') AND su.active = TRUE AND su.deleted_at IS NULL
           AND su.telegram_chat_id IS NOT NULL`,
        [
          `Daily Store Report from ${storeName}${isBackdated ? " (backdated)" : ""}`,
          `${orderLine} · ${money(stats.total_sales)} on ${reportDate}` +
            (isBackdated ? ` · submitted ${today}` : "") +
            (updated ? " · updated" : ""),
        ]
      ).catch((err) => {
        log.warn("In-app notification for store-report failed", { error: err?.message });
      });

      log.info("Store report submitted", {
        storeId,
        reportId,
        report_date: reportDate,
        is_backdated: isBackdated,
        updated,
        pickup_orders: stats.pickup_orders,
        total_orders: stats.total_orders,
        total_sales: stats.total_sales,
      });

      res.json({
        success: true,
        message: `Daily report for ${reportDate} ${updated ? "updated" : "submitted"} successfully.`,
        data: {
          id:              reportId,
          report_date:     reportDate,
          submitted_on:    today,
          is_backdated:    isBackdated,
          updated,
          total_orders:    stats.total_orders,
          pickup_orders:   stats.pickup_orders,
          delivery_orders: stats.delivery_orders,
          total_sales:     stats.total_sales,
          notes,
        },
      });
    } catch (err) {
      log.error("Failed to submit store report", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
