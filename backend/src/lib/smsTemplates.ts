/**
 * src/lib/smsTemplates.ts
 * Asella Organic — Message templates and order-status copy
 *
 * Pure formatters. Every function here takes plain data and returns a string,
 * so the wording of an SMS is unit-testable without a database, a network
 * call or a provider account. No pool, no fetch, no config.
 *
 * Mirrors the split already used in lib/telegram.ts, where
 * formatGroupDeliveryMessage / formatPrivateDeliveryMessage sit beside the
 * senders for exactly the same reason.
 *
 * ── Copy rules these bodies follow ───────────────────────────────────
 * 1. Short. A handset notification is a summary; the storefront is the
 *    source of truth. No link is needed — a URL the customer has never seen
 *    before is both a phishing-filter risk and a habit worth not forming.
 * 2. One thought per message. Sent-by-status means a status change is the
 *    only news.
 * 3. Amharic bodies are budgeted at 70 characters per segment (UCS-2), not
 *    160. These are deliberately short enough to stay single-segment so the
 *    cost estimate in the dry run is honest.
 * 4. Marketing bodies carry an opt-out footer. SMSEthiopia inbound is
 *    unconfirmed, so the footer is informational — opt-out is captured on
 *    our storefront/dashboard — but the signal is expected of A2P sends.
 */

import { renderTemplate } from "./smsNormalize.js";
import type { OrderStatus } from "../types/index.js";

// ── Order status ──────────────────────────────────────────────────────────

/**
 * Statuses that generate a customer notification.
 *
 * Pending is excluded: the customer placed it seconds ago and already knows.
 * Processing is excluded because it always follows Confirmed, and two texts
 * in a row for one order is noise rather than information.
 *
 * Add an entry here and it becomes sendable; the dispatcher still enforces
 * the per-order message cap and the status cooldown.
 */
export const NOTIFIABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "Confirmed",
  "In Transit",
  "Delivered",
  "Cancelled",
];

export function isNotifiableOrderStatus(status: string): boolean {
  return (NOTIFIABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Status-specific body, in English.
 *
 * `name` is optional because customers can check out with no name captured;
 * a greeting we cannot render is worse than none.
 */
export function formatOrderStatusEnglish(
  status: OrderStatus,
  data: { orderId: string; name?: string | null },
): string {
  const greeting = data.name?.trim()
    ? `${data.name.trim().split(/\s+/)[0]}, `
    : "";

  switch (status) {
    case "Confirmed":
      return `${greeting}your Asella Organic order ${data.orderId} is confirmed. We will let you know when it ships.`;
    case "In Transit":
      return `${greeting}your Asella Organic order ${data.orderId} is out for delivery.`;
    case "Delivered":
      return `${greeting}your Asella Organic order ${data.orderId} has been delivered. Thank you for shopping with us.`;
    case "Cancelled":
      return `${greeting}your Asella Organic order ${data.orderId} has been cancelled. Reply to this message if you need help.`;
    default:
      return `${greeting}your Asella Organic order ${data.orderId} is now ${status}.`;
  }
}

/**
 * Status-specific body, in Amharic.
 *
 * Kept deliberately tight — every segment here is UCS-2 at 70 characters, so
 * a body over that silently doubles to two billable segments. Translations
 * should be reviewed by a native speaker before going live; these are
 * placeholders that are structurally correct but not yet copy-approved.
 */
export function formatOrderStatusAmharic(
  status: OrderStatus,
  data: { orderId: string; name?: string | null },
): string {
  const greeting = data.name?.trim() ? `${data.name.trim().split(/\s+/)[0]}፣ ` : "";

  switch (status) {
    case "Confirmed":
      return `${greeting}የአሰላ ኦርጋኒክ ጋስ የተያዘ ነው።`;
    case "In Transit":
      return `${greeting}የአሰላ ኦርጋኒክ ጋስ በመንገድ ላይ ነው።`;
    case "Delivered":
      return `${greeting}የአሰላ ኦርጋኒክ ጋስዎ ተደርሷል። እናመሰግናለን።`;
    case "Cancelled":
      return `${greeting}የአሰላ ኦርጋኒክ ጋስዎ ተሰርዟል።`;
    default:
      return `${greeting}የአሰላ ኦርጋኒክ ጋስዎ አሁን ${status} ሆኗል።`;
  }
}

export function formatOrderStatus(
  status: OrderStatus,
  data: { orderId: string; name?: string | null },
  locale: "en" | "am" = "en",
): string {
  return locale === "am"
    ? formatOrderStatusAmharic(status, data)
    : formatOrderStatusEnglish(status, data);
}

// ── Marketing / broadcast ─────────────────────────────────────────────────

/** Opt-out footer for marketing sends. Adds one segment to short bodies. */
export const OPT_OUT_FOOTER = "Reply STOP to opt out.";

export const MAX_MARKETING_BODY_CHARS = 5 * 67; // 5 UCS-2 segments

/**
 * Append the opt-out footer unless the body already carries one.
 *
 * Idempotent on purpose: the composer shows the body with the footer applied,
 * and a staff member who then edits it should not accumulate a second one.
 */
export function withOptOutFooter(body: string): string {
  const trimmed = body.trim();
  if (trimmed.toUpperCase().includes("STOP")) return trimmed;
  return `${trimmed}\n\n${OPT_OUT_FOOTER}`;
}

/**
 * Personalize a broadcast body with the recipient's own fields.
 * Unknown placeholders collapse to empty rather than reaching a handset as
 * literal braces.
 */
export function renderBroadcastBody(
  template: string,
  vars: { name?: string | null; city?: string | null; product?: string | null },
): string {
  return renderTemplate(template, {
    name: vars.name ?? "",
    city: vars.city ?? "",
    product: vars.product ?? "",
  });
}

/** New-stock notification body. Shared by the composer and the dry run. */
export function formatNewStockEnglish(data: {
  name?: string | null;
  product: string;
  city?: string | null;
}): string {
  const greeting = data.name?.trim()
    ? `${data.name.trim().split(/\s+/)[0]}, `
    : "";
  const where = data.city?.trim() ? ` in ${data.city.trim()}` : "";
  return `${greeting}${data.product} is back in stock${where} at Asella Organic. Reply STOP to opt out.`;
}