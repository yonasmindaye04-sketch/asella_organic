/**
 * src/routes/notifications.ts
 * Asella Organic — In-App Notification Center
 *
 * Aggregates events across operations:
 * - Admin / Manager / Tech Support: All system events (low stock, stock requests, new orders, vendor orders)
 * - Substore Manager: Store-specific stock requests and order updates
 * - Call Center: Order and inventory updates
 * - Delivery / Driver: Dedicated Delivery Notification Channel (assigned orders, pending deliveries, dispatch alerts)
 *
 * GET /api/notifications          — unified feed (last 7 days by default)
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
  authorise("admin", "manager", "store_manager", "call_center", "delivery", "driver", "employee", "tech_support"),
  async (req: Request, res: Response): Promise<void> => {
    const { category, since, limit } = req.query as Record<string, string | undefined>;
    const LIMIT = Math.min(100, parseInt(limit ?? "50", 10)) || 50;
    const role = (req.user?.role || "").toLowerCase();
    const isStoreManager = role === "store_manager";
    const isDriver = role === "delivery" || role === "driver";
    const staffId = req.user?.id;
    const username = req.user?.username || "";

    let SINCE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (since) {
      const parsedDate = new Date(since);
      if (!isNaN(parsedDate.getTime())) {
        SINCE = parsedDate.toISOString().slice(0, 10);
      }
    }

    try {
      const notifications: any[] = [];

      // ── DEDICATED DELIVERY NOTIFICATION CHANNEL ─────────────────────────────
      if (isDriver) {
        // 1. Deliveries directly assigned to this driver
        if (!category || category === "delivery_assigned") {
          const [assignedRows] = await pool.query(
            `SELECT
               o.id,
               'delivery_assigned' AS category,
               CONCAT('Delivery Job: #', SUBSTRING(o.id, 1, 8), ' - ', o.customer_name) AS title,
               CONCAT(
                 'Drop-off: ', COALESCE(NULLIF(o.location, ''), NULLIF(o.location, ''), o.city, 'Addis Ababa'),
                 ' | Phone: ', o.phone, ' | Total: ', COALESCE(o.total, 0), ' ETB | Status: ', o.status
               ) AS body,
               o.created_at,
               JSON_OBJECT(
                 'order_id', o.id,
                 'customer_name', o.customer_name,
                 'phone', o.phone,
                 'city', o.city,
                 'specific_location', o.location,
                 'status', o.status,
                 'total', o.total,
                 'assigned_to', o.assigned_to
               ) AS metadata
             FROM orders o
             LEFT JOIN delivery_assignments da ON da.order_id = o.id
             WHERE (o.assigned_to = ? OR da.driver_username = ?)
               AND o.created_at >= ?
             ORDER BY o.created_at DESC
             LIMIT 50`,
            [username, username, SINCE]
          ) as [any[], any];
          notifications.push(...(assignedRows || []));
        }

        // 2. Pending delivery orders in the system ready for dispatch
        if (!category || category === "new_delivery") {
          const [pendingRows] = await pool.query(
            `SELECT
               o.id,
               'new_delivery' AS category,
               CONCAT('New Delivery Request: #', SUBSTRING(o.id, 1, 8), ' - ', o.customer_name) AS title,
               CONCAT(
                 'Destination: ', COALESCE(NULLIF(o.location, ''), NULLIF(o.location, ''), o.city, 'Addis Ababa'),
                 ' | Phone: ', o.phone, ' | Total: ', COALESCE(o.total, 0), ' ETB | Status: ', o.status
               ) AS body,
               o.created_at,
               JSON_OBJECT(
                 'order_id', o.id,
                 'customer_name', o.customer_name,
                 'phone', o.phone,
                 'city', o.city,
                 'specific_location', o.location,
                 'status', o.status,
                 'total', o.total
               ) AS metadata
             FROM orders o
             WHERE o.order_type = 'delivery'
               AND o.status IN ('Pending', 'Confirmed', 'Dispatched')
               AND o.created_at >= ?
             ORDER BY o.created_at DESC
             LIMIT 50`,
            [SINCE]
          ) as [any[], any];
          notifications.push(...(pendingRows || []));
        }

        // 3. Dispatch & internal alerts sent to deliveries
        if (!category || category === "dispatch_alert") {
          const [alerts] = await pool.query(
            `SELECT
               m.id,
               'dispatch_alert' AS category,
               CONCAT('Dispatch Alert: ', m.sender_name) AS title,
               m.content AS body,
               m.created_at,
               JSON_OBJECT(
                 'message_id', m.id,
                 'sender_name', m.sender_name,
                 'sender_role', m.sender_role,
                 'priority', m.priority,
                 'channel', m.channel
               ) AS metadata
             FROM internal_messages m
             WHERE (m.channel = 'deliveries' OR m.priority = 'announcement')
               AND m.created_at >= ?
             ORDER BY m.created_at DESC
             LIMIT 30`,
            [SINCE]
          ) as [any[], any];
          notifications.push(...(alerts || []));
        }

        const parsed = notifications.map(n => {
          try {
            return { ...n, metadata: typeof n.metadata === "string" ? JSON.parse(n.metadata) : n.metadata };
          } catch {
            return n;
          }
        });
        parsed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const result = parsed.slice(0, LIMIT);
        res.json({ success: true, data: result, total: result.length });
        return;
      }

      // ── GENERAL STAFF / ADMIN / STORE MANAGER FEED ─────────────────────────
      // 1. Low-stock movements
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
        notifications.push(...(rows || []));
      }

      // 2. Stock requests
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
        notifications.push(...(rows || []));
      }

      // 3. New orders
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
        notifications.push(...(rows || []));
      }

      // 4. Vendor movements
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
        notifications.push(...(rows || []));
      }

      // 5. Parse metadata JSON strings
      const parsed = notifications.map(n => {
        try {
          return { ...n, metadata: typeof n.metadata === "string" ? JSON.parse(n.metadata) : n.metadata };
        } catch {
          return n;
        }
      });

      // 6. Sort by created_at DESC and limit
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
  authorise("admin", "manager", "store_manager", "call_center", "delivery", "driver", "employee", "tech_support"),
  async (req: Request, res: Response): Promise<void> => {
    const { since } = req.query as Record<string, string | undefined>;
    let SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // default last 24h
    if (since) {
      const parsedDate = new Date(since);
      if (!isNaN(parsedDate.getTime())) {
        SINCE = parsedDate.toISOString().slice(0, 10);
      }
    }

    const role = (req.user?.role || "").toLowerCase();
    const isStoreManager = role === "store_manager";
    const isDriver = role === "delivery" || role === "driver";
    const staffId = req.user?.id;
    const username = req.user?.username || "";

    try {
      if (isDriver) {
        const [[assignedRow]] = await pool.query(
          `SELECT COUNT(DISTINCT o.id) AS cnt FROM orders o
           LEFT JOIN delivery_assignments da ON da.order_id = o.id
           WHERE (o.assigned_to = ? OR da.driver_username = ?)
             AND o.created_at >= ?`,
          [username, username, SINCE]
        ) as [any[], any];

        const [[pendingRow]] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM orders
           WHERE order_type = 'delivery' AND status IN ('Pending', 'Confirmed')
             AND created_at >= ?`,
          [SINCE]
        ) as [any[], any];

        const [[alertsRow]] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM internal_messages
           WHERE (channel = 'deliveries' OR priority = 'announcement')
             AND created_at >= ?`,
          [SINCE]
        ) as [any[], any];

        const [[driverMentionsRow]] = await pool.query(
          `SELECT COUNT(*) AS cnt FROM internal_messages
           WHERE (content LIKE ? OR JSON_CONTAINS(mentions, ?))
             AND created_at >= ?`,
          [`%@${username}%`, JSON.stringify(username), SINCE]
        ) as [any[], any];
        const driverMentionCnt = Number(driverMentionsRow?.cnt ?? 0);

        const assignedCnt = Number(assignedRow?.cnt ?? 0);
        const pendingCnt = Number(pendingRow?.cnt ?? 0);
        const alertsCnt = Number(alertsRow?.cnt ?? 0);

        res.json({
          success: true,
          data: {
            delivery_assigned: assignedCnt,
            new_delivery: pendingCnt,
            dispatch_alert: alertsCnt,
            mention: driverMentionCnt,
            total: assignedCnt + pendingCnt + alertsCnt + driverMentionCnt,
          },
        });
        return;
      }

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

      const [[mentionsRow]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM internal_messages
         WHERE (content LIKE ? OR JSON_CONTAINS(mentions, ?))
           AND created_at >= ?`,
        [`%@${username}%`, JSON.stringify(username), SINCE]
      ) as [any[], any];
      const mentionsCnt = Number(mentionsRow?.cnt ?? 0);

      res.json({
        success: true,
        data: {
          low_stock:     lowStockCnt,
          stock_request: Number(stockReqs?.cnt ?? 0),
          new_order:     Number(newOrders?.cnt ?? 0),
          vendor:        vendorCnt,
          mention:       mentionsCnt,
          total:         lowStockCnt + Number(stockReqs?.cnt ?? 0) +
                         Number(newOrders?.cnt ?? 0) + vendorCnt + mentionsCnt,
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
