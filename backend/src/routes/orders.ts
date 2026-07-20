/**
 * src/routes/orders.ts
 * Asella Organic — Orders Routes (MySQL)
 *
 * Changes from v2:
 *   + GET /  — extended pagination filters: ?source, ?from, ?to added
 *              response shape now includes explicit `meta` block alongside `total`
 *   + Structured logger (createLogger) replaces console.error throughout
 *   + DELETE /:id — now requires 2FA (admin + 2FA)
 *   All existing MySQL logic, transactions, referral handling, Telegram
 *   notifications, Sheets mirroring, and Zod validation are unchanged.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool   from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { require2FA }   from "../middleware/2fa.js";
import { validate }     from "../middleware/validate.js";
import {
  CreateOrderSchema,
  UpdateStatusSchema,
  UpdateItemsSchema,
} from "../schemas/index.js";
import {
  sendOrderToAdmin,
  sendToDeliveryGroup,
  sendSimpleMessage,
  sendTelegramToCustomer,
} from "../lib/telegram.js";
import { mirrorToSheets }             from "../lib/sheets.js";
import { sanitizeObject, randomId }   from "../lib/security.js";
import { createLogger }               from "../lib/logger.js";
import { deductOrderStock, restoreOrderStock }           from "../lib/inventory.js";
import jwt from "jsonwebtoken";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders  — create (public, no auth required)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);

  const sanitized =
    typeof req.body === "object" && req.body !== null
      ? sanitizeObject(req.body as Record<string, unknown>)
      : req.body;

  const parsed = CreateOrderSchema.safeParse(sanitized);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error:   "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { referral_code, items, ...fields } = parsed.data;
  const total   = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomId(4)}`;

  let staffUserId = null;
  let staffUsername = null;
  const token = req.cookies?.access_token || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET) as any;
      staffUserId = payload.id;
      staffUsername = payload.username;
    } catch (e) {
      // Ignore token errors for public endpoint
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const tempCustomerId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO customers (id, phone, name, city, location, gender, age_group)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), city = VALUES(city)`,
      [
        tempCustomerId, fields.phone, fields.customer_name, fields.city,
        fields.location, fields.gender ?? null, fields.age_group ?? null,
      ]
    );

    const [custRows] = await connection.query(
      `SELECT id FROM customers WHERE phone = ?`, [fields.phone]
    ) as [any[], any];
    const customerId = custRows[0].id;

    await connection.query(
      `INSERT INTO orders
         (id, source, customer_name, phone, location, city, gender, age_group,
          order_type, status, total, notes, customer_id, delivery_date, payment_status, created_by_staff_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, 'Pending', ?)`,
      [
        orderId, fields.source, fields.customer_name, fields.phone,
        fields.location, fields.city, fields.gender ?? null,
        fields.age_group ?? null, fields.order_type, total,
        fields.notes ?? null, customerId, fields.delivery_date ?? null, staffUserId,
      ]
    );

    if (staffUserId) {
      await connection.query(
        `INSERT INTO audit_log (table_name, record_id, order_id, actor, action, new_values)
         VALUES ('orders', ?, ?, ?, 'ORDER_CREATED', ?)`,
        [orderId, orderId, staffUserId, JSON.stringify({ items_count: items.length, total })]
      );
    }

    for (const item of items) {
      await connection.query(
        `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), orderId, item.name, item.package_size, item.quantity, item.unit_price]
      );
    }

    if (referral_code) {
      const [affiliates] = await connection.query(
        `SELECT ap.id
         FROM   affiliate_profiles ap
         LEFT   JOIN staff_users u ON u.id = ap.user_id
         WHERE  ap.referral_code = ?
           AND  ap.is_active = true
           AND  (ap.user_id IS NULL OR u.active = true)`,
        [referral_code.trim().toUpperCase()]
      ) as [any[], any];
      const affiliate = affiliates[0];
      if (affiliate) {
        await connection.query(
          `UPDATE customers
           SET referred_by_affiliate_id = ?,
               referral_code_used       = ?,
               referred_at              = NOW()
           WHERE id = ?`,
          [affiliate.id, referral_code.trim().toUpperCase(), customerId]
        );

        const [configs] = await connection.query(
          `SELECT * FROM referral_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
        ) as [any[], any];
        const config = configs[0];

        if (config && total >= (config.min_order_amount || 0)) {
          let commissionAmount = 0;
          if (config.commission_type === 'percentage') {
             commissionAmount = total * (config.commission_value / 100);
             if (config.max_commission && commissionAmount > config.max_commission) {
                commissionAmount = config.max_commission;
             }
          } else {
             commissionAmount = config.commission_value;
          }

          if (commissionAmount > 0) {
            await connection.query(
              `INSERT INTO referral_commissions (id, affiliate_id, order_id, commission_amount, status)
               VALUES (?, ?, ?, ?, 'pending')`,
               [crypto.randomUUID(), affiliate.id, orderId, commissionAmount]
            );
          }
        }
      }
    }

    await connection.commit();

    // ── Stock alert for out-of-stock / low-stock items ─────────────
    void (async () => {
      try {
        const alertItems: string[] = [];
        for (const item of items) {
          const [rows] = await pool.query(
            `SELECT name, package_size, inventory_quantity, low_stock_threshold
             FROM products WHERE name = ? AND package_size = ? AND active = TRUE LIMIT 1`,
            [item.name, item.package_size]
          ) as [any[], any];
          if (!rows.length) continue;
          const p = rows[0];
          if (p.inventory_quantity === 0) {
            alertItems.push(`*OUT OF STOCK*: ${p.name} [${p.package_size}] (ordered ×${item.quantity})`);
          } else if (p.inventory_quantity <= p.low_stock_threshold) {
            alertItems.push(`*Low Stock*: ${p.name} [${p.package_size}] — ${p.inventory_quantity} left (ordered ×${item.quantity})`);
          }
        }
        if (alertItems.length && process.env.TELEGRAM_ADMIN_CHAT_ID) {
          await sendSimpleMessage(
            process.env.TELEGRAM_ADMIN_CHAT_ID,
            `*Stock Alert — New Order ${orderId}*\nCustomer: ${fields.customer_name}\n\n${alertItems.join("\n")}`
          );
        }
      } catch (_) { /* non-blocking */ }
    })();

    const isFranchise = (fields.notes as string | undefined)?.includes("Franchise Type:");
    if (isFranchise) {
      void sendOrderToAdmin({ id: orderId, ...fields, total, items, message_type: "franchise" });
    } else {
      void sendOrderToAdmin({ id: orderId, ...fields, total, items });
      if (fields.city?.toLowerCase().includes("addis")) {
        void sendToDeliveryGroup({ id: orderId, ...fields, total, items });
      }
    }
    void mirrorToSheets({ id: orderId, ...fields, total, items });
    void sendTelegramToCustomer({
      phone:   fields.phone,
      message: `Hi ${fields.customer_name}, your order *${orderId}* has been received. Total: ETB ${total}.`,
    });

    log.info("Order created", { orderId, total, source: fields.source });
    res.status(201).json({ success: true, data: { id: orderId, total } });
  } catch (err) {
    await connection.rollback();
    log.error("Failed to create order", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  — paginated list (authenticated)
// Query params: ?page ?limit ?status ?city ?search ?source ?from ?to
// ─────────────────────────────────────────────────────────────────────────────
router.get("/track/:id", async (req: Request, res: Response): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = rawId?.trim();

  if (!orderId) {
    res.status(400).json({ success: false, error: "Order ID is required" });
    return;
  }

  try {
    const [orders] = await pool.query(
      `SELECT id, customer_name, phone, status, total, city, location,
              order_type, notes, created_at, updated_at, delivery_date, created_by_staff_id
       FROM orders
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [orderId]
    ) as [any[], any];

    const order = orders[0];
    if (!order) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    const [items] = await pool.query(
      `SELECT item_name, package_size, quantity, unit_price
       FROM order_items
       WHERE order_id = ?
       ORDER BY item_name ASC`,
      [orderId]
    ) as [any[], any];

    const [history] = await pool.query(
      `SELECT old_status, new_status, note, changed_by, created_at AS timestamp
       FROM order_status_history
       WHERE order_id = ?
       ORDER BY created_at DESC`,
      [orderId]
    ) as [any[], any];

    res.json({
      success: true,
      data: {
        ...order,
        items,
        history,
      },
    });
  } catch (err) {
    console.error("[GET /orders/track/:id] Error:", err);
    res.status(500).json({ success: false, error: "Internal server error. Please try again." });
  }
});

router.get("/", authenticate, async (req: Request, res: Response) => {
  const log = createLogger(req);
  try {
    const {
      status, city, search, source,
      from, to,
      page  = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const conditions: string[] = ["o.deleted_at IS NULL"];
    const values:     unknown[] = [];

    if (status) { conditions.push("o.status = ?");       values.push(status); }
    if (city)   { conditions.push("o.city LIKE ?");      values.push(`%${city}%`); }
    if (source) { conditions.push("o.source = ?");       values.push(source); }
    if (from)   { conditions.push("o.created_at >= ?");  values.push(from); }
    if (to)     { conditions.push("o.created_at <= ?");  values.push(`${to} 23:59:59`); }
    if (search) {
      conditions.push("(o.customer_name LIKE ? OR o.phone LIKE ? OR o.id LIKE ?)");
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where   = `WHERE ${conditions.join(" AND ")}`;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM orders o ${where}`, values
    ) as [any[], any];
    const total = parseInt(countRows[0].count as string, 10);

    const [data] = await pool.query(
      `SELECT o.* FROM orders o ${where}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...values, limitNum, offset]
    ) as [any[], any];

    // Fetch items for the retrieved orders
    if (data.length > 0) {
      const orderIds = data.map(o => o.id);
      const [itemsData] = await pool.query(
        `SELECT * FROM order_items WHERE order_id IN (?)`,
        [orderIds]
      ) as [any[], any];
      
      const itemsMap = itemsData.reduce((acc, item) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
      }, {});

      data.forEach(o => {
        o.items = itemsMap[o.id] || [];
      });
    }

    log.info("Orders listed", { pageNum, limitNum, total, status, source });

    res.json({
      success: true,
      data,
      total,
      page:    pageNum,
      limit:   limitNum,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    log.error("Failed to list orders", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id  — single order with items, history, payments
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [orders] = await pool.query(
        `SELECT o.* FROM orders o WHERE o.id = ? AND o.deleted_at IS NULL`,
        [req.params.id]
      ) as [any[], any];

      const order = orders[0];
      if (!order) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      const [items]    = await pool.query(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]) as [any[], any];
      const [history]  = await pool.query(`SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC`, [req.params.id]) as [any[], any];
      const [payments] = await pool.query(`SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC`, [req.params.id]) as [any[], any];

      res.json({ success: true, data: { ...order, items, history, payments } });
    } catch (err) {
      log.error("Failed to fetch order", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/status
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id/status",
  authenticate,
  validate(UpdateStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const { status, note } = req.body as { status: string; note?: string };
    const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required" });
      return;
    }

    const [currentRows] = await pool.query(
      `SELECT status, phone, customer_name FROM orders WHERE id = ? AND deleted_at IS NULL`,
      [orderId]
    ) as [any[], any];

    const current = currentRows[0];
    if (!current) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    if (status === "Delivered" && current.status !== "Delivered") {
      const [items] = await pool.query(
        `SELECT oi.item_name, oi.package_size, oi.quantity, p.inventory_quantity
         FROM   order_items oi
         LEFT JOIN products p
           ON  LOWER(oi.item_name) = LOWER(p.name)
           AND oi.package_size = p.package_size
         WHERE oi.order_id = ?`,
        [orderId]
      ) as [any[], any];

      for (const item of items) {
        if (item.inventory_quantity !== null && item.inventory_quantity < item.quantity) {
          res.status(400).json({
            success: false,
            error:   `Insufficient stock for ${item.item_name} (${item.package_size}). Available: ${item.inventory_quantity}, needed: ${item.quantity}`,
          });
          return;
        }
      }

      // Deduct stock now that the check passed
      try {
        await deductOrderStock(orderId, (req as any).user?.id ?? null);
      } catch (stockErr: any) {
        res.status(400).json({
          success: false,
          error: `Stock deduction failed: ${stockErr.message}`,
        });
        return;
      }
    } else if ((status === "Cancelled" || status === "Issue") && current.status === "Delivered") {
      try {
        await restoreOrderStock(orderId, (req as any).user?.id ?? null);
      } catch (stockErr: any) {
        res.status(400).json({
          success: false,
          error: `Stock restoration failed: ${stockErr.message}`,
        });
        return;
      }
    }

    await pool.query(
      `UPDATE orders SET status = ?, notes = IFNULL(?, notes), updated_at = NOW() WHERE id = ?`,
      [status, note, orderId]
    );

    // Record in order_status_history for timeline tracking
    await pool.query(
      `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [crypto.randomUUID(), orderId, current.status, status, (req as any).user?.username ?? 'system', note ?? null]
    );

    await pool.query(
      `INSERT INTO audit_log (table_name, record_id, order_id, actor, action, new_values)
       VALUES ('orders', ?, ?, ?, 'ORDER_STATUS_UPDATED', ?)`,
      [orderId, orderId, (req as any).user?.id ?? 'system', JSON.stringify({ status })]
    );

    void sendTelegramToCustomer({
      phone:   current.phone as string,
      message: `Hi ${current.customer_name}, your order *${orderId}* is now *${status}*.`,
    });

    log.info("Order status updated", { orderId, status });
    res.json({ success: true, data: { id: orderId, status } });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/items
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id/items",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateItemsSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const { items } = req.body as {
      items: Array<{ name: string; package_size: string; quantity: number; unit_price: number }>;
    };
    const orderId    = req.params.id;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.query(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);

      for (const item of items) {
        await connection.query(
          `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), orderId, item.name, item.package_size, item.quantity, item.unit_price]
        );
      }

      const newTotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      await connection.query(
        `UPDATE orders SET total = ?, updated_at = NOW() WHERE id = ?`, [newTotal, orderId]
      );

      await connection.query(
        `INSERT INTO audit_log (table_name, record_id, order_id, actor, action, new_values)
         VALUES ('order_items', ?, ?, ?, 'ORDER_MODIFIED_ITEMS', ?)`,
        [orderId, orderId, (req as any).user?.id ?? 'system', JSON.stringify({ items_count: items.length, newTotal })]
      );

      await connection.commit();
      log.info("Order items updated", { orderId, newTotal });
      res.json({ success: true, data: { id: orderId, total: newTotal } });
    } catch (err) {
      await connection.rollback();
      log.error("Failed to update order items", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      connection.release();
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/orders/:id  — soft-delete (admin + 2FA)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorise("admin"),
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    // Soft-delete with audit fields. The deleted_by is taken from
    // req.user.id (set by the auth middleware). deleted_at_ip is the
    // client's IP (respecting X-Forwarded-For if behind a proxy).
    // deleted_reason is optional — admins can pass it via the JSON
    // body to document WHY they deleted the order.
    const userId = (req as any).user?.id ?? null;
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string"
      ? (forwarded.split(",")[0] ?? "").trim()
      : req.socket.remoteAddress) || null;
    const reason = (req.body as any)?.reason ?? null;

    const [result] = await pool.query(
      `UPDATE orders
         SET deleted_at     = NOW(),
             deleted_at_ip  = ?,
             deleted_by     = ?,
             deleted_reason = ?,
             updated_at     = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [ip, userId, reason, req.params.id]
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    log.info("Order archived", { orderId: req.params.id });
    res.json({ success: true, data: { message: "Order archived." } });
  }
);

export default router;
