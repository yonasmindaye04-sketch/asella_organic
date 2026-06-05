/**
 * src/lib/inventory.ts
 * Asella Organic — Inventory Core: recordMovement()
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL STOCK CHANGES.
 *
 * Every route that touches inventory (orders, stock adjustments,
 * PO receipt, returns) MUST call recordMovement() instead of
 * writing inline UPDATE queries.
 *
 * recordMovement():
 *   1. Validates the change won't produce negative stock (configurable)
 *   2. Atomically updates products.inventory_quantity
 *   3. Updates stock_snapshots (fast read model)
 *   4. Inserts an inventory_movements audit row
 *   5. Fires a Telegram low-stock alert if threshold crossed
 *
 * Usage example (order delivery):
 *   await recordMovement(conn, {
 *     productId:     "uuid",
 *     type:          "sale",
 *     changeAmount:  -3,           // negative = stock out
 *     performedBy:   req.user.id,
 *     referenceId:   orderId,
 *     referenceType: "order",
 *     reason:        `Order ${orderId} delivered`,
 *   });
 */

import pool from "../config/db.js";
import { sendLowStockAlert } from "./telegram.js";
import crypto from "crypto";
import type { PoolConnection } from "mysql2/promise";

// ─── Types ────────────────────────────────────────────────────────────────

export type MovementType =
  | "sale"
  | "purchase_received"
  | "adjustment"
  | "return"
  | "damage_loss"
  | "initial_stock";

export type ReferenceType =
  | "order"
  | "vendor_order"
  | "stock_request"
  | "manual";

export interface RecordMovementOptions {
  productId:      string;
  type:           MovementType;
  changeAmount:   number;          // positive = in, negative = out
  performedBy:    string | null;   // staff_user.id or null for system
  referenceId?:   string | null;   // order_id, vendor_order_id, etc.
  referenceType?: ReferenceType | null;
  reason:         string;
  notes?:         string | null;
  allowNegative?: boolean;         // default false — guard against oversell
}

export interface MovementResult {
  newQuantity:    number;
  previousQty:   number;
  belowThreshold: boolean;
  movementId:     string;
}

// ─── Core function ────────────────────────────────────────────────────────

/**
 * Record a stock movement.
 *
 * Pass an existing connection to use an outer transaction.
 * If no connection is passed, a new connection + transaction is opened.
 *
 * @throws Error if stock would go negative (unless allowNegative = true)
 * @throws Error if product not found
 */
export async function recordMovement(
  options: RecordMovementOptions,
  existingConn?: PoolConnection
): Promise<MovementResult> {
  const useOwnTransaction = !existingConn;
  const conn = existingConn ?? (await pool.getConnection());

  try {
    if (useOwnTransaction) await conn.beginTransaction();

    // ── 1. Lock the product row ──────────────────────────────────
    const [productRows] = await conn.query(
      `SELECT id, name, package_size, inventory_quantity, low_stock_threshold
       FROM   products
       WHERE  id = ? AND active = true
       FOR UPDATE`,
      [options.productId]
    ) as [any[], any];

    const product = productRows[0];
    if (!product) {
      throw new Error(`Product ${options.productId} not found or inactive.`);
    }

    const previousQty = product.inventory_quantity as number;
    const newQty      = previousQty + options.changeAmount;

    // ── 2. Guard against negative stock ─────────────────────────
    if (!options.allowNegative && newQty < 0) {
      throw new Error(
        `Insufficient stock for "${product.name}" (${product.package_size}). ` +
        `Current: ${previousQty}, requested change: ${options.changeAmount}.`
      );
    }

    const finalQty = Math.max(0, newQty);

    // ── 3. Update products.inventory_quantity ────────────────────
    await conn.query(
      `UPDATE products
       SET    inventory_quantity = ?,
              updated_at = NOW()
       WHERE  id = ?`,
      [finalQty, options.productId]
    );

    // ── 4. Update / insert stock snapshot (fast read model) ──────
    await conn.query(
      `INSERT INTO stock_snapshots (product_id, current_quantity, last_updated)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         current_quantity = VALUES(current_quantity),
         last_updated = NOW()`,
      [options.productId, finalQty]
    );

    // ── 5. Insert inventory_movement audit row ───────────────────
    const movementId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO inventory_movements
         (id, product_id, movement_type, change_amount, reason,
          performed_by, quantity_after, notes, reference_id, reference_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movementId,
        options.productId,
        options.type,
        options.changeAmount,
        options.reason,
        options.performedBy  ?? null,
        finalQty,
        options.notes        ?? null,
        options.referenceId  ?? null,
        options.referenceType ?? null,
      ]
    );

    if (useOwnTransaction) await conn.commit();

    const belowThreshold = finalQty <= product.low_stock_threshold;

    // ── 6. Fire low-stock Telegram alert (non-blocking) ─────────
    if (belowThreshold && options.changeAmount < 0) {
      void sendLowStockAlert({
        name:      product.name  as string,
        size:      product.package_size as string,
        current:   finalQty,
        threshold: product.low_stock_threshold as number,
      });
    }

    return {
      newQuantity:    finalQty,
      previousQty,
      belowThreshold,
      movementId,
    };
  } catch (err) {
    if (useOwnTransaction) await conn.rollback();
    throw err;
  } finally {
    if (useOwnTransaction) conn.release();
  }
}

