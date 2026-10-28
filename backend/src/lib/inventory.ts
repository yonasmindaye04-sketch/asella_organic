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
import { mirrorStockMovementToSheets } from "./sheets.js";
import { clearApiCache } from "../middleware/apiCache.js";
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
  allowInactive?: boolean;         // default false — allow returns to archived variants
}

export interface MovementResult {
  newQuantity:    number;
  previousQty:   number;
  belowThreshold: boolean;
  movementId:     string;
  productName:    string;
  packageSize:    string;
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
       WHERE  id = ?${options.allowInactive ? "" : " AND active = true"}
       FOR UPDATE`,
      [options.productId]
    ) as [any[], any];

    const product = productRows[0];
    if (!product) {
      throw new Error(
        `Product ${options.productId} not found${options.allowInactive ? "" : " or inactive"}.`
      );
    }

    const previousQty = product.inventory_quantity as number;
    const newQty      = previousQty + options.changeAmount;

    // ── 2. Guard against negative stock ─────────────────────────
    // When allowNegative is false (default), we throw before any mutation.
    // When allowNegative is true (damage_loss/write-off), we allow the
    // negative change to be recorded exactly as requested — no silent
    // clamping, which would decouple products.inventory_quantity from
    // the inventory_movements ledger and cause permanent drift.
    if (!options.allowNegative && newQty < 0) {
      throw new Error(
        `Insufficient stock for "${product.name}" (${product.package_size}). ` +
        `Current: ${previousQty}, requested change: ${options.changeAmount}.`
      );
    }

    const finalQty = newQty;

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
    clearApiCache();

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

    void mirrorStockMovementToSheets({
      id:            movementId,
      productName:   product.name  as string,
      packageSize:   product.package_size as string,
      movementType:  options.type,
      changeAmount:  options.changeAmount,
      quantityAfter: finalQty,
      reason:        options.reason,
      referenceId:   options.referenceId  ?? null,
      referenceType: options.referenceType ?? null,
      performedBy:   options.performedBy  ?? null,
      notes:         options.notes        ?? null,
    });

    return {
      newQuantity:    finalQty,
      previousQty,
      belowThreshold,
      movementId,
      productName:   product.name  as string,
      packageSize:   product.package_size as string,
    };
  } catch (err) {
    if (useOwnTransaction) await conn.rollback();
    throw err;
  } finally {
    if (useOwnTransaction) conn.release();
  }
}

// ─── Batch helpers (used when delivering or cancelling an order) ──────────

export interface SkippedOrderItem {
  orderItemId: string;
  itemName: string;
  packageSize: string;
  quantity: number;
  reason: "unlinked" | "missing" | "inactive";
}

export interface OrderStockChange {
  productId: string;
  newQuantity: number;
  belowThreshold: boolean;
}

export interface OrderStockResult {
  changed: OrderStockChange[];
  skipped: SkippedOrderItem[];
}

function skippedItem(item: any, reason: SkippedOrderItem["reason"]): SkippedOrderItem {
  return {
    orderItemId: item.id as string,
    itemName: item.item_name as string,
    packageSize: item.package_size as string,
    quantity: Number(item.quantity),
    reason,
  };
}

async function resolveOrderItemsWithProducts(conn: PoolConnection, orderId: string): Promise<Array<{ quantity: number; product_id: string }>> {
  const [rawItems] = await conn.query(
    `SELECT product_id, item_name, package_size, quantity FROM order_items WHERE order_id = ?`,
    [orderId]
  ) as [any[], any];

  const resolved: Array<{ quantity: number; product_id: string }> = [];

  for (const item of rawItems) {
    let matchedId: string | null = null;
    if (item.product_id) {
      const [byId] = await conn.query(
        `SELECT id FROM products WHERE id = ? AND active = true LIMIT 1`,
        [item.product_id]
      ) as [any[], any];
      if (byId[0]?.id) matchedId = byId[0].id;
    }
    if (!matchedId && item.item_name) {
      const [byName] = await conn.query(
        `SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND package_size = ? AND active = true LIMIT 1`,
        [item.item_name, item.package_size]
      ) as [any[], any];
      if (byName[0]?.id) matchedId = byName[0].id;
    }
    if (matchedId) {
      resolved.push({ quantity: Number(item.quantity), product_id: matchedId });
    }
  }

  return resolved;
}

/**
 * Deduct stock for all linked items in an order in a single transaction.
 *
 * Uses order_items.product_id directly. Name/package_size are never used to
 * guess a variant: that was the source of the wrong-product stock deductions.
 * Unlinked, missing, and inactive variants are returned as `skipped` so the
 * caller can surface them instead of silently leaving stock untouched.
 */
export async function deductOrderStock(
  orderId:     string,
  performedBy: string | null,
  existingConn?: PoolConnection
): Promise<OrderStockResult> {
  const useOwnTransaction = !existingConn;
  const conn = existingConn ?? (await pool.getConnection());

  try {
    if (useOwnTransaction) await conn.beginTransaction();

    const [items] = await conn.query(
      `SELECT oi.id, oi.product_id, oi.item_name, oi.package_size, oi.quantity,
              p.id AS resolved_id, p.active AS product_active
       FROM   order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE  oi.order_id = ?`,
      [orderId]
    ) as [any[], any];

    const result: OrderStockResult = { changed: [], skipped: [] };

    for (const item of items) {
      if (!item.product_id) {
        result.skipped.push(skippedItem(item, "unlinked"));
        continue;
      }
      if (!item.resolved_id) {
        result.skipped.push(skippedItem(item, "missing"));
        continue;
      }
      if (!item.product_active) {
        result.skipped.push(skippedItem(item, "inactive"));
        continue;
      }

      const movement = await recordMovement(
        {
          productId:     item.product_id,
          type:          "sale",
          changeAmount:  -item.quantity,
          performedBy,
          referenceId:   orderId,
          referenceType: "order",
          reason:        `Order ${orderId} delivered`,
        },
        conn  // share the transaction
      );

      result.changed.push({
        productId:      item.product_id,
        newQuantity:    movement.newQuantity,
        belowThreshold: movement.belowThreshold,
      });
    }

    if (useOwnTransaction) await conn.commit();
    return result;
  } catch (err) {
    if (useOwnTransaction) await conn.rollback();
    throw err;
  } finally {
    if (useOwnTransaction) conn.release();
  }
}

/**
 * Restore stock for all linked items in an order in a single transaction.
 *
 * Called when a Delivered order moves to Cancelled, Issue, or Returned.
 * Archived variants are allowed here: a product deactivated after delivery
 * still needs its stock returned.
 */
export async function restoreOrderStock(
  orderId:     string,
  performedBy: string | null,
  existingConn?: PoolConnection
): Promise<OrderStockResult> {
  const useOwnTransaction = !existingConn;
  const conn = existingConn ?? (await pool.getConnection());

  try {
    if (useOwnTransaction) await conn.beginTransaction();

    const [items] = await conn.query(
      `SELECT oi.id, oi.product_id, oi.item_name, oi.package_size, oi.quantity,
              p.id AS resolved_id
       FROM   order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE  oi.order_id = ?`,
      [orderId]
    ) as [any[], any];

    const result: OrderStockResult = { changed: [], skipped: [] };

    for (const item of items) {
      if (!item.product_id) {
        result.skipped.push(skippedItem(item, "unlinked"));
        continue;
      }
      if (!item.resolved_id) {
        result.skipped.push(skippedItem(item, "missing"));
        continue;
      }

      const movement = await recordMovement(
        {
          productId:     item.product_id,
          type:          "return",
          changeAmount:  item.quantity, // positive to restore
          performedBy,
          referenceId:   orderId,
          referenceType: "order",
          reason:        `Order ${orderId} cancelled/returned`,
          allowInactive: true,
        },
        conn  // share the transaction
      );

      result.changed.push({
        productId:      item.product_id,
        newQuantity:    movement.newQuantity,
        belowThreshold: movement.belowThreshold,
      });
    }

    if (useOwnTransaction) await conn.commit();
    return result;
  } catch (err) {
    if (useOwnTransaction) await conn.rollback();
    throw err;
  } finally {
    if (useOwnTransaction) conn.release();
  }
}

