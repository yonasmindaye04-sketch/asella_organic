/**
 * src/routes/notifications.ts
 * Asella Organic — In-App Notification Center (admin/manager only)
 *
 * Aggregates events from multiple tables and returns them as a unified
 * notification feed. No separate table needed — reads existing data.
 *
 * GET /api/notifications          — unified feed (last 7 days)
 * GET /api/notifications/summary  — unread counts per category
 */

import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";


const router = Router();

// ─── GET /api/notifications ───────────────────────────────────────────────────

router.get(
  "/",
  authenticate,
  authorise("admin", "manager", "store_manager"),
  async (req: Request, res: Response): Promise<void> => {
    const { category, since, limit } = req.query as Record<string, string | undefined>;
    const LIMIT = Math.min(100, parseInt(limit ?? "50", 10)) || 50;
    const isStoreManager = req.user?.role === "store_manager";
    const staffId = req.user?.id;
    
    let SINCE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (since) {
      const parsedDate = new Date(since);
      if (!isNaN(parsedDate.getTime())) {
        SINCE = parsedDate.toISOString().slice(0, 10);
      }
    }

    try {
      const notifications: any[] = [];

      // ── 1. Low-stock movements ─────────────────────────────────────────────
      // Company-wide inventory is not a sub-store manager's data.
      if (!isStoreManager && (!category || category === "low_stock")) {
        const [rows] = await pool.query(
          `SELECT
             im.id,
             'low_stock' AS category,
             CONCAT('Low Stock: ', p.name, ' (', p.package_size, ')') AS title,
             CONCAT('Only ', im.quantity_after, ' units remaining (threshold: ', p.low_stock_threshold, ')') AS body,
             im.created_at,
             JSON_OBJECT(
               'product_id', p.id,
               'product_name', p.name,
               'package_size', p.package_size,
               'quantity_after', im.quantity_after,
               'threshold', p.low_stock_threshold,
               'order_id', im.reference_id
             ) AS metadata
           FROM inventory_movements im
           JOIN products p ON im.product_id = p.id
           WHERE im.movement_type = 'sale'
             AND im.quantity_after <= p.low_stock_threshold
             AND im.created_at >= ?
           ORDER BY im.created_at DESC
           LIMIT 30`,
          [SINCE]
        ) as [any[], any];
        notifications.push(...rows);
      }

      // ── 2. Stock requests (from secondary stores / staff) ─────────────────
      // Sub-store managers only see requests they raised themselves.
      if (!category || category === "stock_request") {
        const [rows] = await pool.query(
          `SELECT
             sr.id,
             'stock_request' AS category,
             CONCAT('Stock Request: ', sr.item) AS title,
             CONCAT(
               COALESCE(sr.requested_by, 'Staff'), ' needs ', sr.qty_needed,
               ' units',
               IF(sr.package_size IS NOT NULL AND sr.package_size != '', CONCAT(' of ', sr.package_size), ''),
               IF(sr.delivery_date IS NOT NULL, CONCAT(' by ', sr.delivery_date), ''),
               ' (current stock: ', sr.stock_available, ')'
             ) AS body,
             sr.created_at,
             JSON_OBJECT(
               'request_id', sr.id,
               'item', sr.item,
               'package_size', sr.package_size,
               'qty_needed', sr.qty_needed,
               'stock_available', sr.stock_available,
               'status', sr.status,
               'requested_by', sr.requested_by,
               'delivery_date', sr.delivery_date
             ) AS metadata
           FROM stock_requests sr
           WHERE sr.created_at >= ?
             ${isStoreManager ? "AND sr.requested_by_user_id = ?" : ""}
           ORDER BY sr.created_at DESC
           LIMIT 30`,
          isStoreManager ? [SINCE, staffId] : [SINCE]
        ) as [any[], any];
        notifications.push(...rows);
      }

      // ── 3. New orders ─────────────────────────────────────────────────────
      if (!category || category === "new_order") {
        const [rows] = await pool.query(
          `SELECT
             o.id,
             'new_order' AS category,
             CONCAT('New Order from ', o.customer_name) AS title,
             CONCAT(
               'Source: ', o.source, ' | City: ', COALESCE(o.city, 'N/A'),
               ' | Total: ', COALESCE(o.total, 0), ' ETB | Status: ', o.status
             ) AS body,
             o.created_at,
             JSON_OBJECT(
               'order_id', o.id,
               'customer_name', o.customer_name,
               'phone', o.phone,
               'city', o.city,
               'source', o.source,
               'status', o.status,
               'total', o.total
             ) AS metadata
           FROM orders o
           WHERE o.created_at >= ?
             AND o.source NOT IN ('Vendor_DB', 'Packaging', 'Stock_Alert')
             ${isStoreManager ? "AND o.created_by_staff_id = ?" : ""}
           ORDER BY o.created_at DESC
           LIMIT 30`,
          isStoreManager ? [SINCE, staffId] : [SINCE]
        ) as [any[], any];
        notifications.push(...rows);
      }

      // ── 4. Vendor movements ───────────────────────────────────────────────
      // Procurement data is not visible to sub-store managers.
      if (!isStoreManager && (!category || category === "vendor")) {
        const [rows] = await pool.query(
          `SELECT
             vo.id,
             'vendor' AS category,
             CONCAT('Vendor Purchase: ', vo.vendor_name) AS title,
             CONCAT(
               'Item: ', vo.item, ' | Amount: ', vo.amount,
               ' | Status: ', vo.status
             ) AS body,
             vo.created_at,
             JSON_OBJECT(
               'vendor_order_id', vo.id,
               'vendor_name', vo.vendor_name,
               'item', vo.item,
               'amount', vo.amount,
               'price', vo.price,
               'status', vo.status
             ) AS metadata
           FROM vendor_orders vo
           WHERE vo.created_at >= ?
           ORDER BY vo.created_at DESC
           LIMIT 30`,
          [SINCE]
        ) as [any[], any];
        notifications.push(...rows);
      }

      // ── 5. Parse metadata JSON strings ────────────────────────────────────
      const parsed = notifications.map(n => {
        try {
          return { ...n, metadata: typeof n.metadata === "string" ? JSON.parse(n.metadata) : n.metadata };
        } catch {
          return n;
        }
      });

      // ── 6. Sort by created_at DESC and limit ──────────────────────────────
      parsed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const result = parsed.slice(0, LIMIT);

      res.json({ success: true, data: result, total: result.length });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to fetch notifications", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/notifications/summary ──────────────────────────────────────────

router.get(
  "/summary",
  authenticate,
  authorise("admin", "manager", "store_manager"),
  async (req: Request, res: Response): Promise<void> => {
    const { since } = req.query as Record<string, string | undefined>;
    let SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // default last 24h
    if (since) {
      const parsedDate = new Date(since);
      if (!isNaN(parsedDate.getTime())) {
        SINCE = parsedDate.toISOString().slice(0, 10);
      }
    }

    const isStoreManager = req.user?.role === "store_manager";
    const staffId = req.user?.id;

    try {
      // Company-wide stock and procurement counts stay admin/manager-only.
      let lowStockCnt = 0;
      let vendorCnt = 0;

      if (!isStoreManager) {
        const [[lowStock]] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM inventory_movements im
           JOIN products p ON im.product_id = p.id
           WHERE im.movement_type = 'sale' AND im.quantity_after <= p.low_stock_threshold
             AND im.created_at >= ?`, [SINCE]
        ) as [any[], any];
        lowStockCnt = Number(lowStock?.cnt ?? 0);
      }

      const [[stockReqs]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM stock_requests
         WHERE created_at >= ? AND status = 'pending'
           ${isStoreManager ? "AND requested_by_user_id = ?" : ""}`,
        isStoreManager ? [SINCE, staffId] : [SINCE]
      ) as [any[], any];

      const [[newOrders]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM orders WHERE created_at >= ?
         AND source NOT IN ('Vendor_DB', 'Packaging', 'Stock_Alert')
         AND status = 'Pending'
         ${isStoreManager ? "AND created_by_staff_id = ?" : ""}`,
        isStoreManager ? [SINCE, staffId] : [SINCE]
      ) as [any[], any];

      if (!isStoreManager) {
        const [[vendorMovs]] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM vendor_orders WHERE created_at >= ?`, [SINCE]
        ) as [any[], any];
        vendorCnt = Number(vendorMovs?.cnt ?? 0);
      }

      res.json({
        success: true,
        data: {
          low_stock:     lowStockCnt,
          stock_request: Number(stockReqs?.cnt ?? 0),
          new_order:     Number(newOrders?.cnt ?? 0),
          vendor:        vendorCnt,
          total:         lowStockCnt + Number(stockReqs?.cnt ?? 0) +
                         Number(newOrders?.cnt ?? 0) + vendorCnt,
        },
      });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to fetch notification summary", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;