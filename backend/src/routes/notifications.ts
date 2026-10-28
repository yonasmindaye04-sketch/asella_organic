/**
 * src/routes/notifications.ts
 * Asella Organic — In-App Notification Center (admin/manager only)
 *
 * Aggregates events from multiple tables and returns them as a unified
 * notification feed with per-user unread tracking and summary metrics.
 *
 * GET  /api/notifications                — unified feed (with `read` status & `unread_count`)
 * GET  /api/notifications/summary        — unread notification counts per category
 * GET  /api/notifications/unread-counts  — alias for unread counts summary
 * POST /api/notifications/read           — mark notification(s) or all as read
 */

import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

// Per-user read notification tracking (keyed by user.id, storing composite "category:id" or raw "id")
const readNotificationsByUser = new Map<string, Set<string>>();

function getUserReadSet(userId: string): Set<string> {
  let set = readNotificationsByUser.get(userId);
  if (!set) {
    set = new Set<string>();
    readNotificationsByUser.set(userId, set);
  }
  return set;
}

function isNotificationRead(readSet: Set<string>, category: string, id: string | number): boolean {
  const strId = String(id);
  return readSet.has(`${category}:${strId}`) || readSet.has(strId);
}

function resolveSinceDate(since?: string, defaultDays = 7): string {
  if (since) {
    const parsedDate = new Date(since);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }
  return new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchAggregatedNotifications(sinceDate: string, category?: string): Promise<any[]> {
  const notifications: any[] = [];

  // 1. Low-stock movements
  if (!category || category === "low_stock") {
    const [rows] = (await pool.query(
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
       WHERE im.movement_type IN ('sale', 'adjustment', 'damage_loss')
         AND im.quantity_after <= p.low_stock_threshold
         AND im.created_at >= ?
       ORDER BY im.created_at DESC
       LIMIT 50`,
      [sinceDate]
    )) as [any[], any];
    notifications.push(...rows);
  }

  // 2. Stock requests (from secondary stores / staff)
  if (!category || category === "stock_request") {
    const [rows] = (await pool.query(
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
       ORDER BY sr.created_at DESC
       LIMIT 50`,
      [sinceDate]
    )) as [any[], any];
    notifications.push(...rows);
  }

  // 3. New orders
  if (!category || category === "new_order") {
    const [rows] = (await pool.query(
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
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [sinceDate]
    )) as [any[], any];
    notifications.push(...rows);
  }

  // 4. Vendor movements
  if (!category || category === "vendor") {
    const [rows] = (await pool.query(
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
       LIMIT 50`,
      [sinceDate]
    )) as [any[], any];
    notifications.push(...rows);
  }

  return notifications.map((n) => {
    try {
      return {
        ...n,
        metadata: typeof n.metadata === "string" ? JSON.parse(n.metadata) : n.metadata,
      };
    } catch {
      return n;
    }
  });
}

async function computeUnreadSummary(sinceDate: string, userId: string) {
  const readSet = getUserReadSet(userId);

  // Execute underlying table count queries for diagnostics/compatibility
  await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS cnt FROM inventory_movements im
       JOIN products p ON im.product_id = p.id
       WHERE im.movement_type IN ('sale', 'adjustment', 'damage_loss') AND im.quantity_after <= p.low_stock_threshold
         AND im.created_at >= ?`,
      [sinceDate]
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM stock_requests WHERE created_at >= ? AND status = 'pending'`,
      [sinceDate]
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM orders WHERE created_at >= ?
       AND source NOT IN ('Vendor_DB', 'Packaging', 'Stock_Alert')
       AND status = 'Pending'`,
      [sinceDate]
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM vendor_orders WHERE created_at >= ?`,
      [sinceDate]
    ),
  ]);

  const items = await fetchAggregatedNotifications(sinceDate);
  let lowStockUnread = 0;
  let stockReqUnread = 0;
  let newOrderUnread = 0;
  let vendorUnread = 0;

  for (const item of items) {
    if (isNotificationRead(readSet, item.category, item.id)) continue;
    if (item.category === "low_stock") lowStockUnread++;
    else if (item.category === "stock_request") stockReqUnread++;
    else if (item.category === "new_order") newOrderUnread++;
    else if (item.category === "vendor") vendorUnread++;
  }

  const total = lowStockUnread + stockReqUnread + newOrderUnread + vendorUnread;

  return {
    low_stock: lowStockUnread,
    stock_request: stockReqUnread,
    new_order: newOrderUnread,
    vendor: vendorUnread,
    total,
  };
}

// ─── GET /api/notifications ───────────────────────────────────────────────────

router.get(
  "/",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const { category, since, limit, unread } = req.query as Record<string, string | undefined>;
    const LIMIT = Math.min(100, parseInt(limit ?? "50", 10)) || 50;
    const SINCE = resolveSinceDate(since, 7);
    const userId = req.user?.id ?? "admin";
    const readSet = getUserReadSet(userId);

    try {
      const parsed = await fetchAggregatedNotifications(SINCE, category);

      const withReadState = parsed.map((n) => ({
        ...n,
        read: isNotificationRead(readSet, n.category, n.id),
      }));

      const filtered =
        unread === "true" || unread === "1"
          ? withReadState.filter((n) => !n.read)
          : withReadState;

      filtered.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const result = filtered.slice(0, LIMIT);
      const unreadCount = withReadState.filter((n) => !n.read).length;

      res.json({
        success: true,
        data: result,
        total: result.length,
        unread_count: unreadCount,
      });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to fetch notifications", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/notifications/summary & /unread-counts ─────────────────────────

async function handleUnreadSummary(req: Request, res: Response): Promise<void> {
  const { since } = req.query as Record<string, string | undefined>;
  const SINCE = resolveSinceDate(since, 7);
  const userId = req.user?.id ?? "admin";

  try {
    const summary = await computeUnreadSummary(SINCE, userId);
    res.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch notification summary", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

router.get("/summary", authenticate, authorise("admin", "manager"), handleUnreadSummary);
router.get("/unread-counts", authenticate, authorise("admin", "manager"), handleUnreadSummary);
router.get("/unread", authenticate, authorise("admin", "manager"), handleUnreadSummary);

// ─── Bulk & Single Mark-as-Read Handler ──────────────────────────────────────

async function handleMarkNotificationsRead(
  req: Request,
  res: Response,
  forceAll = false
): Promise<void> {
  const userId = req.user?.id ?? "admin";
  const readSet = getUserReadSet(userId);
  const {
    id,
    ids,
    notificationIds,
    items: bodyItems,
    category,
    all,
    since,
  } = (req.body ?? {}) as {
    id?: string | number;
    ids?: Array<string | number>;
    notificationIds?: Array<string | number>;
    items?: Array<{ id: string | number; category?: string }>;
    category?: string;
    all?: boolean;
    since?: string;
  };

  try {
    const targetCategory = category && category !== "all" ? category : undefined;
    const bulkIds = Array.isArray(ids)
      ? ids
      : Array.isArray(notificationIds)
      ? notificationIds
      : [];
    const hasSpecificTargets =
      id !== undefined ||
      bulkIds.length > 0 ||
      (Array.isArray(bodyItems) && bodyItems.length > 0);
    const shouldMarkAll = forceAll || Boolean(all) || !hasSpecificTargets;

    let updatedCount = 0;

    if (shouldMarkAll) {
      // Mark all notifications across all time windows so any filter range reflects read state
      const allItems = await fetchAggregatedNotifications("1970-01-01", targetCategory);
      for (const item of allItems) {
        readSet.add(`${item.category}:${item.id}`);
        readSet.add(String(item.id));
        updatedCount++;
      }
    }

    if (id !== undefined) {
      if (targetCategory) readSet.add(`${targetCategory}:${id}`);
      readSet.add(String(id));
      updatedCount++;
    }

    for (const itemId of bulkIds) {
      const strId = String(itemId);
      if (strId.includes(":")) {
        readSet.add(strId);
        const rawId = strId.split(":").slice(1).join(":");
        if (rawId) readSet.add(rawId);
      } else {
        if (targetCategory) readSet.add(`${targetCategory}:${strId}`);
        readSet.add(strId);
      }
      updatedCount++;
    }

    if (Array.isArray(bodyItems)) {
      for (const entry of bodyItems) {
        if (!entry || entry.id === undefined) continue;
        const cat = entry.category && entry.category !== "all" ? entry.category : targetCategory;
        if (cat) readSet.add(`${cat}:${entry.id}`);
        readSet.add(String(entry.id));
        updatedCount++;
      }
    }

    const summarySince = resolveSinceDate(since, 7);
    const summary = await computeUnreadSummary(summarySince, userId);

    res.json({
      success: true,
      updated: updatedCount,
      data: summary,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to mark notifications as read", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

router.post("/read", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, false)
);
router.patch("/read", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, false)
);
router.put("/read", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, false)
);

router.post("/mark-all-read", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, true)
);
router.patch("/mark-all-read", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, true)
);
router.put("/mark-all-read", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, true)
);

router.post("/read-all", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, true)
);
router.patch("/read-all", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, true)
);
router.put("/read-all", authenticate, authorise("admin", "manager"), (req, res) =>
  handleMarkNotificationsRead(req, res, true)
);

export default router;
