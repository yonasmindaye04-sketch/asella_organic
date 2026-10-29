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
import type { PoolConnection } from "mysql2/promise";
import pool   from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { require2FA }   from "../middleware/2fa.js";
import { validate }     from "../middleware/validate.js";
import {
  CreateProductSchema,
  UpdateProductSchema,
  AdjustStockSchema,
} from "../schemas/index.js";
import { createLogger }      from "../lib/logger.js";
import { apiCache, clearApiCache } from "../middleware/apiCache.js";
import { ALLOWED_TAGS, isDuplicate, mergedActive } from "../lib/productRules.js";
import { recordMovement } from "../lib/inventory.js";
import {
  ensureProductGroup,
  renameProductGroup,
  syncGroupAfterVariantChange,
  ProductGroupError,
} from "../lib/productGroups.js";

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

type Queryable = Pick<PoolConnection, "query">;

async function loadGroupMeta(conn: Queryable, groupId: string) {
  const [rows] = await conn.query(
    `SELECT id, name, description, image_url, featured, tag
     FROM product_groups
     WHERE id = ?
     LIMIT 1`,
    [groupId]
  ) as [any[], any];
  return rows[0] ?? null;
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

    let orderByClause = "ORDER BY p.featured DESC, p.name ASC";
    let joinClause = "LEFT JOIN product_groups g ON g.id = p.product_group_id";
    const selectFields = `p.id, p.product_group_id, g.name AS group_name,
                          p.name, p.package_size, p.price, p.description, p.image_url,
                          p.featured, p.tag, p.inventory_quantity, p.active`;
    
    if (req.query.sort === "sales") {
      joinClause += ` LEFT JOIN (
                        SELECT product_id, SUM(quantity) AS sold
                        FROM order_items
                        WHERE product_id IS NOT NULL
                        GROUP BY product_id
                      ) oi ON oi.product_id = p.id`;
      orderByClause = `ORDER BY COALESCE(oi.sold, 0) DESC, p.name ASC`;
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
// GET /api/products/grouped  — Returns variants grouped by product group
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

    const selectFields = `p.id, p.product_group_id, p.name, p.package_size, p.price,
                          p.description, p.image_url, p.featured, p.tag,
                          p.inventory_quantity, p.active,
                          g.name AS group_name, g.description AS group_description,
                          g.image_url AS group_image_url, g.featured AS group_featured,
                          g.tag AS group_tag, g.active AS group_active`;

    let joinClause = "LEFT JOIN product_groups g ON g.id = p.product_group_id";
    let orderByClause = "ORDER BY COALESCE(g.featured, p.featured) DESC, COALESCE(g.name, p.name) ASC, p.price ASC";

    if (req.query.sort === "sales") {
      joinClause += ` LEFT JOIN (
                        SELECT p2.product_group_id AS group_id, SUM(oi.quantity) AS sold
                        FROM order_items oi
                        JOIN products p2 ON p2.id = oi.product_id
                        WHERE p2.product_group_id IS NOT NULL
                        GROUP BY p2.product_group_id
                      ) gs ON gs.group_id = p.product_group_id`;
      orderByClause = `ORDER BY COALESCE(gs.sold, 0) DESC, COALESCE(g.name, p.name) ASC, p.price ASC`;
    }

    const [rows] = await pool.query(
      `SELECT ${selectFields} FROM products p ${joinClause} ${where} ${orderByClause}`,
      params
    ) as [any[], any];

    // Group by product_group_id. Rows without a parent (legacy/inactive
    // products) fall back to one synthetic group per row so the response
    // still exposes them instead of dropping them.
    const groupsMap = new Map<string, any>();
    for (const row of rows) {
      const groupId: string | null = row.product_group_id ?? null;
      const key = groupId ?? `legacy:${row.id}`;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          id: groupId,
          name: (row.group_name ?? row.name ?? "").trim(),
          description: row.group_description ?? row.description,
          image_url: row.group_image_url ?? row.image_url,
          featured: Boolean(row.group_featured ?? row.featured),
          tag: row.group_tag ?? row.tag,
          active: Boolean(row.group_active ?? row.active),
          variants: [],
        });
      } else if (Boolean(row.featured)) {
        groupsMap.get(key)!.featured = true;
      }

      groupsMap.get(key).variants.push({
        id: row.id,
        name: row.name,
        package_size: row.package_size || "Standard",
        price: row.price,

        inventory_quantity: row.inventory_quantity,
        featured: Boolean(row.featured),
        active: Boolean(row.active),
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
  // Returns exact quantities against the threshold, per SKU. Staff-only.
  authorise("admin", "manager", "employee"),
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
        `SELECT p.id, p.product_group_id, g.name AS group_name,
                p.name, p.package_size, p.inventory_quantity, p.low_stock_threshold
         FROM products p
         LEFT JOIN product_groups g ON g.id = p.product_group_id
         WHERE p.inventory_quantity <= p.low_stock_threshold AND p.active = true
         ORDER BY p.inventory_quantity ASC
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
// GET /api/products/admin-catalog (Admin/Manager only, includes unit_cost)
router.get(
  "/admin-catalog",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { search, tag, limit, active } = req.query as Record<string, string | undefined>;
      const conditions: string[] = ["p.deleted_at IS NULL"];
      const params: unknown[] = [];

      if (active === "false") {
        conditions.push("p.active = false");
      } else if (active === "true") {
        conditions.push("p.active = true");
      }

      if (search) {
        conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }
      if (tag) {
        conditions.push("p.tag = ?");
        params.push(tag);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const limitNum = Math.min(1000, Math.max(1, parseInt(limit || "500", 10)));

      const [rows] = await pool.query(
        `SELECT p.id, p.product_group_id, g.name AS group_name,
                p.name, p.package_size, p.price, p.unit_cost, p.description, p.image_url,
                p.featured, p.tag, p.inventory_quantity, p.low_stock_threshold, p.active
         FROM products p
         LEFT JOIN product_groups g ON g.id = p.product_group_id
         ${where}
         ORDER BY p.name ASC
         LIMIT ?`,
        [...params, limitNum]
      ) as [any[], any];

      res.json({ success: true, data: rows });
    } catch (err) {
      log.error("Failed to fetch admin products", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.product_group_id, g.name AS group_name,
              p.name, p.package_size, p.price, p.description, p.image_url,
              p.featured, p.tag, p.inventory_quantity
       FROM products p
       LEFT JOIN product_groups g ON g.id = p.product_group_id
       WHERE p.id = ? AND p.active = true`,
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
    const connection = await pool.getConnection();

    try {
      const d = req.body;

      const validationError = validateProductData(d.name, d.image_url);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      await connection.beginTransaction();

      if (await isDuplicate((sql, params) => connection.query(sql, params) as any, d.name, d.package_size)) {
        await connection.rollback();
        res.status(409).json({ success: false, error: "Active product with this name and size already exists." });
        return;
      }

      // Attach to an existing parent, reuse a group with the same name, or
      // create a new single-variant group.
      const group = await ensureProductGroup(connection, {
        product_group_id: d.product_group_id,
        name:             d.name,
        description:      d.description ?? null,
        image_url:        d.image_url ?? null,
        featured:         d.featured ?? false,
        tag:              d.tag ?? null,
        active:           d.active ?? true,
      });
      const groupMeta = await loadGroupMeta(connection, group.id);
      const groupName = groupMeta?.name ?? group.name;

      const newId = crypto.randomUUID();
      const openingStock = Number(d.inventory_quantity ?? 0);

      await connection.query(
        `INSERT INTO products
           (id, product_group_id, name, package_size, price, unit_cost, description, image_url,
            featured, tag, inventory_quantity, low_stock_threshold, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          newId, group.id, groupName, d.package_size, d.price, d.unit_cost ?? 0,
          groupMeta?.description ?? d.description ?? null,
          groupMeta?.image_url ?? d.image_url ?? null,
          groupMeta?.featured ?? d.featured ?? false,
          groupMeta?.tag ?? d.tag ?? null,
          d.low_stock_threshold ?? 10,
          d.active ?? true,
        ]
      );

      if (openingStock > 0) {
        await recordMovement(
          {
            productId:     newId,
            type:          "initial_stock",
            changeAmount:  openingStock,
            performedBy:   req.user!.id,
            referenceType: "manual",
            reason:        "Initial stock on product creation",
            allowInactive: !(d.active ?? true),
          },
          connection
        );
      }

      await syncGroupAfterVariantChange(connection, group.id);

      const [newRows] = await connection.query(
        `SELECT p.id, p.product_group_id, g.name AS group_name,
                p.name, p.package_size, p.price, p.inventory_quantity
         FROM products p
         LEFT JOIN product_groups g ON g.id = p.product_group_id
         WHERE p.id = ?`,
        [newId]
      ) as [any[], any];

      await connection.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, old_values, new_values)
         VALUES ('products', ?, 'INSERT', NULL, ?)`,
        [newId, req.user!.id, JSON.stringify({ name: d.name, price: d.price, unit_cost: d.unit_cost ?? 0, featured: d.featured })]
      ).catch(() => {});

      await connection.commit();
      clearApiCache();

      log.info("Product created", { productId: newId, name: d.name });
      res.status(201).json({ success: true, data: newRows[0] });
    } catch (err: any) {
      await connection.rollback();
      if (err instanceof ProductGroupError) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ success: false, error: "Duplicate entry." });
        return;
      }
      log.error("Failed to create product", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      connection.release();
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
    const connection = await pool.getConnection();

    try {
      const fields  = req.body as Record<string, unknown>;
      const productId = String(req.params.id);

      await connection.beginTransaction();

      const [existingRows] = await connection.query(
        `SELECT id, product_group_id, name, image_url, package_size, price, unit_cost, featured, tag, active, inventory_quantity, low_stock_threshold
         FROM products WHERE id = ?`,
        [productId]
      ) as [any[], any];

      const existing = existingRows[0];
      if (!existing) {
        await connection.rollback();
        res.status(404).json({ success: false, error: "Product not found" });
        return;
      }

      const mergedName = fields.name !== undefined ? (fields.name as string) : existing.name;
      const mergedImage = fields.image_url !== undefined ? (fields.image_url as string) : existing.image_url;
      const mergedSize = fields.package_size !== undefined ? (fields.package_size as string) : existing.package_size;
      const validationError = validateProductData(mergedName, mergedImage);
      if (validationError) {
        await connection.rollback();
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      const isActive = mergedActive(fields.active, existing.active);

      // ── Resolve the parent group ────────────────────────────────
      const oldGroupId: string | null = existing.product_group_id ?? null;
      let targetGroupId: string | null = oldGroupId;
      let targetGroupName: string | null = null;
      const movingGroup = fields.product_group_id !== undefined;

      if (movingGroup) {
        const group = await ensureProductGroup(connection, {
          product_group_id: fields.product_group_id as string,
          name:             mergedName,
        });
        targetGroupId = group.id;
        targetGroupName = group.name;

        if (fields.name !== undefined && mergedName.toLowerCase() !== group.name.toLowerCase()) {
          await connection.rollback();
          res.status(400).json({
            success: false,
            error: "A variant must use its group name. Rename the group instead of the individual variant.",
          });
          return;
        }
      } else if (targetGroupId) {
        const groupMeta = await loadGroupMeta(connection, targetGroupId);
        targetGroupName = groupMeta?.name ?? null;
      }

      const finalName = targetGroupName ?? mergedName;

      if (isActive && await isDuplicate(
        (sql, params) => connection.query(sql, params) as any,
        finalName,
        mergedSize,
        productId
      )) {
        await connection.rollback();
        res.status(409).json({ success: false, error: "Active product with this name and size already exists." });
        return;
      }

      // ── Rename the parent (and all its variants) when the name changes ──
      let groupRenamed = false;
      if (!movingGroup && targetGroupId && fields.name !== undefined && mergedName !== existing.name) {
        await renameProductGroup(connection, targetGroupId, mergedName);
        groupRenamed = true;
      }

      // ── Update the variant row ──────────────────────────────────
      const allowed = [
        "package_size", "price", "unit_cost", "description",
        "image_url", "featured", "tag", "active", "low_stock_threshold",
      ];

      const updates: string[] = [];
      const values:  unknown[] = [];

      for (const field of allowed) {
        if (fields[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(fields[field]);
        }
      }

      if (movingGroup) {
        updates.push("product_group_id = ?", "name = ?");
        values.push(targetGroupId, targetGroupName);
      } else if (!targetGroupId && fields.name !== undefined) {
        updates.push("name = ?");
        values.push(mergedName);
      }

      let changed = updates.length > 0 || groupRenamed;

      if (updates.length > 0) {
        values.push(productId);
        await connection.query(
          `UPDATE products SET ${updates.join(", ")}, updated_at = NOW()
           WHERE id = ?`,
          values
        );
      }

      // ── Parent presentation fields ──────────────────────────────
      if (targetGroupId) {
        const groupUpdates: string[] = [];
        const groupValues:  unknown[] = [];
        for (const field of ["description", "image_url", "featured", "tag"]) {
          if (fields[field] !== undefined) {
            groupUpdates.push(`${field} = ?`);
            groupValues.push(fields[field]);
          }
        }
        if (groupUpdates.length > 0) {
          groupValues.push(targetGroupId);
          await connection.query(
            `UPDATE product_groups SET ${groupUpdates.join(", ")}, updated_at = NOW()
             WHERE id = ?`,
            groupValues
          );
        }
      }

      // ── Inventory edits go through the ledger ───────────────────
      if (fields.inventory_quantity !== undefined) {
        const requestedQty = Number(fields.inventory_quantity);
        const delta = requestedQty - Number(existing.inventory_quantity);

        if (delta !== 0) {
          await recordMovement(
            {
              productId,
              type:          "adjustment",
              changeAmount:  delta,
              performedBy:   req.user!.id,
              referenceType: "manual",
              reason:        "Inventory updated from product edit",
              allowInactive: !isActive,
            },
            connection
          );
          changed = true;
        }
      }

      if (!changed) {
        await connection.rollback();
        res.status(400).json({ success: false, error: "No valid fields to update" });
        return;
      }

      // A group is active while at least one variant is active.
      if (targetGroupId) await syncGroupAfterVariantChange(connection, targetGroupId);
      if (oldGroupId && oldGroupId !== targetGroupId) {
        await syncGroupAfterVariantChange(connection, oldGroupId);
      }

      await connection.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, old_values, new_values)
         VALUES ('products', ?, ?, 'UPDATE', ?, ?)`,
        [productId, req.user!.id, JSON.stringify(existingRows[0]), JSON.stringify(fields)]
      ).catch(() => {});

      await connection.commit();
      clearApiCache();

      log.info("Product updated", { productId });
      res.json({ success: true, data: { message: "Product updated." } });
    } catch (err: any) {
      await connection.rollback();
      if (err instanceof ProductGroupError) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ success: false, error: "Duplicate entry." });
        return;
      }
      log.error("Failed to update product", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      connection.release();
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
    const connection = await pool.getConnection();

    try {
      const productId = String(req.params.id);

      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT product_group_id FROM products WHERE id = ?`,
        [productId]
      ) as [any[], any];

      if (!rows[0]) {
        await connection.rollback();
        res.status(404).json({ success: false, error: "Product not found" });
        return;
      }

      await connection.query(
        `UPDATE products SET active = false, updated_at = NOW() WHERE id = ?`,
        [productId]
      );

      const groupId: string | null = rows[0].product_group_id ?? null;
      if (groupId) await syncGroupAfterVariantChange(connection, groupId);

      await connection.commit();

      clearApiCache();
      log.info("Product archived", { productId });
      res.json({ success: true, data: { message: "Product archived." } });
    } catch (err) {
      await connection.rollback();
      log.error("Failed to archive product", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      connection.release();
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
    const productId = String(req.params.id);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // recordMovement owns the stock write: it locks the row, updates
      // products + stock_snapshots, writes the ledger row, and fires the
      // low-stock alert.
      const movement = await recordMovement(
        {
          productId,
          type:          "adjustment",
          changeAmount:  change_amount,
          performedBy:   req.user!.id,
          referenceType: "manual",
          reason,
        },
        connection
      );

      await connection.commit();
      clearApiCache();

      log.info("Stock adjusted", {
        productId,
        change_amount,
        newQty: movement.newQuantity,
        reason,
      });

      res.json({
        success: true,
        data: {
          new_quantity:    movement.newQuantity,
          product_name:    movement.productName,
          below_threshold: movement.belowThreshold,
        },
      });
    } catch (err: any) {
      await connection.rollback();

      if (err instanceof Error && err.message.includes("Insufficient stock")) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes("not found")) {
        res.status(404).json({ success: false, error: "Product not found" });
        return;
      }

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
}).refine(data => data.products.every(p => !p.tag || ALLOWED_TAGS.includes(p.tag)), {
  message: "Invalid tag in bulk products",
  path: ["products"],
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
        const validationError = validateProductData(product.name, product.image_url);
        if (validationError) {
          await connection.rollback();
          res.status(400).json({ success: false, error: validationError });
          return;
        }
        
        if (await isDuplicate((sql, params) => connection.query(sql, params) as any, product.name, product.package_size)) {
          await connection.rollback();
          res.status(409).json({ success: false, error: "Active product with this name and size already exists." });
          return;
        }

        const group = await ensureProductGroup(connection, {
          product_group_id: product.product_group_id,
          name:             product.name,
          description:      product.description ?? null,
          image_url:        product.image_url ?? null,
          featured:         product.featured ?? false,
          tag:              product.tag ?? null,
          active:           product.active ?? true,
        });
        const groupMeta = await loadGroupMeta(connection, group.id);
        const groupName = groupMeta?.name ?? group.name;

        const id = crypto.randomUUID();
        const openingStock = Number(product.inventory_quantity ?? 0);

        await connection.query(
          `INSERT INTO products
             (id, product_group_id, name, package_size, price, unit_cost, inventory_quantity,
              low_stock_threshold, active, image_url, description,
              tag, featured)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            group.id,
            groupName,
            product.package_size,
            product.price,
            product.unit_cost ?? 0,
            product.inventory_quantity ?? 0,
            product.low_stock_threshold ?? 10,
            product.active ?? true,

            groupMeta?.image_url ?? product.image_url ?? null,
            groupMeta?.description ?? product.description ?? null,
            groupMeta?.tag ?? product.tag ?? null,
            groupMeta?.featured ?? product.featured ?? false,
          ]
        );

        if (openingStock > 0) {
          await recordMovement(
            {
              productId:     id,
              type:          "initial_stock",
              changeAmount:  openingStock,
              performedBy:   req.user!.id,
              referenceType: "manual",
              reason:        "Initial stock on bulk product creation",
              allowInactive: !(product.active ?? true),
            },
            connection
          );
        }

        await syncGroupAfterVariantChange(connection, group.id);
        created.push({ id, name: groupName, package_size: product.package_size, product_group_id: group.id });
      }

      await connection.commit();
      clearApiCache();
      log.info("Bulk product creation", { count: created.length });
      res.status(201).json({
        success: true,
        data: { created, count: created.length },
      });
    } catch (err: any) {
      await connection.rollback();
      if (err.code === "ER_DUP_ENTRY") {
        res.status(409).json({ success: false, error: "Duplicate entry in bulk." });
        return;
      }
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