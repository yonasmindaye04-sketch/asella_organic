/**
 * backend/src/lib/customerActivity.ts
 * Asella Organic — Customer movement timeline writer
 *
 * Every customer-visible change (a sale, a status change, a return, a
 * cancellation, a payment) is appended to customer_activity so the
 * admin Customers page can show one timeline per customer instead of
 * piecing history together from orders + order_status_history +
 * payments at read time.
 *
 * Two rules this module exists to enforce:
 *
 *   1. The write never fails the surrounding operation. A missed
 *      timeline entry is a reporting gap; a thrown error inside an
 *      order-status update would leave the stock movement applied but
 *      the status change rejected. So every call is wrapped and
 *      swallows its own errors.
 *
 *   2. The writer resolves the customer by customer_id and falls back
 *      to phone, matching how vw_customer_insights attributes orders.
 *      If the two disagreed, the score would be computed from orders
 *      the timeline does not show.
 */

import crypto from "crypto";
import pool from "../config/db.js";
import { logger } from "./logger.js";

export type CustomerActivityType =
  | "sale"
  | "status_change"
  | "return"
  | "cancellation"
  | "payment"
  | "note"
  | "rating"
  | "profile_update";

export interface CustomerActivityInput {
  /** Customer UUID. Resolved by phone when omitted. */
  customerId?: string | null;
  /** Used to resolve the customer when customerId is not known yet. */
  phone?: string | null;
  orderId?: string | null;
  activityType: CustomerActivityType;
  title: string;
  detail?: string | null;
  /** Signed ETB. Negative for refunds/returns. */
  amount?: number | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  actorId?: string | null;
  actorName?: string | null;
}

/**
 * Map an order status transition to the activity type that represents
 * it. Returns null when the transition is not a customer-visible
 * movement worth recording.
 */
export function activityTypeForStatus(
  newStatus: string,
  previousStatus?: string | null,
): CustomerActivityType | null {
  const to   = newStatus.trim();
  const from = previousStatus?.trim();

  if (to === from) return null;

  switch (to) {
    case "Delivered":
      return "status_change";
    case "Returned":
      return "return";
    case "Cancelled":
      return "cancellation";
    default:
      // "Issue" is a post-delivery complaint. It is worth its own entry
      // because it means stock came back and the commission was reversed,
      // but it is not a return in the customer's hands.
      return to === "Issue" ? "return" : "status_change";
  }
}

/**
 * Append one movement to the timeline. Never throws.
 *
 * @returns the new activity row id, or null if the write was skipped.
 */
export async function recordCustomerActivity(
  input: CustomerActivityInput,
): Promise<string | null> {
  try {
    let customerId = input.customerId ?? null;

    // Resolve by phone when the caller has no customer id — order
    // creation only learns the id after its own upsert.
    if (!customerId && input.phone) {
      const [rows] = await pool.query(
        `SELECT id FROM customers WHERE phone = ? LIMIT 1`,
        [input.phone]
      ) as [any[], any];
      customerId = rows[0]?.id ?? null;
    }

    if (!customerId) {
      // No customer row means no timeline to attach to. Not an error:
      // the order itself is still recorded on orders.
      return null;
    }

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO customer_activity
         (id, customer_id, order_id, activity_type, title, detail,
          amount, status_from, status_to, actor_id, actor_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customerId,
        input.orderId   ?? null,
        input.activityType,
        input.title,
        input.detail    ?? null,
        input.amount    ?? null,
        input.statusFrom ?? null,
        input.statusTo   ?? null,
        input.actorId   ?? null,
        input.actorName ?? null,
      ]
    );

    return id;
  } catch (err: any) {
    logger.warn("Failed to record customer activity", {
      orderId:   input.orderId,
      type:      input.activityType,
      error:     err?.message ?? String(err),
    });
    return null;
  }
}