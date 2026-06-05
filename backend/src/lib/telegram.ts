/**
 * src/lib/telegram.ts
 * Asella Organic — Telegram API Helpers (MySQL Compatible)
 */
import pool from "../config/db.js";
import crypto from "crypto";

// ─── Low-level API caller ─────────────────────────────────────────────────
async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[telegram] Missing TELEGRAM_BOT_TOKEN env var.");
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, err);
    return null;
  }
}

// ─── Primitive helpers (exported for webhook route) ───────────────────────

export async function sendSimpleMessage(
  chatId: string | number,
  text: string
): Promise<any> {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<void> {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) { body.text = text; body.show_alert = showAlert; }
  await tg("answerCallbackQuery", body);
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string
): Promise<void> {
  await tg("editMessageText", {
    chat_id:    chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
  });
}

// ─── Message formatters ───────────────────────────────────────────────────

export function formatGroupDeliveryMessage(order: Record<string, any>): string {
  const items: any[] = Array.isArray(order.items) ? order.items : [];

  const itemsSummary = items.length
    ? items
        .map(
          (i: any) =>
            `• ${i.name || i.item_name || "Item"} ` +
            `[${i.package_size || i.size || "Std"}] × ${i.quantity ?? 1}`
        )
        .join("\n")
    : "No items listed";

  const dateStr = order.created_at
    ? new Date(order.created_at)
        .toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })
        .replace(",", "")
    : new Date()
        .toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })
        .replace(",", "");

  return [
    `📦 *New Delivery Order*`,
    `━━━━━━━━━━━━━━━━━━`,
    `🆔 *Order:* ${order.id ?? "N/A"}`,
    `🏙 *City:* ${order.city ?? "Addis Ababa"}`,
    `📍 *Location:* ${order.location ?? "N/A"}`,
    `🛒 *Items:*`,
    itemsSummary,
    `\n🕐 ${dateStr}`,
    `━━━━━━━━━━━━━━━━━━`,
    `_First to accept gets assigned. Full details sent privately._`,
  ].join("\n");
}

export function formatPrivateDeliveryMessage(order: Record<string, any>): string {
  const items: any[] = Array.isArray(order.items) ? order.items : [];

  const itemsSummary = items.length
    ? items
        .map(
          (i: any) =>
            `• ${i.name || i.item_name || "Item"} ` +
            `[${i.package_size || i.size || "Std"}] × ${i.quantity ?? 1}`
        )
        .join("\n")
    : "No items listed";

  return [
    `🚗 *DELIVERY ORDER — You're Assigned*`,
    `━━━━━━━━━━━━━━━━━━`,
    `🆔 *Order ID:* \`${order.id ?? "N/A"}\``,
    `👤 *Customer:* ${order.customer_name ?? "N/A"}`,
    `📞 *Phone:* ${order.phone ?? "N/A"}`,
    `📍 *Address:* ${order.location ?? "N/A"}, ${order.city ?? "Addis Ababa"}`,
    `📋 *Order Type:* ${order.order_type ?? "N/A"}`,
    `━━━━━━━━━━━━━━━━━━`,
    `🛒 *Items:*`,
    itemsSummary,
    `━━━━━━━━━━━━━━━━━━`,
    `💰 *Total:* ETB ${order.total ?? 0}`,
    `💳 *Payment:* ${order.payment_method ?? "N/A"}`,
    `📝 *Notes:* ${order.notes ?? "None"}`,
    `━━━━━━━━━━━━━━━━━━`,
    `_Please deliver promptly and confirm on arrival._`,
  ].join("\n");
}

// ─── Notification senders ─────────────────────────────────────────────────