// ─── Batch helper (used when delivering an entire order) ──────────────────

/**
 * Deduct stock for all items in an order in a single transaction.
 * Called by the orders route when status transitions to "Delivered".
 *
 * Returns an array of { productId, newQuantity, belowThreshold }
 * for each item successfully matched to a product.
 */
export async function deductOrderStock(
  orderId:     string,
  performedBy: string | null
): Promise<{ productId: string; newQuantity: number; belowThreshold: boolean }[]> {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Resolve product_id for each order item via name + package_size match
    const [items] = await conn.query(
      `SELECT oi.quantity, p.id AS product_id
       FROM   order_items oi
       JOIN   products p
         ON   LOWER(oi.item_name) = LOWER(p.name)
        AND   oi.package_size = p.package_size
       WHERE  oi.order_id = ?
         AND  p.active = true`,
      [orderId]
    ) as [any[], any];

    const results: { productId: string; newQuantity: number; belowThreshold: boolean }[] = [];

    for (const item of items) {
      const result = await recordMovement(
        {
          productId:     item.product_id as string,
          type:          "sale",
          changeAmount:  -(item.quantity as number),
          performedBy,
          referenceId:   orderId,
          referenceType: "order",
          reason:        `Order ${orderId} delivered`,
        },
        conn  // share the transaction
      );

      results.push({
        productId:     item.product_id,
        newQuantity:   result.newQuantity,
        belowThreshold: result.belowThreshold,
      });
    }

    await conn.commit();
    return results;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Restore stock for all items in an order in a single transaction.
 * Called by the orders route when status transitions FROM "Delivered" TO "Cancelled" or "Issue".
 */
export async function restoreOrderStock(
  orderId:     string,
  performedBy: string | null
): Promise<void> {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Resolve product_id for each order item
    const [items] = await conn.query(
      `SELECT oi.quantity, p.id AS product_id
       FROM   order_items oi
       JOIN   products p
         ON   LOWER(oi.item_name) = LOWER(p.name)
        AND   oi.package_size = p.package_size
       WHERE  oi.order_id = ?
         AND  p.active = true`,
      [orderId]
    ) as [any[], any];

    for (const item of items) {
      await recordMovement(
        {
          productId:     item.product_id as string,
          type:          "return",
          changeAmount:  item.quantity as number, // positive to restore
          performedBy,
          referenceId:   orderId,
          referenceType: "order",
          reason:        `Order ${orderId} cancelled/returned`,
        },
        conn  // share the transaction
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
