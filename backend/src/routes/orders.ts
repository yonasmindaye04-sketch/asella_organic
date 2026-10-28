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
import { recordMovement } from "../lib/inventory.js";
import { recordCustomerActivity, activityTypeForStatus } from "../lib/customerActivity.js";
import { enqueueSms } from "../lib/smsQueue.js";
import { formatOrderStatus, isNotifiableOrderStatus } from "../lib/smsTemplates.js";
import type { OrderStatus } from "../types/index.js";
import {
  CreateOrderSchema,
  UpdateStatusSchema,
  UpdateItemsSchema,
} from "../schemas/index.js";
import {
  sendOrderToAdmin,
  sendAdminOrderAlert,
  sendToDeliveryGroup,
  sendSimpleMessage,
  sendTelegramToCustomer,
} from "../lib/telegram.js";
import { mirrorToSheets, mirrorOrderStatusToSheets, mirrorOrderDeletionToSheets } from "../lib/sheets.js";
import { sanitizeObject, randomId }   from "../lib/security.js";
import { createLogger }               from "../lib/logger.js";
import { deductOrderStock, restoreOrderStock }           from "../lib/inventory.js";
import { resolveOrderItems, OrderItemResolutionError }  from "../lib/orderItems.js";
import { orderRateLimit } from "../middleware/rateLimit.js";
import jwt from "jsonwebtoken";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Customer in-app notification helper
//
// The Telegram Mini App bell reads from customer_notifications. This resolves
// the recipient from the order's own verified chat id where possible, so a
// customer whose checkout phone number differs from the number staff read off
// the order still gets their updates. Failures are swallowed: a notification
// must never fail an order update.
// ─────────────────────────────────────────────────────────────────────────────
async function notifyCustomerOfStatusChange(params: {
  orderId: string;
  phone: string;
  status: string;
  customerName: string;
  chatIdHint: number | null;
}): Promise<void> {
  try {
    let chatId = params.chatIdHint;

    if (!chatId) {
      const [rows] = await pool.query(
        `SELECT telegram_chat_id FROM customers WHERE phone = ? AND telegram_chat_id IS NOT NULL LIMIT 1`,
        [params.phone.replace(/\s+/g, "")]
      ) as [any[], any];
      chatId = rows[0]?.telegram_chat_id ? Number(rows[0].telegram_chat_id) : null;
    }

    if (!chatId) return;

    await pool.query(
      `INSERT INTO customer_notifications (chat_id, order_id, type, title, body)
       VALUES (?, ?, 'order_update', ?, ?)`,
      [
        chatId,
        params.orderId,
        `Order ${params.status}`,
        `Hi ${params.customerName}, your order ${params.orderId} is now ${params.status}.`,
      ]
    );
  } catch (err: any) {
    console.warn(`[orders] Failed to record customer notification: ${err?.message || err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS order-status notification
//
// Runs alongside the Telegram notification above, never inside the order
// transaction. Both are fire-and-forget for the same reason: a failed
// notification must never fail an order update.
//
// Two suppression rules keep this from becoming spam:
//   - Only Confirmed / In Transit / Delivered / Cancelled notify. Pending
//     is dropped (the customer just placed it) and Processing always
//     follows Confirmed, so texting both is noise.
//   - A cooldown plus a per-order lifetime cap, because staff flipping a
//     status back and forth would otherwise text the customer repeatedly.
// ─────────────────────────────────────────────────────────────────────────────
async function notifyCustomerBySms(params: {
  orderId: string;
  phone: string;
  status: string;
  customerName: string;
}): Promise<void> {
  try {
    if (!isNotifiableOrderStatus(params.status)) return;

    const [customerRows] = await pool.query(
      `SELECT id FROM customers WHERE phone = ? LIMIT 1`,
      [params.phone.replace(/\s+/g, "")]
    ) as [any[], any];
    const customerId: string | null = customerRows[0]?.id ?? null;

    // Cooldown: the same status for the same order inside the window is
    // already on its way; a repeat is churn, not news.
    const cooldownMinutes = Number(process.env.SMS_STATUS_COOLDOWN_MINUTES ?? 120);
    if (cooldownMinutes > 0) {
      const [recent] = await pool.query(
        `SELECT id FROM sms_messages
          WHERE order_id = ?
            AND status IN ('queued','sending','submitted')
            AND error_message LIKE 'status:%'
            AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
          LIMIT 1`,
        [params.orderId, cooldownMinutes]
      ) as [any[], any];
      if (recent.length > 0) return;
    }

    // Lifetime cap per order.
    const maxPerOrder = Number(process.env.SMS_MAX_PER_ORDER ?? 4);
    const [counted] = await pool.query(
      `SELECT COUNT(*) AS n FROM sms_messages
        WHERE order_id = ? AND status IN ('queued','sending','submitted')`,
      [params.orderId]
    ) as [any[], any];
    if (Number(counted[0]?.n ?? 0) >= maxPerOrder) return;

    const body = formatOrderStatus(params.status as OrderStatus, {
      orderId: params.orderId,
      name: params.customerName,
    });

    await enqueueSms({
      category: "transactional",
      to: params.phone,
      body,
      customerId,
      customerName: params.customerName,
      orderId: params.orderId,
    });
  } catch (err: any) {
    console.warn(`[orders] Failed to queue SMS notification: ${err?.message || err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders  — create (public, no auth required)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", orderRateLimit, async (req: Request, res: Response): Promise<void> => {
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

  const { referral_code, items: itemInputs, ...fields } = parsed.data;
  const total   = itemInputs.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomId(4)}`;

  let staffUserId = null;
  const token = req.cookies?.access_token || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET) as any;
      staffUserId = payload.id;
    } catch {
      // Ignore token errors for public endpoint
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Resolve every line against the catalog before writing anything.
    // A supplied product_id wins; legacy name/size input is still accepted.
    const items = (await resolveOrderItems(connection, itemInputs)).map((item) => ({
      name:         item.name,
      package_size: item.packageSize,
      quantity:     item.quantity,
      unit_price:   item.unitPrice,
      product_id:   item.productId,
      unit_cost:    item.unitCost,
    }));

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
        `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price, unit_cost, product_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(), orderId, item.name, item.package_size,
          item.quantity, item.unit_price, item.unit_cost, item.product_id,
        ]
      );
    }

    // ── Referral attribution ──────────────────────────────────────────
    //
    // Attribution is claimed on a customer's FIRST order only. Previously
    // every subsequent order carrying a code re-pointed the customer at a
    // different affiliate, which silently transferred ownership of that
    // customer's whole order history between affiliates.
    //
    // No commission is created here. Crediting happens exclusively in the
    // trigger trg_order_delivered_commission when the order is delivered,
    // so an order cannot be paid twice and cancelled orders are never
    // credited at all.
    if (referral_code) {
      const normalizedCode = referral_code.trim().toUpperCase();

      const [affiliates] = await connection.query(
        `SELECT ap.id
         FROM   affiliate_profiles ap
         LEFT   JOIN staff_users u ON u.id = ap.user_id
         WHERE  ap.referral_code = ?
           AND  ap.is_active = true
           AND  ap.deleted_at IS NULL
           AND  (ap.user_id IS NULL OR u.active = true)`,
        [normalizedCode]
      ) as [any[], any];
      const affiliate = affiliates[0];
      if (affiliate) {
        // Only claim an unattributed customer. An existing attribution is
        // left alone so history cannot be reassigned after the fact.
        await connection.query(
          `UPDATE customers
           SET referred_by_affiliate_id = ?,
               referral_code_used       = ?,
               referred_at              = NOW()
           WHERE id = ?
             AND referred_by_affiliate_id IS NULL`,
          [affiliate.id, normalizedCode, customerId]
        );
      }
    }

    await connection.commit();

    // ── Stock alert for out-of-stock / low-stock items ─────────────
    void (async () => {
      try {
        const alertItems: string[] = [];
        for (const item of items) {
          const [rows] = item.product_id
            ? await pool.query(
                `SELECT name, package_size, inventory_quantity, low_stock_threshold
                 FROM products WHERE id = ? AND active = TRUE LIMIT 1`,
                [item.product_id]
              ) as [any[], any]
            : await pool.query(
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
      } catch { /* non-blocking */ }
    })();

    const isFranchise = (fields.notes as string | undefined)?.includes("Franchise Type:");
    const cityLower = (fields.city as string || "").toLowerCase();
    const isAddisAbaba = cityLower === "addis ababa";
    const isAbroad = cityLower === "abroad";

    if (isFranchise) {
      // Franchise/bulk orders always go to admin (existing behaviour)
      void sendOrderToAdmin({ id: orderId, ...fields, total, items, message_type: "franchise" });
    } else if (isAbroad) {
      // Abroad orders: full details to admin with a clear label
      void sendAdminOrderAlert({ id: orderId, ...fields, total, items }, "Abroad Order ");
    } else if (isAddisAbaba && fields.order_type === "delivery") {
      // Standard Addis Ababa delivery: route to the delivery group (unchanged)
      void sendToDeliveryGroup({ id: orderId, ...fields, total, items });
    } else if (!isAddisAbaba) {
      // Other regions (pickup OR delivery outside Addis): notify admin directly
      void sendAdminOrderAlert(
        { id: orderId, ...fields, total, items },
        "Other Region Order "
      );
    }
    void mirrorToSheets({ id: orderId, ...fields, total, items });
    void sendTelegramToCustomer({
      phone:   fields.phone,
      message: `Hi ${fields.customer_name}, your order *${orderId}* has been received. Total: ETB ${total}.`,
    });

    // Customer timeline: the opening movement. Written after commit
    // because recordCustomerActivity uses the pool, not this
    // transaction's connection — writing it inside would deadlock the
    // two against each other.
    void recordCustomerActivity({
      customerId,
      orderId,
      activityType: "sale",
      title: `Order ${orderId} placed`,
      detail: `${fields.source} • ${fields.city}`,
      amount: total,
      statusTo: "Pending",
      actorId: staffUserId,
    });

    log.info("Order created", { orderId, total, source: fields.source });
    res.status(201).json({ success: true, data: { id: orderId, total } });
  } catch (err) {
    await connection.rollback();
    if (err instanceof OrderItemResolutionError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
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
      `SELECT o.id, o.customer_name, o.phone, o.status, o.total, o.city, o.location,
              o.order_type, o.notes, o.created_at, o.updated_at, o.delivery_date,
              o.created_by_staff_id,
              su.full_name AS created_by_staff_name
       FROM orders o
       LEFT JOIN staff_users su ON su.id = o.created_by_staff_id
       WHERE o.id = ? AND o.deleted_at IS NULL
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
    const log = createLogger(req);
    log.error("Error in public order tracking", err);
    res.status(500).json({ success: false, error: "Internal server error. Please try again." });
  }
});

router.get("/", authenticate,
  // Roles only. The list projects `o.*`, so without a role guard any
  // authenticated principal could dump the whole customer book — name, phone,
  // address, notes — by paging through it. Affiliates are excluded: they
  // have their own scoped portal endpoints.
  authorise("admin", "manager", "employee", "delivery", "call_center", "store_manager"),
  async (req: Request, res: Response) => {
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

    // Call center agents can only see orders they created themselves.
    if (req.user?.role === "call_center") {
      conditions.push("o.created_by_staff_id = ?");
      values.push(req.user.id);
    }

    // Store managers can only see orders they created themselves.
    if (req.user?.role === "store_manager") {
      conditions.push("o.created_by_staff_id = ?");
      values.push(req.user.id);
    }

    const where   = `WHERE ${conditions.join(" AND ")}`;
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM orders o ${where}`, values
    ) as [any[], any];
    const total = parseInt(countRows[0].count as string, 10);

    const [data] = await pool.query(
      `SELECT o.*, su.full_name AS created_by_staff_name
       FROM orders o
       LEFT JOIN staff_users su ON su.id = o.created_by_staff_id
       ${where}
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
  // Roles only. `authenticate` alone was an IDOR: an affiliate is a real
  // staff_users session, so any partner could read any order in the system —
  // this returns `o.*`, which includes customer name, phone and address —
  // simply by iterating the order id. The portal has its own scoped endpoints
  // for what an affiliate is allowed to see.
  authorise("admin", "manager", "employee", "delivery", "call_center", "store_manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [orders] = await pool.query(
        `SELECT o.*, su.full_name AS created_by_staff_name
         FROM orders o
         LEFT JOIN staff_users su ON su.id = o.created_by_staff_id
         WHERE o.id = ? AND o.deleted_at IS NULL`,
        [req.params.id]
      ) as [any[], any];

      const order = orders[0];
      if (!order) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      // call_center agents can only read orders they created
      if (req.user?.role === "call_center" && order.created_by_staff_id !== req.user.id) {
        res.status(403).json({ success: false, error: "Forbidden" });
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
  // Roles only, and deliberately not `delivery`: this transition is the one
  // that moves money and stock. Setting status='Delivered' fires
  // trg_order_delivered_commission, which credits a real affiliate
  // commission, and deducts inventory. Without a role guard any
  // authenticated principal could mint commissions by driving orders to
  // Delivered, then flip them to Cancelled to reverse it again.
  authorise("admin", "manager", "employee"),
  validate(UpdateStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const { status, note } = req.body as { status: string; note?: string };
    const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!orderId) {
      res.status(400).json({ success: false, error: "Order ID is required" });
      return;
    }

    // customer_id and telegram_chat_id are both read below — the
    // telegram_chat_id lookup was silently always null because the
    // column was never selected here.
    const [currentRows] = await pool.query(
      `SELECT status, phone, customer_name, customer_id, telegram_chat_id, total
       FROM orders WHERE id = ? AND deleted_at IS NULL`,
      [orderId]
    ) as [any[], any];

    const current = currentRows[0];
    if (!current) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }
//this is the part where we check if the status is being changed to "Delivered" and if the current status is not "Delivered". 
// If so, we check the inventory for each item in the order to ensure there is sufficient stock. If any item has insufficient stock, 
// we return a 400 error with a message indicating which item is out of stock. If all items have sufficient stock, we proceed to deduct the stock for the order. 
// If there is an error during stock deduction, we return a 400 error with a message indicating that stock deduction failed.
    let stockWarnings: string[] = [];

    if (status === "Delivered" && current.status !== "Delivered") {
      const [items] = await pool.query(
        `SELECT oi.id, oi.item_name, oi.package_size, oi.quantity,
                oi.product_id, p.id AS resolved_id, p.active AS product_active,
                p.inventory_quantity
         FROM   order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE  oi.order_id = ?`,
        [orderId]
      ) as [any[], any];

      for (const item of items) {
        if (!item.product_id) continue;          // reported by deductOrderStock
        if (!item.resolved_id) {
          stockWarnings.push(
            `${item.item_name} (${item.package_size}) x${item.quantity}: product no longer exists`
          );
          continue;
        }
        if (!item.product_active) {
          stockWarnings.push(
            `${item.item_name} (${item.package_size}) x${item.quantity}: product is inactive`
          );
          continue;
        }
        if (item.inventory_quantity !== null && item.inventory_quantity < item.quantity) {
          res.status(400).json({
            success: false,
            error:   `Insufficient stock for ${item.item_name} (${item.package_size}). Available: ${item.inventory_quantity}, needed: ${item.quantity}`,
          });
          return;
        }
      }

      // Deduct stock now that the check passed. The function uses
      // order_items.product_id and reports anything it had to skip.
      try {
        const stockResult = await deductOrderStock(orderId, (req as any).user?.id ?? null);
        stockWarnings = [
          ...stockWarnings,
          ...stockResult.skipped.map(
            (item) => `${item.itemName} (${item.packageSize}) x${item.quantity}: ${item.reason}`
          ),
        ];
      } catch (stockErr: any) {
        res.status(400).json({
          success: false,
          error: `Stock deduction failed: ${stockErr.message}`,
        });
        return;
      }
    } else if (
      (status === "Cancelled" || status === "Issue" || status === "Returned") &&
      current.status === "Delivered"
    ) {
      // A "Returned" order comes back as Delivered stock, so it needs the
      // same restoration as a cancellation. The commission reversal trigger
      // treats all three void statuses identically.
      try {
        const stockResult = await restoreOrderStock(orderId, (req as any).user?.id ?? null);
        stockWarnings = stockResult.skipped.map(
          (item) => `${item.itemName} (${item.packageSize}) x${item.quantity}: ${item.reason}`
        );
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

    void mirrorOrderStatusToSheets({
      orderId, oldStatus: current.status as string | null,
      newStatus: status, changedBy: (req as any).user?.username ?? 'system',
      note: note ?? null,
    });

    void sendTelegramToCustomer({
      phone:   current.phone as string,
      message: `Hi ${current.customer_name}, your order *${orderId}* is now *${status}*.`,
    });

    // In-app notification so the bell in the Mini App updates too. Resolved
    // from the order's own verified chat id, falling back to the customer
    // record for orders placed before that column existed.
    void notifyCustomerOfStatusChange({
      orderId,
      phone: current.phone as string,
      status,
      customerName: current.customer_name as string,
      chatIdHint: (current.telegram_chat_id as number | null) ?? null,
    });

    // SMS for customers without Telegram. Same fire-and-forget contract:
    // a send failure must never fail the status change.
    void notifyCustomerBySms({
      orderId,
      phone: current.phone as string,
      status,
      customerName: current.customer_name as string,
    });

    // Customer timeline: the status change itself. Returns and
    // cancellations are tagged as their own movement types so the
    // timeline can be filtered down to "what went wrong".
    const activityType = activityTypeForStatus(status, current.status as string | null);
    if (activityType) {
      const isVoid = activityType === "return" || activityType === "cancellation";
      void recordCustomerActivity({
        customerId: (current.customer_id as string | null) ?? null,
        phone: current.phone as string,
        orderId,
        activityType,
        title: isVoid
          ? `Order ${orderId} ${status.toLowerCase()}`
          : `Order ${orderId}: ${status}`,
        detail: note ?? null,
        // Voiding an order reverses revenue, so the amount is signed
        // negative; every other transition leaves the value untouched.
        amount: isVoid ? -Number(current.total ?? 0) : null,
        statusFrom: current.status as string | null,
        statusTo: status,
        actorId: (req as any).user?.id ?? null,
        actorName: (req as any).user?.username ?? "system",
      });
    }

    if (stockWarnings.length > 0) {
      log.warn("Order status changed with stock warnings", { orderId, status, stockWarnings });
    }

    log.info("Order status updated", { orderId, status });
    res.json({
      success: true,
      data: {
        id: orderId,
        status,
        ...(stockWarnings.length > 0 ? { stock_warnings: stockWarnings } : {}),
      },
    });
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
    const { items: itemInputs } = req.body as {
      items: Array<{
        product_id?: string;
        name: string;
        package_size: string;
        quantity: number;
        unit_price: number;
      }>;
    };
    const orderId = String(req.params.id);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 0. Fetch the order's current status — stock is only live once Delivered
      const [orderRows] = await connection.query(
        `SELECT status FROM orders WHERE id = ? AND deleted_at IS NULL`,
        [orderId]
      ) as [any[], any];

      if (!orderRows.length) {
        await connection.rollback();
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      const orderStatus: string = orderRows[0].status;
      // Only rebalance stock if the order is already Delivered.
      // For Pending / Transit / etc., deductOrderStock() will fire at
      // delivery time and will deduct whatever is currently in order_items.
      const isDelivered = orderStatus === "Delivered";

      // Resolve the replacement lines before deleting the old ones.
      const items = (await resolveOrderItems(connection, itemInputs)).map((item) => ({
        name:         item.name,
        package_size: item.packageSize,
        quantity:     item.quantity,
        unit_price:   item.unitPrice,
        product_id:   item.productId,
        unit_cost:    item.unitCost,
      }));

      // 1. Fetch old items for inventory rebalancing (only needed when Delivered)
      const [oldItemsRows] = await connection.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = ?`,
        [orderId]
      ) as [any[], any];

      await connection.query(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);

      // Map to hold net quantity changes per product_id
      const deltaMap = new Map<string, number>();

      if (isDelivered) {
        for (const row of oldItemsRows) {
          if (row.product_id) {
            deltaMap.set(row.product_id, (deltaMap.get(row.product_id) || 0) + row.quantity); // start with old qty (positive means we return to stock)
          }
        }
      }

      for (const item of items) {
        if (isDelivered && item.product_id) {
          deltaMap.set(item.product_id, (deltaMap.get(item.product_id) || 0) - item.quantity); // subtract new qty (negative means we deduct from stock)
        }

        await connection.query(
          `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price, unit_cost, product_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(), orderId, item.name, item.package_size,
            item.quantity, item.unit_price, item.unit_cost, item.product_id,
          ]
        );
      }

      // Rebalance inventory — only when the order is already Delivered
      if (isDelivered) {
        for (const [productId, delta] of deltaMap.entries()) {
          if (delta > 0) {
            // Returned to stock (quantity was reduced or item removed)
            await recordMovement({
              productId,
              type: 'return',
              changeAmount: delta,
              performedBy: (req as any).user?.id ?? 'system',
              referenceId: orderId,
              referenceType: 'order',
              reason: `Order ${orderId} edited: item quantity reduced or removed`
            }, connection);
          } else if (delta < 0) {
            // Additional deduction (quantity was increased or item added)
            await recordMovement({
              productId,
              type: 'sale',
              changeAmount: delta,
              performedBy: (req as any).user?.id ?? 'system',
              referenceId: orderId,
              referenceType: 'order',
              reason: `Order ${orderId} edited: item quantity increased or added`
            }, connection);
          }
        }
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
      log.info("Order items updated", { orderId, newTotal, stockRebalanced: isDelivered });
      res.json({ success: true, data: { id: orderId, total: newTotal } });
    } catch (err) {
      await connection.rollback();
      if (err instanceof OrderItemResolutionError) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
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

    void mirrorOrderDeletionToSheets({
      orderId: req.params.id as string,
      deletedBy: userId,
      ip,
      reason,
    });

    log.info("Order archived", { orderId: req.params.id });
    res.json({ success: true, data: { message: "Order archived." } });
  }
);

export default router;