export async function sendWithButtons(
  chatId: string | number,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>
): Promise<any> {
  return tg("sendMessage", {
    chat_id:      chatId,
    text,
    parse_mode:   "Markdown",
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function sendOrderToAdmin(order: Record<string, unknown>): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return;
  
  // Only send important messages to admin: stock requests, urgent issues
  // Don't send regular orders - those go to delivery group instead
  // This filter helps reduce admin notification spam
  const messageType = (order.message_type as string) || "order";
  
  // Skip regular orders - let delivery group handle them
  if (messageType === "order" || messageType === "regular") {
    return;
  }

  // Send critical/important messages only
  await tg("sendMessage", {
    chat_id:    chatId,
    text:       formatPrivateDeliveryMessage(order),
    parse_mode: "Markdown",
  });
}

export async function sendToDeliveryGroup(
  order: Record<string, unknown>
): Promise<number | null> {
  const chatId = process.env.TELEGRAM_DELIVERY_GROUP_ID;
  if (!chatId) return null;

  const text    = formatGroupDeliveryMessage(order);
  const orderId = String(order.id ?? "UNKNOWN");
  const buttons = [
    [
      { text: "✅ Accept", callback_data: `delivery_accept_${orderId}` },
      { text: "❌ Reject", callback_data: `delivery_reject_${orderId}` },
    ],
  ];

  const result = await sendWithButtons(chatId, text, buttons);
  if (result?.ok && result.result?.message_id) {
    return result.result.message_id as number;
  }
  return null;
}

export async function sendDetailsToAssignedDriver(
  driverChatId: string | number,
  order: Record<string, unknown>
): Promise<void> {
  await tg("sendMessage", {
    chat_id:    driverChatId,
    text:       formatPrivateDeliveryMessage(order),
    parse_mode: "Markdown",
  });
}

export async function sendTelegramToCustomer({
  phone,
  message,
}: {
  phone:   string;
  message: string;
}): Promise<void> {
  try {
    const normalizedPhone = phone.replace(/\s/g, "");
    const [rows] = await pool.query(
      `SELECT telegram_chat_id FROM customers
       WHERE phone = ? AND telegram_chat_id IS NOT NULL`,
      [normalizedPhone]
    ) as [any[], any];
    const customer = rows[0];
    
    if (!customer?.telegram_chat_id) {
      console.warn(`[telegram] No linked account for ${phone}`);
      return;
    }
    
    await tg("sendMessage", {
      chat_id:    customer.telegram_chat_id,
      text:       message,
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[telegram] sendTelegramToCustomer failed:", err);
  }
}

export async function sendLowStockAlert({
  name, size, current, threshold,
}: {
  name: string; size: string; current: number; threshold: number;
}): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return;
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `⚠️ *Low Stock Alert*\n━━━━━━━━━━━━━━━━━━\n` +
      `📦 *${name}* (${size})\n` +
      `Current: \`${current}\` — Threshold: \`${threshold}\`\n` +
      `📅 ${new Date().toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" })}\n` +
      `Please restock immediately.`,
    parse_mode: "Markdown",
  });
}

export async function sendStockRequestAlert({
  item, packageSize, current, needed, deliveryDate, requestedBy,
}: {
  item: string; packageSize: string; current: number;
  needed: number; deliveryDate: string; requestedBy: string;
}): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return;
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `📝 *Stock Request*\n━━━━━━━━━━━━━━━━━━\n` +
      `🔹 *${item}* (${packageSize})\n` +
      `Remaining: *${current}* → Need: *${needed}*\n` +
      `Needed by: ${deliveryDate}\n` +
      `Requested by: ${requestedBy}\n` +
      `📅 ${new Date().toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" })}`,
    parse_mode: "Markdown",
  });
}

export async function storePendingVendorMessage(
  vendorChatId: string,
  vendorName:   string,
  orderId:      string,
  message:      string
): Promise<void> {
  try {
    const newId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pending_vendor_messages
         (id, vendor_chat_id, vendor_name, order_id, message, delivered)
       VALUES (?, ?, ?, ?, ?, false)
       ON DUPLICATE KEY UPDATE message = VALUES(message), delivered = false`,
      [newId, vendorChatId, vendorName, orderId, message]
    );
  } catch (err) {
    console.error("[storePendingVendorMessage]", err);
  }
}

export async function sendVendorPO(
  vendorChatId: string,
  vendorName:   string,
  orderId:      string,
  items: Array<{ name: string; amount: string; price: string; deliveryDate: string }>,
  employeeId:   string
): Promise<void> {
  const itemLines = items
    .map(i => `• ${i.name} | ${i.amount} | ETB ${i.price} | by ${i.deliveryDate}`)
    .join("\n");

  const message =
    `📋 *Purchase Order — Asella Organic*\n━━━━━━━━━━━━━━━━━━\n` +
    `🆔 Ref: *${orderId}*\n🏪 Vendor: ${vendorName}\n\n` +
    `🛒 Items:\n${itemLines || "  (see attached sheet)"}\n\n` +
    `👤 Placed by: ${employeeId}\n` +
    `📅 ${new Date().toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" })}\n\n` +
    `Please confirm by tapping a button below.`;

  const buttons = [
    [
      { text: "✅ Accept Order",    callback_data: `po_accept_${orderId}` },
      { text: "❌ Decline Order",   callback_data: `po_decline_${orderId}` },
    ],
    [
      { text: "🔄 Request Changes", callback_data: `po_changes_${orderId}` },
      { text: "👁 View Details",    callback_data: `po_view_${orderId}` },
    ],
  ];

  const result = await sendWithButtons(vendorChatId, message, buttons);
  if (!result?.ok) {
    await storePendingVendorMessage(vendorChatId, vendorName, orderId, message);
    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (adminChat) {
      await tg("sendMessage", {
        chat_id:    adminChat,
        text:       `⚠️ *Vendor Not Registered*\n${vendorName} needs to /start the bot.\nPO ${orderId} queued for retry.`,
        parse_mode: "Markdown",
      });
    }
  }
}

export async function sendMorningBriefing(): Promise<void> {
  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChat) return;
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const [statsRes, pendingRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
         FROM orders WHERE DATE(created_at) = ?`,
        [yesterday]
      ),
      pool.query(`SELECT COUNT(*) AS count FROM orders WHERE status = 'Pending'`),
    ]) as [[any[], any], [any[], any]];

    const s = statsRes[0][0];
    const p = pendingRes[0][0];

    await sendWithButtons(
      adminChat,
      `☀️ *Morning Briefing — Asella Organic*\n━━━━━━━━━━━━━━━━━━\n` +
      `📅 Yesterday (${yesterday}):\n` +
      `   Orders: *${s?.orders ?? 0}* | Revenue: *ETB ${Number(s?.revenue ?? 0).toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⏳ Pending now: *${p?.count ?? 0}*`,
      [
        [
          { text: "⏳ Pending Orders", callback_data: "pending_orders" },
          { text: "📊 Stats",          callback_data: "analytics_summary" },
        ],
      ]
    );
  } catch (err) {
    console.error("[sendMorningBriefing]", err);
  }
}

export function enforceStringValue(input: string | string[] | undefined): string {
  if (!input) return "";
  return Array.isArray(input) ? (input[0] ?? "") : input;
}