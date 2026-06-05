/**
 * PATCH FILE — backend/src/routes/orders.ts
 *
 * Changes (drop-in additions to your existing orders route file):
 *
 * 1. createOrder() — resolves each item's product_id at INSERT time
 *    so the trigger uses UUID join, not fragile name matching.
 *
 * 2. Unit price: reads price from the products table when unit_price
 *    is 0 or missing in the request body (fixes Bug #2).
 *
 * HOW TO APPLY:
 *   Replace the section in your createOrder handler that builds
 *   order_items INSERT values with the code below.
 *   The helper resolveProductId() can live at the top of the file.
 */
//
import pool from '../config/db.js';
import type { PoolConnection } from 'mysql2/promise';

// ─────────────────────────────────────────────────────────────────
// Helper: resolve product_id + authoritative unit_price for an item
// Called once per item at order-creation time.
// ─────────────────────────────────────────────────────────────────
export async function resolveOrderItem(
  conn: PoolConnection,
  itemName: string,
  packageSize: string,
  submittedUnitPrice: number
): Promise<{
  product_id: string | null;
  unit_price: number;
}> {
  const [rows] = await conn.query<any[]>(
    `SELECT id, price
     FROM   products
     WHERE  LOWER(name) = LOWER(?)
       AND  package_size = ?
       AND  active = TRUE
     LIMIT 1`,
    [itemName.trim(), packageSize.trim()]
  );

  const product = rows[0] ?? null;

  return {
    product_id: product?.id ?? null,
    // Use submitted price if non-zero; otherwise fall back to DB price.
    // This means staff CAN override price (discounts), but 0 is never
    // silently accepted.
    unit_price:
      submittedUnitPrice && submittedUnitPrice > 0
        ? submittedUnitPrice
        : product
        ? Number(product.price)
        : 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// Replace this block inside your createOrder POST handler:
//
//   BEFORE (broken — unit_price stays 0, no product_id):
//   ──────────────────────────────────────────────────────
//   for (const item of items) {
//     await conn.query(
//       `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price)
//        VALUES (UUID(), ?, ?, ?, ?, ?)`,
//       [orderId, item.name, item.package_size, item.quantity, item.unit_price ?? 0]
//     );
//   }
//
//   AFTER (fixed — resolves product_id + real price):
//   ──────────────────────────────────────────────────
//   for (const item of items) {
//     const { product_id, unit_price } = await resolveOrderItem(
//       conn,
//       item.name,
//       item.package_size,
//       item.unit_price ?? 0
//     );
//     await conn.query(
//       `INSERT INTO order_items
//          (id, order_id, item_name, package_size, quantity, unit_price, product_id)
//        VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
//       [orderId, item.name, item.package_size, item.quantity, unit_price, product_id]
//     );
//   }
//
//   Also update the total calculation to use the resolved price:
//   const total = items.reduce((sum, item, i) => {
//     return sum + resolvedItems[i].unit_price * item.quantity;
//   }, 0);
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// FULL corrected createOrder handler — paste this into your router
// ─────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from 'express';
import { authenticate as requireAuth } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const router = Router();

const OrderItemSchema = z.object({
  name:         z.string().min(1),
  package_size: z.string().min(1),
  quantity:     z.number().int().positive(),
  unit_price:   z.number().min(0).optional().default(0),
});

const CreateOrderSchema = z.object({
  customer_name:  z.string().min(2),
  phone:          z.string().min(7),
  city:           z.string().min(1),
  location:       z.string().optional().default(''),
  source:         z.string().optional().default('Sales_DB'),
  order_type:     z.string().optional().default('delivery'),
  referral_code:  z.string().optional(),
  notes:          z.string().optional(),
  gender:         z.string().optional(),
  age_group:      z.string().optional(),
  items:          z.array(OrderItemSchema).min(1, 'At least one item required'),
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'Validation failed',
      details: parsed.error.flatten(),
    });
  }

  const {
    customer_name, phone, city, location, source,
    order_type, referral_code, notes, gender, age_group, items,
  } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Resolve product IDs + real prices for every item ──────
    const resolvedItems = await Promise.all(
      items.map(item =>
        resolveOrderItem(conn, item.name, item.package_size, item.unit_price)
      )
    );

    // ── 2. Calculate total using resolved (non-zero) prices ───────
    const total = items.reduce(
      (sum, item, i) => sum + (resolvedItems[i]!.unit_price * item.quantity),
      0
    );

    // ── 3. Resolve referral code → affiliate_id (best-effort) ─────
    let affiliateId: string | null = null;
    if (referral_code) {
      const [affRows] = await conn.query<any[]>(
        `SELECT id FROM affiliate_profiles WHERE referral_code = ? AND is_active = TRUE LIMIT 1`,
        [referral_code.trim().toUpperCase()]
      );
      affiliateId = affRows[0]?.id ?? null;
    }

    // ── 4. Insert the order ───────────────────────────────────────
    const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;

    await conn.query(
      `INSERT INTO orders
         (id, customer_name, phone, city, location, source,
          order_type, total, status, affiliate_id, notes, gender, age_group)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
      [orderId, customer_name, phone, city, location, source,
       order_type, total, affiliateId, notes ?? null, gender ?? null, age_group ?? null]
    );

    // ── 5. Insert order_items WITH product_id + resolved price ────
    for (let i = 0; i < items.length; i++) {
      const item     = items[i]!;
      const resolved = resolvedItems[i]!;

      await conn.query(
        `INSERT INTO order_items
           (id, order_id, item_name, package_size, quantity, unit_price, product_id)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.name,
          item.package_size,
          item.quantity,
          resolved.unit_price,
          resolved.product_id,   // ← the key fix: UUID stored, not null
        ]
      );
    }

    // ── 6. Initial status history entry ──────────────────────────
    await conn.query(
      `INSERT INTO order_status_history (id, order_id, new_status, note, changed_by)
       VALUES (UUID(), ?, 'Pending', 'Order created', ?)`,
      [orderId, (req as any).user?.id ?? null]
    );

    await conn.commit();

    const [orderRows] = await conn.query<any[]>(
      `SELECT o.*, 
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'item_name',    oi.item_name,
                  'package_size', oi.package_size,
                  'quantity',     oi.quantity,
                  'unit_price',   oi.unit_price,
                  'product_id',   oi.product_id
                )
              ) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = ?
       GROUP BY o.id`,
      [orderId]
    );

    const order = orderRows[0];
    if (order?.items && typeof order.items === 'string') {
      order.items = JSON.parse(order.items);
    }

    return res.status(201).json({ data: order });
  } catch (err: any) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

export default router;
