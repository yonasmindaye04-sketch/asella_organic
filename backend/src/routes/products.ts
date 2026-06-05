/**
 * src/routes/products.ts
 * Asella Organic — Products & Inventory Routes (MySQL)
 *
 * Changes from v2:
 *   + GET /           — paginated (?page, ?limit, ?search, ?tag, ?active)
 *   + GET /low-stock  — paginated (?page, ?limit)
 *   + Structured logger (createLogger) replaces console.error
 *   + DELETE /:id     — now requires 2FA (admin + 2FA)
 *   All existing MySQL logic, transactions, and Zod validation unchanged.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool   from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { require2FA }   from "../middleware/2fa.js";
import { validate }     from "../middleware/validate.js";
import {
  CreateProductSchema,
  UpdateProductSchema,
  AdjustStockSchema,
} from "../schemas/index.js";
import { sendLowStockAlert } from "../lib/telegram.js";
import { createLogger }      from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products  — paginated list (public)
// Query params: ?page=1 ?limit=20 ?search=moringa ?tag=bestseller ?active=true
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const {
      search, tag,
      page  = "1",
      limit = "20",
      active,             // if omitted → only active products (public default)
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params:     unknown[] = [];

    // Admins can pass ?active=false to see archived products; public default = active only
    if (active !== undefined) {
      conditions.push("active = ?");
      params.push(active === "true");
    } else {
      conditions.push("active = true");
    }

    if (search) {
      conditions.push("name LIKE ?");
      params.push(`%${search}%`);
    }
    if (tag) {
      conditions.push("tag = ?");
      params.push(tag);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products ${where}`, params
    ) as [any[], any];
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const [rows] = await pool.query(
      `SELECT id, name, package_size, price, description, image_url,
              featured, tag, inventory_quantity, low_stock_threshold, active
       FROM products ${where}
       ORDER BY featured DESC, name ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    ) as [any[], any];

    log.info("Products listed", { pageNum, limitNum, total, search, tag });

    res.json({
      success: true,
      data:    rows,
      meta:    { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    log.error("Failed to list products", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products/low-stock  — paginated (authenticated)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/low-stock",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { page = "1", limit = "20" } = req.query as Record<string, string>;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM products
         WHERE inventory_quantity <= low_stock_threshold AND active = true`
      ) as [any[], any];
      const total = parseInt(countRows[0]?.total ?? "0", 10);

      const [rows] = await pool.query(
        `SELECT id, name, package_size, inventory_quantity, low_stock_threshold
         FROM products
         WHERE inventory_quantity <= low_stock_threshold AND active = true
         ORDER BY inventory_quantity ASC
         LIMIT ? OFFSET ?`,
        [limitNum, offset]
      ) as [any[], any];

      log.info("Low-stock listed", { pageNum, limitNum, total });
      res.json({
        success: true,
        data:    rows,
        meta:    { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      log.error("Failed to list low-stock products", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const [rows] = await pool.query(
      `SELECT id, name, package_size, price, description, image_url,
              featured, tag, inventory_quantity, low_stock_threshold
       FROM products
       WHERE id = ? AND active = true`,
      [req.params.id]
    ) as [any[], any];

    if (!rows[0]) {
      res.status(404).json({ success: false, error: "Product not found" });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    log.error("Failed to fetch product", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  authorise("admin", "manager"),
  validate(CreateProductSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const d     = req.body;
      const newId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO products
           (id, name, package_size, price, description, image_url,
            featured, tag, inventory_quantity, low_stock_threshold, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)`,
        [
          newId, d.name, d.package_size, d.price,
          d.description ?? null, d.image_url ?? null,
          d.featured ?? false, d.tag ?? null,
          d.inventory_quantity ?? 0, d.low_stock_threshold ?? 10,
        ]
      );

      const [newRows] = await pool.query(
        `SELECT id, name, package_size, price, inventory_quantity FROM products WHERE id = ?`, [newId]
      ) as [any[], any];

      await pool.query(
        `INSERT INTO audit_log (table_name, actor, action, old_values, new_values)
         VALUES ('products', ?, 'INSERT', NULL, ?)`,
        [req.user!.id, JSON.stringify({ name: d.name, price: d.price })]
      ).catch(() => {});

      log.info("Product created", { productId: newId, name: d.name });
      res.status(201).json({ success: true, data: newRows[0] });
    } catch (err) {
      log.error("Failed to create product", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/products/:id
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateProductSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const fields  = req.body as Record<string, unknown>;
      const allowed = [
        "name", "package_size", "price", "description",
        "image_url", "featured", "tag",
        "inventory_quantity", "low_stock_threshold",
      ];

      const updates: string[] = [];
      const values:  unknown[] = [];

      for (const field of allowed) {
        if (fields[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(fields[field]);
        }
      }

      if (updates.length === 0) {
        res.status(400).json({ success: false, error: "No valid fields to update" });
        return;
      }

      values.push(req.params.id);
      const [result] = await pool.query(
        `UPDATE products SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = ? AND active = true`,
        values
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Product not found" });
        return;
      }

      await pool.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, new_values)
         VALUES ('products', ?, ?, 'UPDATE', ?)`,
        [req.params.id, req.user!.id, JSON.stringify(fields)]
      ).catch(() => {});

      log.info("Product updated", { productId: req.params.id });
      res.json({ success: true, data: { message: "Product updated." } });
    } catch (err) {
      log.error("Failed to update product", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/products/:id  — soft-delete (admin + 2FA)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorise("admin"),
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [result] = await pool.query(
        `UPDATE products SET active = false, updated_at = NOW() WHERE id = ?`,
        [req.params.id]
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Product not found" });
        return;
      }

      log.info("Product archived", { productId: req.params.id });
      res.json({ success: true, data: { message: "Product archived." } });
    } catch (err) {
      log.error("Failed to archive product", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products/:id/stock  — adjust inventory (transactional)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:id/stock",
  authenticate,
  authorise("admin", "manager"),
  validate(AdjustStockSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log       = createLogger(req);
    const { change_amount, reason } = req.body;
    const productId = req.params.id;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT id, name, package_size, inventory_quantity, low_stock_threshold
         FROM products WHERE id = ? AND active = true FOR UPDATE`,
        [productId]
      ) as [any[], any];
      const product = rows[0];

      if (!product) {
        await connection.rollback();
        res.status(404).json({ success: false, error: "Product not found" });
        return;
      }

      const newQty = product.inventory_quantity + change_amount;
      if (newQty < 0) {
        await connection.rollback();
        res.status(400).json({
          success: false,
          error: `Insufficient stock. Current: ${product.inventory_quantity}, requested change: ${change_amount}`,
        });
        return;
      }

      await connection.query(
        `UPDATE products SET inventory_quantity = ?, updated_at = NOW() WHERE id = ?`,
        [newQty, productId]
      );

      await connection.query(
        `INSERT INTO inventory_movements (id, product_id, change_amount, reason, performed_by, quantity_after)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), productId, change_amount, reason, req.user!.id, newQty]
      );

      await connection.commit();

      if (newQty <= product.low_stock_threshold) {
        void sendLowStockAlert({
          name:      product.name,
          size:      product.package_size,
          current:   newQty,
          threshold: product.low_stock_threshold,
        });
      }

      log.info("Stock adjusted", { productId, change_amount, newQty, reason });
      res.json({
        success: true,
        data: {
          new_quantity:    newQty,
          product_name:    product.name,
          below_threshold: newQty <= product.low_stock_threshold,
        },
      });
    } catch (err) {
      await connection.rollback();
      log.error("Failed to adjust stock", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      connection.release();
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products/:id/movements
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:id/movements",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [rows] = await pool.query(
        `SELECT im.*, s.full_name AS performed_by_name
         FROM inventory_movements im
         LEFT JOIN staff_users s ON im.performed_by = s.id
         WHERE im.product_id = ?
         ORDER BY im.created_at DESC
         LIMIT 100`,
        [req.params.id]
      ) as [any[], any];
      res.json({ success: true, data: rows });
    } catch (err) {
      log.error("Failed to fetch movements", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;