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
import { z }  from "zod";
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
import { apiCache }          from "../middleware/apiCache.js";

// Helper for application-level data quality validation
function validateProductData(name?: string, image_url?: string | null) {
  if (name) {
    const sizePattern = /\(\d+\s*(g|ml|kg|pcs|tablet|gummies|pills)\)/i;
    if (sizePattern.test(name)) {
      return "Size-like pattern found in name. Please remove it and use the package_size field instead.";
    }
  }
  if (image_url) {
    const lower = image_url.toLowerCase();
    if (lower.includes("drive.google.com") || lower.includes("dropbox.com")) {
      return "Direct image URL or local upload path is required, not a cloud drive share link.";
    }
  }
  return null;
}

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/products  — paginated list (public)
// Query params: ?page=1 ?limit=20 ?search=moringa ?tag=bestseller ?active=true
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", apiCache, async (req: Request, res: Response): Promise<void> => {
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
      conditions.push("p.active = ?");
      params.push(active === "true");
    } else {
      conditions.push("p.active = true");
    }

    if (search) {
      conditions.push("p.name LIKE ?");
      params.push(`%${search}%`);
    }
    if (tag) {
      conditions.push("p.tag = ?");
      params.push(tag);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    let orderByClause = "ORDER BY featured DESC, name ASC";
    let joinClause = "";
    const selectFields = `p.id, p.name, p.package_size, p.price, p.unit_cost, p.description, p.image_url,
                          p.featured, p.tag, p.inventory_quantity, p.low_stock_threshold, p.active`;
    
    if (req.query.sort === "sales") {
      joinClause = `LEFT JOIN order_items oi ON p.id = oi.product_id`;
      orderByClause = `GROUP BY p.id ORDER BY COALESCE(SUM(oi.quantity), 0) DESC, p.name ASC`;
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) AS total FROM products p ${where}`, params
    ) as [any[], any];
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const [rows] = await pool.query(
      `SELECT ${selectFields}
       FROM products p
       ${joinClause}
       ${where}
       ${orderByClause}
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    ) as [any[], any];

    log.info("Products listed", { pageNum, limitNum, total, search, tag, sort: req.query.sort });

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
// GET /api/products/grouped  — Returns products grouped by name
// ─────────────────────────────────────────────────────────────────────────────
router.get("/grouped", apiCache, async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const { search, tag, active } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (active !== undefined) {
      conditions.push("p.active = ?");
      params.push(active === "true");
    } else {
      conditions.push("p.active = true");
    }

    if (search) {
      conditions.push("p.name LIKE ?");
      params.push(`%${search}%`);
    }
    if (tag) {
      conditions.push("p.tag = ?");
      params.push(tag);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Fetch all matching rows (since there are < 100 base products, no pagination needed here)
    const selectFields = `p.id, p.name, p.package_size, p.price, p.unit_cost, p.description, p.image_url,
                          p.featured, p.tag, p.inventory_quantity, p.low_stock_threshold, p.active`;
    
    let joinClause = "";
    let orderByClause = "ORDER BY p.featured DESC, p.name ASC, p.price ASC";
    
    if (req.query.sort === "sales") {
      joinClause = `LEFT JOIN order_items oi ON p.id = oi.product_id`;
      orderByClause = `GROUP BY p.id ORDER BY COALESCE(SUM(oi.quantity), 0) DESC, p.name ASC, p.price ASC`;
    }

    const [rows] = await pool.query(
      `SELECT ${selectFields} FROM products p ${joinClause} ${where} ${orderByClause}`,
      params
    ) as [any[], any];

    // Group the rows in memory with normalization for duplicate names
    const groupsMap = new Map<string, any>();
    for (const row of rows) {
      let baseName = (row.name || '').trim();
      let extractedSize = (row.package_size || '').trim();

      // 1. Remove trailing sizes like "(100g)", "200 g", "60 Tablet" from name
      const sizeRegex = /(?:\s*\(?\s*(\d+\s*(?:g|ml|kg|pcs|tablets?|gummies|pills?))\s*\)?)$/i;
      const match = baseName.match(sizeRegex);
      if (match) {
        if (!extractedSize) {
          extractedSize = match[1].trim(); // use extracted size if db field was empty
        }
        baseName = baseName.replace(sizeRegex, '').trim();
      }

      // 2. Title Case for grouping consistency (e.g., "Nila powder" -> "Nila Powder")
      baseName = baseName
        .toLowerCase()
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // 3. Hardcoded corrections for major inconsistencies in the DB
      if (baseName === "Hibiscus Kerkede Leafe" || baseName === "Hibiscus Kerkede") {
        baseName = "Hibiscus Dry Leafe";
      }

      if (!groupsMap.has(baseName)) {
        groupsMap.set(baseName, {
          name: baseName,
          description: row.description,
          image_url: row.image_url,
          featured: Boolean(row.featured),
          tag: row.tag,
          active: Boolean(row.active),
          variants: []
        });
      }
      
      // Push the variant using the extracted size (or 'Default Size' if still empty)
      groupsMap.get(baseName).variants.push({
        id: row.id,
        package_size: extractedSize || 'Standard',
        price: row.price,
        unit_cost: row.unit_cost,
        inventory_quantity: row.inventory_quantity,
        low_stock_threshold: row.low_stock_threshold,
        active: Boolean(row.active)
      });
    }

    const groupedData = Array.from(groupsMap.values());

    log.info("Grouped products listed", { totalGroups: groupedData.length, search, tag });

    res.json({
      success: true,
      data: groupedData
    });
  } catch (err) {
    log.error("Failed to list grouped products", err);
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
// GET /api/products/health  — admin data-quality check
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/health",
  authenticate,
  authorise("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      // 1. Broken images (drive.google, dropbox, missing, or no extension)
      const [brokenImages] = await pool.query(
        `SELECT id, name, package_size, image_url 
         FROM products 
         WHERE active = true AND (
           image_url IS NULL OR 
           image_url = '' OR 
           image_url LIKE '%drive.google.com%' OR 
           image_url LIKE '%dropbox.com%' OR
           (image_url NOT LIKE '%.jpg' AND image_url NOT LIKE '%.jpeg' AND image_url NOT LIKE '%.png' AND image_url NOT LIKE '%.webp' AND image_url NOT LIKE 'http%')
         )`
      ) as [any[], any];

      // 2. Invalid tags
      const allowedTags = ["Traditional", "Herbs", "Oils", "Superfood", "Other"];
      const [invalidTags] = await pool.query(
        `SELECT id, name, package_size, tag 
         FROM products 
         WHERE active = true AND tag IS NOT NULL AND tag != '' AND tag NOT IN (?)`,
        [allowedTags]
      ) as [any[], any];

      // 3. Near duplicates (same normalized name and size)
      // We do this in-memory because regex replacing in MySQL 5.7 is tricky.
      const [allActive] = await pool.query(
        `SELECT id, name, package_size FROM products WHERE active = true`
      ) as [any[], any];

      const normalizedMap = new Map<string, any[]>();
      for (const p of allActive) {
        // Strip trailing sizes like (100g)
        let baseName = (p.name || '').trim();
        const sizeRegex = /(?:\s*\(?\s*(\d+\s*(?:g|ml|kg|pcs|tablet|gummies|pills))\s*\)?)$/i;
        baseName = baseName.replace(sizeRegex, '').trim().toLowerCase();
        
        const size = (p.package_size || '').trim().toLowerCase();
        const key = `${baseName}|${size}`;
        
        if (!normalizedMap.has(key)) normalizedMap.set(key, []);
        normalizedMap.get(key)!.push(p);
      }
      
      const nearDuplicates = Array.from(normalizedMap.values())
        .filter(group => group.length > 1)
        .flat();

      res.json({
        success: true,
        data: {
          brokenImages,
          invalidTags,
          nearDuplicates
        }
      });
    } catch (err) {
      log.error("Failed to run health check", err);
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
      `SELECT id, name, package_size, price, unit_cost, description, image_url,
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

      const validationError = validateProductData(d.name, d.image_url);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      const newId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO products
           (id, name, package_size, price, unit_cost, description, image_url,
            featured, tag, inventory_quantity, low_stock_threshold, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId, d.name, d.package_size, d.price, d.unit_cost ?? 0,
          d.description ?? null, d.image_url ?? null,
          d.featured ?? false, d.tag ?? null,
          d.inventory_quantity ?? 0, d.low_stock_threshold ?? 10,
          d.active ?? true
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

      const validationError = validateProductData(fields.name as string, fields.image_url as string);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      const allowed = [
        "name", "package_size", "price", "unit_cost", "description",
        "image_url", "featured", "tag", "active",
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
         WHERE id = ?`,
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/products/bulk  — bulk create products (transactional)
// ─────────────────────────────────────────────────────────────────────────────
//
// Body shape:
//   { products: Array<ProductInput> }
//
// All-or-nothing transaction: if any single product fails (duplicate
// name, invalid data, FK violation), the entire batch rolls back.
// Useful for catalog import from a CSV or a new supplier feed.
const BulkCreateProductsSchema = z.object({
  products: z.array(CreateProductSchema).min(1).max(100),
});

router.post(
  "/bulk",
  authenticate,
  authorise("admin", "manager"),
  validate(BulkCreateProductsSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const body = req.body as { products: any[] };
    const products = body.products;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const created: any[] = [];
      for (const product of products) {
        const id = crypto.randomUUID();
        await connection.query(
          `INSERT INTO products
             (id, name, package_size, price, inventory_quantity,
              low_stock_threshold, active, image_url, description,
              tag, featured)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            product.name,
            product.package_size,
            product.price,
            product.inventory_quantity ?? 0,
            product.low_stock_threshold ?? 5,
            product.active ?? true,
            product.image_url ?? null,
            product.description ?? null,
            product.tag ?? null,
            product.featured ?? false,
          ]
        );
        created.push({ id, name: product.name });
      }

      await connection.commit();
      log.info("Bulk product creation", { count: created.length });
      res.status(201).json({
        success: true,
        data: { created, count: created.length },
      });
    } catch (err) {
      await connection.rollback();
      log.error("Bulk product creation failed", err);
      res.status(500).json({
        success: false,
        error:   "Bulk creation failed; all changes rolled back",
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      connection.release();
    }
  }
);

export default router;