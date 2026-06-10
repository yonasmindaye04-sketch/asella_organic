/**
 * src/routes/stock.ts
 * Asella Organic — Inventory Management Routes (MySQL)
 *
 * FULL REPLACEMENT of the thin original stock.ts.
 *
 * Endpoints:
 *   GET    /api/stock                          → all products + stock status
 *   GET    /api/stock/summary                  → KPI cards (counts, value)
 *   GET    /api/stock/movements                → global movement log (filtered)
 *   GET    /api/stock/low                      → products below threshold
 *   POST   /api/stock/adjustment               → manual adjustment
 *   POST   /api/stock/receive/:vendorOrderId   → receive a PO → stock in
 *   POST   /api/stock/request                  → raise a stock request
 *   GET    /api/stock/requests                 → list stock requests
 *   PATCH  /api/stock/requests/:id/status      → approve / cancel / complete
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { recordMovement } from "../lib/inventory.js";
import { sendStockRequestAlert } from "../lib/telegram.js";
import { z } from "zod";

const router = Router();

// ─── Inline Zod schemas ───────────────────────────────────────────────────
// (Kept local to avoid touching shared schemas/index.ts in this patch)

const AdjustmentSchema = z.object({
  product_id:    z.preprocess((val) => typeof val === 'string' ? val.trim() : val, z.string().min(1, "product_id is required")),
  movement_type: z.enum(["adjustment", "return", "damage_loss", "initial_stock"]),
  change_amount: z.number().int().refine((n) => n !== 0, { message: "change_amount cannot be zero" }),
  reason:        z.string().min(3, "reason required (min 3 chars)").max(255),
  notes:         z.string().max(1000).optional(),
});

const ReceiveStockSchema = z.object({
  notes: z.string().max(500).optional(),
});

const CreateStockRequestSchema = z.object({
  product_id:      z.string().min(1).optional(),
  item:            z.string().min(1).max(255),
  package_size:    z.string().max(50).optional(),
  stock_available: z.number().int().nonnegative().optional(),
  qty_needed:      z.number().int().positive("qty_needed must be > 0"),
  delivery_date:   z.string().optional(),
  requested_by:    z.string().max(100).optional(),
});

const UpdateStockRequestStatusSchema = z.object({
  status: z.enum(["pending", "ordered", "received", "cancelled"]),
  notes:  z.string().max(500).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function _stockStatus(qty: number, threshold: number): "ok" | "low" | "critical" | "out_of_stock" {
  if (qty === 0)            return "out_of_stock";
  if (qty <= threshold / 2) return "critical";
  if (qty <= threshold)     return "low";
  return "ok";
}

// ─── GET /api/stock ───────────────────────────────────────────────────────
// All products with current quantity, status badge, and last movement date.

router.get(
  "/",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { search, status } = req.query as Record<string, string | undefined>;

    const conditions: string[] = ["p.active = true"];
    const values:     unknown[] = [];

    if (search) {
      conditions.push("(p.name LIKE ? OR p.package_size LIKE ?)");
      values.push(`%${search}%`, `%${search}%`);
    }

    // Filter by stock_status computed value
    if (status === "out_of_stock") {
      conditions.push("p.inventory_quantity = 0");
    } else if (status === "critical") {
      conditions.push("p.inventory_quantity > 0 AND p.inventory_quantity <= p.low_stock_threshold / 2");
    } else if (status === "low") {
      conditions.push("p.inventory_quantity > p.low_stock_threshold / 2 AND p.inventory_quantity <= p.low_stock_threshold");
    } else if (status === "ok") {
      conditions.push("p.inventory_quantity > p.low_stock_threshold");
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    try {
      const [rows] = await pool.query(
        `SELECT
           p.id,
           p.name,
           p.package_size,
           p.price,
           p.inventory_quantity AS current_quantity,
           p.low_stock_threshold,
           p.tag,
           p.image_url,
           CASE
             WHEN p.inventory_quantity = 0                             THEN 'out_of_stock'
             WHEN p.inventory_quantity <= p.low_stock_threshold / 2   THEN 'critical'
             WHEN p.inventory_quantity <= p.low_stock_threshold        THEN 'low'
             ELSE 'ok'
           END AS stock_status,
           -- stock value
           (p.inventory_quantity * p.price) AS stock_value,
           -- last movement
           (SELECT im.created_at
            FROM   inventory_movements im
            WHERE  im.product_id = p.id
            ORDER  BY im.created_at DESC
            LIMIT  1) AS last_movement_at,
           (SELECT im.movement_type
            FROM   inventory_movements im
            WHERE  im.product_id = p.id
            ORDER  BY im.created_at DESC
            LIMIT  1) AS last_movement_type
         FROM products p
         ${where}
         ORDER BY p.inventory_quantity ASC, p.name ASC`,
        values
      ) as [any[], any];

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET /stock]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/stock/summary ───────────────────────────────────────────────
// KPI numbers for the dashboard inventory cards.

router.get(
  "/summary",
  authenticate,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [[summary]] = await pool.query(
        `SELECT
           COUNT(*)                                                          AS total_products,
           SUM(inventory_quantity)                                           AS total_units,
           SUM(inventory_quantity * price)                                   AS total_stock_value,
           SUM(CASE WHEN inventory_quantity = 0 THEN 1 ELSE 0 END)         AS out_of_stock_count,
           SUM(CASE WHEN inventory_quantity > 0
                    AND inventory_quantity <= low_stock_threshold / 2
                    THEN 1 ELSE 0 END)                                       AS critical_count,
           SUM(CASE WHEN inventory_quantity > low_stock_threshold / 2
                    AND inventory_quantity <= low_stock_threshold
                    THEN 1 ELSE 0 END)                                       AS low_count,
           SUM(CASE WHEN inventory_quantity > low_stock_threshold
                    THEN 1 ELSE 0 END)                                       AS ok_count
         FROM products
         WHERE active = true`
      ) as [any[], any];

      // Movement stats for the last 30 days
      const [[movStats]] = await pool.query(
        `SELECT
           COUNT(*)                                                   AS movements_30d,
           SUM(CASE WHEN movement_type = 'sale'
                    THEN ABS(change_amount) ELSE 0 END)              AS units_sold_30d,
           SUM(CASE WHEN movement_type = 'purchase_received'
                    THEN change_amount ELSE 0 END)                   AS units_received_30d
         FROM inventory_movements
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
      ) as [any[], any];

      res.json({
        success: true,
        data: {
          ...summary,
          total_stock_value:  Number(summary.total_stock_value ?? 0),
          ...movStats,
        },
      });
    } catch (err) {
      console.error("[GET /stock/summary]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/stock/movements ─────────────────────────────────────────────
// Global movement log with filters. Per-product history is still on
// GET /api/products/:id/movements.

router.get(
  "/movements",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const {
      product_id, type, reference_type,
      from, to, page, limit,
    } = req.query as Record<string, string | undefined>;

    const PAGE  = Math.max(1, parseInt(page  ?? "1",  10));
    const LIMIT = Math.min(100, parseInt(limit ?? "50", 10));
    const OFFSET = (PAGE - 1) * LIMIT;

    const conditions: string[] = [];
    const values:     unknown[] = [];

    if (product_id)     { conditions.push("im.product_id = ?");     values.push(product_id); }
    if (type)           { conditions.push("im.movement_type = ?");   values.push(type); }
    if (reference_type) { conditions.push("im.reference_type = ?"); values.push(reference_type); }
    if (from)           { conditions.push("im.created_at >= ?");     values.push(from); }
    if (to)             { conditions.push("im.created_at <= ?");     values.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM inventory_movements im ${where}`,
        values
      ) as [any[], any];

      const [rows] = await pool.query(
        `SELECT
           im.id,
           im.movement_type,
           im.change_amount,
           im.reason,
           im.quantity_after,
           im.notes,
           im.reference_id,
           im.reference_type,
           im.created_at,
           p.id   AS product_id,
           p.name AS product_name,
           p.package_size,
           su.full_name AS performed_by_name,
           su.username  AS performed_by_username
         FROM inventory_movements im
         JOIN products    p  ON im.product_id = p.id
         LEFT JOIN staff_users su ON im.performed_by = su.id
         ${where}
         ORDER BY im.created_at DESC
         LIMIT ? OFFSET ?`,
        [...values, LIMIT, OFFSET]
      ) as [any[], any];

      res.json({
        success: true,
        data: rows,
        meta: {
          total:    Number(total),
          page:     PAGE,
          limit:    LIMIT,
          pages:    Math.ceil(Number(total) / LIMIT),
        },
      });
    } catch (err) {
      console.error("[GET /stock/movements]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/stock/low ───────────────────────────────────────────────────

router.get(
  "/low",
  authenticate,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.query(
        `SELECT
           id, name, package_size,
           inventory_quantity AS current_quantity,
           low_stock_threshold,
           CASE
             WHEN inventory_quantity = 0                           THEN 'out_of_stock'
             WHEN inventory_quantity <= low_stock_threshold / 2   THEN 'critical'
             ELSE 'low'
           END AS stock_status
         FROM products
         WHERE inventory_quantity <= low_stock_threshold
           AND active = true
         ORDER BY inventory_quantity ASC`
      ) as [any[], any];

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET /stock/low]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── POST /api/stock/adjustment ───────────────────────────────────────────
// Manual admin/manager stock adjustment.

router.post(
  "/adjustment",
  authenticate,
  authorise("admin", "manager"),
  validate(AdjustmentSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { product_id, movement_type, change_amount, reason, notes } = req.body as {
      product_id:    string;
      movement_type: "adjustment" | "return" | "damage_loss" | "initial_stock";
      change_amount: number;
      reason:        string;
      notes?:        string;
    };

    try {
      const result = await recordMovement({
        productId:     product_id,
        type:          movement_type,
        changeAmount:  change_amount,
        performedBy:   req.user!.id,
        referenceType: "manual",
        reason,
        notes:         notes ?? null,
        allowNegative: movement_type === "damage_loss", // allow negative for losses
      });

      res.json({
        success: true,
        data: {
          product_id,
          movement_id:     result.movementId,
          previous_qty:    result.previousQty,
          new_quantity:    result.newQuantity,
          below_threshold: result.belowThreshold,
        },
      });
    } catch (err: any) {
      const isStockError = err.message?.includes("Insufficient stock");
      res.status(isStockError ? 400 : 500).json({
        success: false,
        error: err.message ?? "Internal server error",
      });
    }
  }
);

// ─── POST /api/stock/receive/:vendorOrderId ───────────────────────────────
// Mark a vendor PO as received → stock in for linked product.
// Called by the Telegram webhook (po_accept) AND manually by admins.

router.post(
  "/receive/:vendorOrderId",
  authenticate,
  authorise("admin", "manager"),
  validate(ReceiveStockSchema),
  async (req: Request, res: Response): Promise<void> => {
    const vendorOrderId = Array.isArray(req.params.vendorOrderId)
      ? req.params.vendorOrderId[0]
      : req.params.vendorOrderId;
    if (!vendorOrderId) {
      res.status(400).json({ success: false, error: "Vendor order ID is required." });
      return;
    }
    const { notes } = req.body as { notes?: string };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Fetch the vendor order
      const [voRows] = await conn.query(
        `SELECT id, order_id, product_id, vendor_name, item, amount, status
         FROM vendor_orders
         WHERE id = ?
         FOR UPDATE`,
        [vendorOrderId]
      ) as [any[], any];

      const vo = voRows[0];
      if (!vo) {
        await conn.rollback();
        res.status(404).json({ success: false, error: "Vendor order not found." });
        return;
      }
      if (vo.status === "completed") {
        await conn.rollback();
        res.status(400).json({ success: false, error: "Vendor order already received." });
        return;
      }

      // Parse quantity from amount field (e.g. "50 units" or "50")
      const parsedQty = parseInt(String(vo.amount).replace(/\D/g, ""), 10);
      if (!parsedQty || parsedQty <= 0) {
        await conn.rollback();
        res.status(400).json({
          success: false,
          error: `Cannot parse quantity from vendor_orders.amount = "${vo.amount}".`,
        });
        return;
      }

      // If vendor_order has a product_id, use it directly
      let productId: string | null = vo.product_id ?? null;

      // Otherwise try to match by item name (legacy POs without product_id)
      if (!productId) {
        const [pRows] = await conn.query(
          `SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND active = true LIMIT 1`,
          [vo.item]
        ) as [any[], any];
        productId = pRows[0]?.id ?? null;
      }

      if (!productId) {
        await conn.rollback();
        res.status(400).json({
          success: false,
          error: `No product found matching vendor order item "${vo.item}". ` +
                 `Set product_id on the vendor_order to fix this.`,
        });
        return;
      }

      // Record the stock-in movement
      const result = await recordMovement(
        {
          productId,
          type:          "purchase_received",
          changeAmount:  parsedQty,
          performedBy:   req.user!.id,
          referenceId:   vendorOrderId,
          referenceType: "vendor_order",
          reason:        `PO received from ${vo.vendor_name} (ref: ${vo.order_id})`,
          notes:         notes ?? null,
        },
        conn
      );

      // Mark vendor_order as completed
      await conn.query(
        `UPDATE vendor_orders SET status = 'completed', updated_at = NOW() WHERE id = ?`,
        [vendorOrderId]
      );

      await conn.commit();

      res.json({
        success: true,
        data: {
          vendor_order_id: vendorOrderId,
          product_id:      productId,
          quantity_received: parsedQty,
          new_quantity:    result.newQuantity,
          movement_id:     result.movementId,
        },
      });
    } catch (err: any) {
      await conn.rollback();
      console.error("[POST /stock/receive/:vendorOrderId]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      conn.release();
    }
  }
);

// ─── POST /api/stock/request ──────────────────────────────────────────────

router.post(
  "/request",
  authenticate,
  validate(CreateStockRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const {
      product_id, item, package_size,
      stock_available, qty_needed, delivery_date, requested_by,
    } = req.body as {
      product_id?:     string;
      item:            string;
      package_size?:   string;
      stock_available?: number;
      qty_needed:      number;
      delivery_date?:  string;
      requested_by?:   string;
    };

    try {
      const newId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO stock_requests
           (id, product_id, item, package_size, stock_available,
            qty_needed, delivery_date, requested_by, requested_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          product_id      ?? null,
          item,
          package_size    ?? null,
          stock_available ?? 0,
          qty_needed,
          delivery_date   ?? null,
          requested_by    ?? null,
          req.user!.id,
        ]
      );

      const [reqRows] = await pool.query(
        `SELECT sr.*, p.name AS product_name, p.package_size AS product_package_size
         FROM stock_requests sr
         LEFT JOIN products p ON sr.product_id = p.id
         WHERE sr.id = ?`,
        [newId]
      ) as [any[], any];

      void sendStockRequestAlert({
        item,
        packageSize:  package_size    ?? "N/A",
        current:      stock_available ?? 0,
        needed:       qty_needed,
        deliveryDate: delivery_date   ?? "Not specified",
        requestedBy:  requested_by    ?? req.user!.username,
      });

      res.status(201).json({ success: true, data: reqRows[0] });
    } catch (err) {
      console.error("[POST /stock/request]", err);
      res.status(500).json({ success: false, error: "Failed to create stock request." });
    }
  }
);

// ─── GET /api/stock/requests ──────────────────────────────────────────────

router.get(
  "/requests",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const { status, item } = req.query as Record<string, string | undefined>;
    const conditions: string[] = [];
    const values:     unknown[] = [];

    if (status) { conditions.push("sr.status = ?");     values.push(status); }
    if (item)   { conditions.push("sr.item LIKE ?");     values.push(`%${item}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const [rows] = await pool.query(
        `SELECT
           sr.*,
           su.username  AS requested_by_username,
           su.full_name AS requested_by_name,
           p.name       AS product_name,
           p.inventory_quantity AS current_stock
         FROM stock_requests sr
         LEFT JOIN staff_users su ON sr.requested_by_user_id = su.id
         LEFT JOIN products    p  ON sr.product_id = p.id
         ${where}
         ORDER BY sr.created_at DESC`,
        values
      ) as [any[], any];

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET /stock/requests]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── PATCH /api/stock/requests/:id/status ────────────────────────────────
// When status → 'received', auto-create a purchase_received movement
// if the request is linked to a product.

router.patch(
  "/requests/:id/status",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateStockRequestStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { status, notes } = req.body as { status: string; notes?: string };
    const requestId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!requestId) {
      res.status(400).json({ success: false, error: "Stock request ID is required." });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [srRows] = await conn.query(
        `SELECT * FROM stock_requests WHERE id = ? FOR UPDATE`,
        [requestId]
      ) as [any[], any];

      const sr = srRows[0];
      if (!sr) {
        await conn.rollback();
        res.status(404).json({ success: false, error: "Stock request not found." });
        return;
      }

      // Prevent double-receive
      if (sr.status === "received" && status === "received") {
        await conn.rollback();
        res.status(400).json({ success: false, error: "Already marked as received." });
        return;
      }

      await conn.query(
        `UPDATE stock_requests SET status = ?, notes = ?, updated_at = NOW() WHERE id = ?`,
        [status, notes ?? null, requestId]
      );

      // Auto-increment inventory when request is received AND linked to a product
      let movementResult = null;
      if (status === "received" && sr.product_id && sr.qty_needed > 0) {
        movementResult = await recordMovement(
          {
            productId:     sr.product_id as string,
            type:          "purchase_received",
            changeAmount:  sr.qty_needed as number,
            performedBy:   req.user!.id,
            referenceId:   requestId,
            referenceType: "stock_request",
            reason:        `Stock request #${requestId} fulfilled`,
            notes:         notes ?? null,
          },
          conn
        );
      }

      await conn.commit();

      const [updatedRows] = await pool.query(
        `SELECT sr.*, p.name AS product_name, p.inventory_quantity AS current_stock
         FROM stock_requests sr
         LEFT JOIN products p ON sr.product_id = p.id
         WHERE sr.id = ?`,
        [requestId]
      ) as [any[], any];

      res.json({
        success: true,
        data: updatedRows[0],
        ...(movementResult ? {
          inventory_updated: true,
          new_quantity: movementResult.newQuantity,
        } : {}),
      });
    } catch (err: any) {
      await conn.rollback();
      console.error("[PATCH /stock/requests/:id/status]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      conn.release();
    }
  }
);

export default router;
