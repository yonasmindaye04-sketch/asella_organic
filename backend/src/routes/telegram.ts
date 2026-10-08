//src/routes/telegram.ts

import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { CreateOrderSchema, TelegramProfileSchema } from "../schemas/index.js";
import { randomId } from "../lib/security.js";
import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  sendDetailsToAssignedDriver,
  sendDetailsToGroupAsReply,
  sendSimpleMessage,
  sendTelegramToCustomer,
  sendToDeliveryGroup,
  sendWithButtons,
  setChatMenuButton,
  getBotMe,
  getWebhookInfo,
  setWebhook,
  deleteWebhook,
  initBotConfiguration,
  sendTelegramPush,
} from "../lib/telegram.js";
import { mirrorDeliveryAssignmentToSheets, mirrorOrderStatusToSheets } from "../lib/sheets.js";
import { validateTelegramInitData } from "../lib/telegram-auth.js";

const router = Router();

/**
 * Resolves the Mini App URL for the /store command, the inline Store buttons
 * and the persistent chat menu button.
 *
 * Prefer TELEGRAM_MINIAPP_URL. The fallback path is rewritten to the standalone
 * Mini App document (frontend/tma.html) by both .htaccess and the Vite dev
 * middleware, so it never falls through to the website homepage.
 */
function getStoreUrl(): string {
  if (process.env.TELEGRAM_MINIAPP_URL) {
    return process.env.TELEGRAM_MINIAPP_URL;
  }
  const baseUrl = process.env.PUBLIC_URL || "https://asellaorganic.com";
  return `${baseUrl.replace(/\/$/, "")}/tma`;
}

const verifyTelegramWebhook = (token?: string) => token === process.env.TELEGRAM_WEBHOOK_SECRET;

function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// ─── Mini App request authentication ──────────────────────────────────
// Telegram Mini App endpoints that expose customer data require a
// cryptographically verified initData payload. A caller-supplied chat id is
// never trusted: chat ids are sequential, so accepting one without a
// verified HMAC signature would let anyone read another customer's orders.

type MiniAppAuth =
  | { ok: true; chatId: number; user: NonNullable<ReturnType<typeof validateTelegramInitData>["user"]> }
  | { ok: false; status: number; error: string };

function readInitData(req: Request): string {
  const candidate =
    (typeof req.query.initData === "string" && req.query.initData) ||
    (typeof req.body?.initData === "string" && req.body.initData) ||
    req.headers["x-telegram-init-data"];
  return typeof candidate === "string" ? candidate : "";
}

/** Maps the Orders tab's filter chips onto concrete order statuses. */
const ORDER_STATUS_GROUPS: Record<string, string[]> = {
  processing: ["Pending", "Confirmed", "Packed", "In Transit", "Processing", "Out for Delivery"],
  delivered: ["Delivered"],
  refunded: ["Cancelled", "Returned"],
};

function resolveStatusFilter(filter: string): string[] {
  const normalized = filter.toLowerCase().replace(/[\s_-]+/g, "");
  const group = ORDER_STATUS_GROUPS[normalized];
  if (group) return group;
  // Allow an exact status pass-through so links can target one state.
  const match = Object.values(ORDER_STATUS_GROUPS)
    .flat()
    .find((status) => status.toLowerCase() === normalized);
  return match ? [match] : [];
}

interface TelegramProfileFields {
  username: string | null;
  first_name: string;
  last_name: string | null;
  display_name?: string;
  phone?: string;
  city?: string;
  location?: string;
}

/**
 * Upserts telegram_users for a verified initData user. Profile columns are
 * only written when supplied so that a plain presence ping never blanks an
 * existing profile.
 */
async function upsertTelegramProfile(
  chatId: number,
  fields: TelegramProfileFields,
  touchProfile: boolean
): Promise<void> {
  const hasProfile =
    fields.display_name !== undefined ||
    fields.phone !== undefined ||
    fields.city !== undefined ||
    fields.location !== undefined;

  await pool.query(
    `INSERT INTO telegram_users
       (chat_id, username, first_name, last_name, display_name, phone, city, location,
        registered_at, profile_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ${touchProfile ? "NOW()" : "NULL"})
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       first_name = VALUES(first_name),
       last_name = VALUES(last_name),
       display_name = COALESCE(VALUES(display_name), display_name),
       phone = COALESCE(VALUES(phone), phone),
       city = COALESCE(VALUES(city), city),
       location = COALESCE(VALUES(location), location),
       profile_updated_at = ${touchProfile ? "NOW()" : "profile_updated_at"},
       last_seen = NOW()`,
    [
      chatId,
      fields.username,
      fields.first_name,
      fields.last_name,
      hasProfile ? fields.display_name ?? null : null,
      hasProfile ? fields.phone ?? null : null,
      hasProfile ? fields.city ?? null : null,
      hasProfile ? fields.location ?? null : null,
    ]
  );
}

/**
 * Verifies the Telegram initData signature and returns the authenticated
 * chat id. Responds with 401/500 and returns null on failure.
 */
function authenticateMiniApp(req: Request, res: Response): MiniAppAuth | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    res.status(500).json({ success: false, error: "Bot token not configured on server" });
    return null;
  }

  const initData = readInitData(req);
  if (!initData) {
    res.status(401).json({
      success: false,
      error: "Missing initData. Open this page from inside Telegram.",
    });
    return null;
  }

  const validation = validateTelegramInitData(initData, token);
  if (!validation.valid || !validation.user) {
    res.status(401).json({
      success: false,
      error: validation.error || "Invalid Telegram authentication data",
    });
    return null;
  }

  return { ok: true, chatId: validation.user.id, user: validation.user };
}

// ─── Interactive conversation state ────────────────────────────────────
interface ConvState {
  step: string;
  data: Record<string, any>;
}
const userState = new Map<number, ConvState>();

const PRODUCTS_PER_PAGE = 6;

type ParsedTelegramOrder = {
  customer_name: string;
  phone: string;
  city: string;
  location: string;
  order_type: "delivery" | "pickup";
  notes?: string | undefined;
  delivery_date?: string | undefined;
  items: Array<{ name: string; package_size: string; quantity: number; unit_price: number }>;
};

const ORDER_HELP = [
  "Send your order in this format:",
  "",
  "/order",
  "Name: Your full name",
  "Phone: +251900000000",
  "City: Addis Ababa",
  "Location: Bole, near ...",
  "Type: delivery",
  "Items:",
  "Moringa Powder, 250g, 2, 350",
  "Blackseed Oil, 30ml, 1, 500",
  "",
  "Each item line is: product, package size, quantity, unit price.",
].join("\n");

// ─── Interactive menu helpers ─────────────────────────────────────────

async function sendRoleMenu(chatId: number): Promise<void> {
  const storeUrl = getStoreUrl();
  await sendWithButtons(chatId,
    "*Welcome to Asella Organic*\n\nPlease select an option:",
    [
      [
        { text: "Open Organic Store", web_app: { url: storeUrl } },
      ],
      [
        { text: "Customer Menu", callback_data: "role:customer" },
        { text: "Driver Login", callback_data: "role:driver" },
      ],
      [
        { text: "Staff Login", callback_data: "role:staff" },
        { text: "Vendor Menu", callback_data: "role:vendor" },
      ],
    ]
  );
}

async function sendStaffRoleMenu(chatId: number | string, role: string, fullName: string): Promise<void> {
  const greeting = `*Welcome back, ${fullName}!* (${role})\n\n`;

  const commonButtons: Array<Array<{ text: string; callback_data?: string; url?: string; web_app?: { url: string } }>> = [
    [{ text: "Open Store", web_app: { url: getStoreUrl() } }],
    [{ text: "Track Order", callback_data: "staff:track" }],
    [{ text: "Place Order", callback_data: "menu_order" }],
  ];

  if (role === "admin" || role === "manager") {
    commonButtons.unshift([{ text: "View Orders", callback_data: "staff:orders" }]);
  }

  if (role === "admin") {
    commonButtons.push([{ text: "Dashboard", url: "https://app.asellaorganic.com/dashboard" }]);
  }

  commonButtons.push([{ text: "Logout", callback_data: "staff:logout" }]);

  await sendWithButtons(chatId, greeting + "Select an option:", commonButtons);
}

async function sendCustomerMenu(chatId: number): Promise<void> {
  const storeUrl = getStoreUrl();
  await sendWithButtons(chatId,
    "*Customer Menu*\n\nExplore 100% natural organic health products:",
    [
      [
        { text: "Open Organic Store", web_app: { url: storeUrl } },
      ],
      [
        { text: "Track Order", callback_data: "menu_track" },
        { text: "My Orders", callback_data: "menu_myorders" },
      ],
      [
        { text: "Text Order Flow", callback_data: "menu_order" },
        { text: "Help", callback_data: "menu_help" },
      ],
    ]
  );
}

async function sendVendorMenu(chatId: number): Promise<void> {
  const [rows] = await pool.query(
    `SELECT order_id, status, total, created_at
     FROM vendor_orders WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 5`,
    [chatId]
  ) as [any[], any];

  let msg = "*Vendor Menu*\n\n";
  if (rows.length) {
    msg += "Your recent purchase orders:\n";
    msg += rows.map((r: any) =>
      `• ${r.order_id} — ${r.status} — ETB ${Number(r.total ?? 0).toLocaleString()}`
    ).join("\n");
  } else {
    msg += "No purchase orders yet.";
  }

  await sendWithButtons(chatId, msg, [
    [
      { text: "Refresh", callback_data: "vendor:refresh" },
      { text: "Back", callback_data: "role:back" },
    ],
  ]);
}

async function startOrderFlow(chatId: number): Promise<void> {
  userState.set(chatId, { step: "awaiting_name", data: {} });
  await sendSimpleMessage(chatId,
    "Let's place your order!\n\nFirst, what's your *full name*?"
  );
}

async function showCityOptions(chatId: number): Promise<void> {
  await sendWithButtons(chatId, "Select your *city*:", [
    [
      { text: "Addis Ababa", callback_data: "city:Addis Ababa" },
      { text: "Other Regions", callback_data: "city:Other Regions" },
    ],
    [
      { text: "Abroad", callback_data: "city:Abroad" },
    ],
  ]);
}

async function showOrderTypeOptions(chatId: number): Promise<void> {
  await sendWithButtons(chatId, "Would you like *delivery* or *pickup*?", [
    [
      { text: "Delivery", callback_data: "otype:delivery" },
      { text: "Pickup", callback_data: "otype:pickup" },
    ],
  ]);
}

async function showProductCatalog(chatId: number, page = 0): Promise<void> {
  const [rows] = await pool.query(
    `SELECT DISTINCT name FROM products WHERE active = TRUE ORDER BY name LIMIT ? OFFSET ?`,
    [PRODUCTS_PER_PAGE, page * PRODUCTS_PER_PAGE]
  ) as [any[], any];

  if (!rows.length) {
    await sendSimpleMessage(chatId, "No products found.");
    return;
  }

  const buttons = rows.map((r: any) => [
    { text: r.name, callback_data: `prod:${r.name}` },
  ]);

  const nav = [];
  if (page > 0) nav.push({ text: "Back", callback_data: `page:${page - 1}` });
  nav.push({ text: "Done", callback_data: "order_done_items" });
  const [countRows] = await pool.query(
    `SELECT COUNT(DISTINCT name) AS cnt FROM products WHERE active = TRUE`
  ) as [any[], any];
  if ((page + 1) * PRODUCTS_PER_PAGE < countRows[0].cnt) {
    nav.push({ text: "Next", callback_data: `page:${page + 1}` });
  }

  buttons.push(nav);
  await sendWithButtons(chatId, "Select a *product* to add:", buttons);
}

async function showSizes(chatId: number, productName: string): Promise<void> {
  const [rows] = await pool.query(
    `SELECT id, package_size, price, inventory_quantity
     FROM products WHERE name = ? AND active = TRUE ORDER BY package_size`,
    [productName]
  ) as [any[], any];

  if (!rows.length) {
    await sendSimpleMessage(chatId, "No sizes found for that product.");
    return;
  }

  const buttons = rows.map((r: any) => {
    const label = r.inventory_quantity > 0
      ? `${r.package_size} — ETB ${Number(r.price).toLocaleString()}`
      : `${r.package_size} — Out of stock`;
    return [{ text: label, callback_data: `size:${r.id}` }];
  });

  await sendWithButtons(chatId, `Select a size for *${productName}*:`, buttons);
}

async function showAddMorePrompt(chatId: number): Promise<void> {
  await sendWithButtons(chatId, "Add another item?", [
    [
      { text: "Yes, add more", callback_data: "addmore:yes" },
      { text: "No, I'm done", callback_data: "addmore:no" },
    ],
  ]);
}

async function confirmOrderSummary(chatId: number, state: ConvState): Promise<void> {
  const d = state.data;
  const itemsText = (d.items as Array<{ name: string; size: string; qty: number; price: number }>)
    .map((i, idx) => `${idx + 1}. ${i.name} [${i.size}] × ${i.qty} — ETB ${(i.price * i.qty).toLocaleString()}`)
    .join("\n");
  const total = (d.items as Array<{ name: string; size: string; qty: number; price: number }>)
    .reduce((sum, i) => sum + i.price * i.qty, 0);

  const summary = [
    `*Order Summary*`,
    ``,
    `Name: ${d.name}`,
    `Phone: ${d.phone}`,
    `City: ${d.city}`,
    `Location: ${d.location}`,
    `Type: ${d.orderType}`,
    ``,
    `Items:`,
    itemsText,
    ``,
    `Total: ETB ${total.toLocaleString()}`,
  ].join("\n");

  userState.set(chatId, { ...state, step: "confirming" });
  await sendWithButtons(chatId, summary, [
    [
      { text: "Confirm Order", callback_data: "confirm:yes" },
      { text: "Cancel", callback_data: "confirm:no" },
    ],
  ]);
}

async function submitInteractiveOrder(chatId: number, state: ConvState): Promise<void> {
  const d = state.data;
  const items = (d.items as Array<{ name: string; size: string; qty: number; price: number }>)
    .map(i => ({
      name: i.name,
      package_size: i.size,
      quantity: i.qty,
      unit_price: i.price,
    }));

  try {
    const created = await createTelegramOrder({
      customer_name: d.name,
      phone: d.phone,
      city: d.city,
      location: d.location,
      order_type: d.orderType as "delivery" | "pickup",
      items,
    }, chatId);

    userState.delete(chatId);
    await sendSimpleMessage(chatId,
      `*Order Placed*\n\nYour order *${created.id}* has been received.\nTotal: ETB ${created.total.toLocaleString()}\n\nWe will update you here when the status changes.`
    );
  } catch (err: any) {
    await sendSimpleMessage(chatId, `Could not create that order: ${err.message}`);
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

function parseOrderMessage(text: string): ParsedTelegramOrder | null {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const firstLine = lines[0]?.toLowerCase();
  if (firstLine !== "/order" && firstLine !== "order") return null;

  const fields: Record<string, string> = {};
  const itemLines: string[] = [];
  let readingItems = false;

  for (const line of lines.slice(1)) {
    if (/^items?:$/i.test(line)) {
      readingItems = true;
      continue;
    }

    if (readingItems) {
      itemLines.push(line.replace(/^[-*]\s*/, ""));
      continue;
    }

    const match = line.match(/^([a-z_ ]+):\s*(.+)$/i);
    if (match) {
      const [, rawKey, rawValue] = match;
      if (rawKey && rawValue) {
        fields[rawKey.trim().toLowerCase().replace(/\s+/g, "_")] = rawValue.trim();
      }
    }
  }

  const items = itemLines
    .map(line => line.split(",").map(part => part.trim()))
    .filter(parts => parts.length >= 4)
    .map(([name, package_size, quantity, unit_price]) => ({
      name: name ?? "",
      package_size: package_size ?? "",
      quantity: Number(quantity),
      unit_price: Number(unit_price),
    }));

  return {
    customer_name: fields.name ?? fields.customer_name ?? "",
    phone: normalizePhone(fields.phone ?? ""),
    city: fields.city ?? "",
    location: fields.location ?? fields.address ?? "",
    order_type: (fields.type ?? fields.order_type ?? "delivery").toLowerCase() === "pickup" ? "pickup" : "delivery",
    notes: fields.notes,
    delivery_date: fields.delivery_date,
    items,
  };
}

async function upsertTelegramUser(message: any): Promise<void> {
  const { chat, from } = message;
  await pool.query(
    `INSERT INTO telegram_users (chat_id, username, first_name, last_name, registered_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       first_name = VALUES(first_name),
       last_name = VALUES(last_name),
       last_seen = NOW()`,
    [chat.id, from?.username ?? null, from?.first_name ?? null, from?.last_name ?? null]
  );
}

type LinkOutcome = "linked" | "already_linked_to_you" | "taken_by_another_chat" | "not_found";

function describeLinkOutcome(outcome: LinkOutcome, phone: string): string {
  switch (outcome) {
    case "linked":
      return "Your Telegram account is linked. You will receive updates for orders with that phone number.";
    case "already_linked_to_you":
      return "That phone number is already linked to your Telegram account.";
    case "taken_by_another_chat":
      return "That phone number is already linked to another Telegram account. If that is a mistake, contact support to have it unlinked.";
    case "not_found":
      return `We could not find any customer record for ${phone}. Place an order first, then link it.`;
  }
}

/**
 * Links a Telegram chat to a customer phone number.
 *
 * Linking grants read access to that phone's order history, so it refuses to
 * take over a phone number that is already attached to a different chat. The
 * caller is responsible for confirming the phone number with the user first.
 */
async function linkCustomerChat(
  phone: string,
  chatId: string | number,
  fallbackName: string
): Promise<LinkOutcome> {
  const normalizedPhone = normalizePhone(phone);

  const [existing] = await pool.query(
    `SELECT telegram_chat_id FROM customers WHERE phone = ? LIMIT 1`,
    [normalizedPhone]
  ) as [any[], any];

  if (!existing[0]) return "not_found";

  const currentOwner = existing[0].telegram_chat_id;
  if (currentOwner !== null && currentOwner !== undefined) {
    if (String(currentOwner) === String(chatId)) return "already_linked_to_you";
    return "taken_by_another_chat";
  }

  await pool.query(
    `UPDATE customers
     SET telegram_chat_id = ?, name = COALESCE(NULLIF(name, ''), ?), updated_at = NOW()
     WHERE phone = ?`,
    [chatId, fallbackName, normalizedPhone]
  );

  return "linked";
}

async function createTelegramOrder(order: ParsedTelegramOrder, chatId: string | number): Promise<{ id: string; total: number }> {
  const parsed = CreateOrderSchema.safeParse({ ...order, source: "telegram" });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    throw new Error(firstError ?? "Order details are incomplete.");
  }

  const { items, ...fields } = parsed.data;
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomId(4)}`;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const customerId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO customers (id, phone, name, city, location, gender, age_group, telegram_chat_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         city = VALUES(city),
         location = VALUES(location),
         telegram_chat_id = VALUES(telegram_chat_id),
         updated_at = NOW()`,
      [
        customerId,
        fields.phone,
        fields.customer_name,
        fields.city,
        fields.location,
        fields.gender ?? null,
        fields.age_group ?? null,
        chatId,
      ]
    );

    const [custRows] = await connection.query(
      `SELECT id FROM customers WHERE phone = ?`,
      [fields.phone]
    ) as [any[], any];

    await connection.query(
      `INSERT INTO orders
         (id, source, customer_name, phone, location, city, gender, age_group,
          order_type, status, total, notes, customer_id, delivery_date, payment_status)
       VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, 'Pending')`,
      [
        orderId,
        fields.customer_name,
        fields.phone,
        fields.location,
        fields.city,
        fields.gender ?? null,
        fields.age_group ?? null,
        fields.order_type,
        total,
        fields.notes ?? null,
        custRows[0].id,
        fields.delivery_date ?? null,
      ]
    );

    for (const item of items) {
      await connection.query(
        `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), orderId, item.name, item.package_size, item.quantity, item.unit_price]
      );
    }

    await connection.query(
      `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
       VALUES (?, ?, NULL, 'Pending', 'telegram-bot', 'Order placed via Telegram bot', NOW())`,
      [crypto.randomUUID(), orderId]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  if (fields.order_type === "delivery") {
    void sendToDeliveryGroup({ id: orderId, ...fields, total, items });
  }
  return { id: orderId, total };
}

async function sendCustomerOrders(chatId: string | number): Promise<void> {
  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.total
     FROM orders o
     JOIN customers c ON c.phone = o.phone
     WHERE c.telegram_chat_id = ? AND o.deleted_at IS NULL
     ORDER BY o.created_at DESC
     LIMIT 5`,
    [chatId]
  ) as [any[], any];

  if (!rows.length) {
    await sendSimpleMessage(chatId, "No linked orders yet. Use /order to place one or /link +251... to connect your phone.");
    return;
  }

  const body = rows
    .map(order => `*${order.id}* - ${order.status} - ETB ${Number(order.total ?? 0).toLocaleString()}`)
    .join("\n");
  await sendSimpleMessage(chatId, `Your recent orders:\n\n${body}`);
}

async function sendOrderStatus(chatId: string | number, orderId: string): Promise<void> {
  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.total
     FROM orders o
     JOIN customers c ON c.phone = o.phone
     WHERE o.id = ? AND c.telegram_chat_id = ? AND o.deleted_at IS NULL
     LIMIT 1`,
    [orderId.trim(), chatId]
  ) as [any[], any];

  const order = rows[0];
  if (!order) {
    await sendSimpleMessage(chatId, "I could not find that order for this Telegram account. Use /link +251... first if you ordered outside Telegram.");
    return;
  }

  await sendSimpleMessage(
    chatId,
    `Order *${order.id}* is currently *${order.status}*.\nTotal: ETB ${Number(order.total ?? 0).toLocaleString()}`
  );
}

async function handleCallback(query: any): Promise<void> {
  const { id: callbackQueryId, from, data, message } = query;
  const chatId = from?.id;

  try {
    if (!data) {
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    // ── Role selection ────────────────────────────────────────────
    if (data === "role:customer") {
      await answerCallbackQuery(callbackQueryId);
      await sendCustomerMenu(chatId);
      return;
    }

    if (data === "role:vendor") {
      await answerCallbackQuery(callbackQueryId);
      await sendVendorMenu(chatId);
      return;
    }

    if (data === "role:staff") {
      userState.set(chatId, { step: "awaiting_staff_username", data: {} });
      await answerCallbackQuery(callbackQueryId);
      await sendSimpleMessage(chatId, "Enter your *username* to log in as staff:");
      return;
    }

    if (data === "role:driver") {
      userState.set(chatId, { step: "awaiting_driver_username", data: {} });
      await answerCallbackQuery(callbackQueryId);
      await sendSimpleMessage(chatId, "Enter your *username* to log in as driver:");
      return;
    }

    if (data === "role:back") {
      await answerCallbackQuery(callbackQueryId);
      await sendRoleMenu(chatId);
      return;
    }

    // ── Staff confirm identity ────────────────────────────────────
    if (data === "staff:confirm") {
      const state = userState.get(chatId);
      if (!state || state.step !== "confirm_identity") {
        await answerCallbackQuery(callbackQueryId, "Session expired. Use /start to login again.", true);
        return;
      }
      userState.delete(chatId);
      await pool.query(
        `UPDATE staff_users SET telegram_chat_id = ? WHERE id = ?`,
        [chatId, state.data.staffId]
      );
      await answerCallbackQuery(callbackQueryId, "Identity confirmed!");
      await sendStaffRoleMenu(chatId, state.data.role, state.data.fullName);
      return;
    }

    if (data === "staff:cancel") {
      userState.delete(chatId);
      await answerCallbackQuery(callbackQueryId, "Login cancelled.");
      await sendRoleMenu(chatId);
      return;
    }

    // ── Staff menu actions ─────────────────────────────────────────
    if (data === "staff:track") {
      userState.set(chatId, { step: "awaiting_track_id", data: {} });
      await answerCallbackQuery(callbackQueryId, "Send the order ID to track.");
      return;
    }

    if (data === "staff:orders") {
      await answerCallbackQuery(callbackQueryId);
      const [rows] = await pool.query(
        `SELECT id, status, total, customer_name, created_at
         FROM orders WHERE deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 5`
      ) as [any[], any];
      if (!rows.length) {
        await sendSimpleMessage(chatId, "No orders found.");
        return;
      }
      const body = rows.map((o: any) =>
        `*${o.id}* — ${o.status} — ${o.customer_name} — ETB ${Number(o.total ?? 0).toLocaleString()}`
      ).join("\n");
      await sendSimpleMessage(chatId, `*Recent Orders*\n\n${body}`);
      return;
    }

    if (data === "staff:logout") {
      await pool.query(
        `UPDATE staff_users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?`,
        [chatId]
      );
      await answerCallbackQuery(callbackQueryId, "Logged out.");
      await sendRoleMenu(chatId);
      return;
    }

    // ── Main menu navigation ──────────────────────────────────────
    if (data === "menu_order") {
      await answerCallbackQuery(callbackQueryId);
      await startOrderFlow(chatId);
      return;
    }

    if (data === "menu_myorders") {
      await answerCallbackQuery(callbackQueryId);
      await sendCustomerOrders(chatId);
      return;
    }

    if (data === "menu_track") {
      userState.set(chatId, { step: "awaiting_track_id", data: {} });
      await answerCallbackQuery(callbackQueryId, "Send the order ID to track.");
      return;
    }

    if (data === "menu_help") {
      await answerCallbackQuery(callbackQueryId);
      await sendSimpleMessage(chatId,
        "*Help*\n\nUse /start to return to the main menu.\nUse /order to place a new order.\nUse /track ORD-... to check order status.\n\nFor support, contact asellamoringa@gmail.com"
      );
      return;
    }

    // ── Vendor actions ────────────────────────────────────────────
    if (data === "vendor:refresh") {
      await answerCallbackQuery(callbackQueryId);
      await sendVendorMenu(chatId);
      return;
    }

    // ── City selection ────────────────────────────────────────────
    if (data?.startsWith("city:")) {
      const city = data.replace("city:", "");
      const state = userState.get(chatId);
      if (!state || state.step !== "awaiting_city") {
        await answerCallbackQuery(callbackQueryId, "Session expired. Start again with /order", true);
        return;
      }
      state.data.city = city;
      state.step = "awaiting_location";
      userState.set(chatId, state);
      await answerCallbackQuery(callbackQueryId, `City: ${city}`);
      await sendSimpleMessage(chatId, "Enter your *specific location* (sub-city, area, landmark).");
      return;
    }

    // ── Order type selection ──────────────────────────────────────
    if (data?.startsWith("otype:")) {
      const otype = data.replace("otype:", "");
      const state = userState.get(chatId);
      if (!state || state.step !== "awaiting_order_type") {
        await answerCallbackQuery(callbackQueryId, "Session expired. Start again with /order", true);
        return;
      }
      state.data.orderType = otype;
      state.data.items = [];
      state.step = "awaiting_item_choice";
      userState.set(chatId, state);
      await answerCallbackQuery(callbackQueryId, otype === "delivery" ? "Delivery" : "Pickup");
      await showProductCatalog(chatId, 0);
      return;
    }

    // ── Product page navigation ───────────────────────────────────
    if (data?.startsWith("page:")) {
      const page = parseInt(data.replace("page:", ""), 10);
      const state = userState.get(chatId);
      if (!state || (state.step !== "awaiting_item_choice" && state.step !== "awaiting_item_qty")) {
        await answerCallbackQuery(callbackQueryId, "Session expired.", true);
        return;
      }
      state.step = "awaiting_item_choice";
      userState.set(chatId, state);
      await answerCallbackQuery(callbackQueryId);
      await showProductCatalog(chatId, page);
      return;
    }

    // ── Product selection ─────────────────────────────────────────
    if (data?.startsWith("prod:")) {
      const productName = data.replace("prod:", "");
      await answerCallbackQuery(callbackQueryId);
      const state = userState.get(chatId);
      if (!state) {
        await sendSimpleMessage(chatId, "Session expired. Start again with /order");
        return;
      }
      state.step = "awaiting_size";
      state.data.selectedProductName = productName;
      userState.set(chatId, state);
      await showSizes(chatId, productName);
      return;
    }

    // ── Size selection ────────────────────────────────────────────
    if (data?.startsWith("size:")) {
      const variantId = data.replace("size:", "");
      const [rows] = await pool.query(
        `SELECT name, package_size, price FROM products WHERE id = ? AND active = TRUE`,
        [variantId]
      ) as [any[], any];
      if (!rows.length) {
        await answerCallbackQuery(callbackQueryId, "Product not found", true);
        return;
      }
      const variant = rows[0];
      const state = userState.get(chatId);
      if (!state) {
        await answerCallbackQuery(callbackQueryId, "Session expired.", true);
        return;
      }
      state.data.pendingItem = {
        name: variant.name,
        size: variant.package_size,
        price: Number(variant.price),
      };
      state.step = "awaiting_item_qty";
      userState.set(chatId, state);
      await answerCallbackQuery(callbackQueryId, `${variant.name} [${variant.package_size}]`);
      await sendSimpleMessage(chatId, `How many *${variant.name} [${variant.package_size}]* would you like? (Enter a number)`);
      return;
    }

    // ── Add more items ────────────────────────────────────────────
    if (data === "addmore:yes") {
      const state = userState.get(chatId);
      if (!state) {
        await answerCallbackQuery(callbackQueryId, "Session expired.", true);
        return;
      }
      state.step = "awaiting_item_choice";
      userState.set(chatId, state);
      await answerCallbackQuery(callbackQueryId);
      await showProductCatalog(chatId, 0);
      return;
    }

    if (data === "addmore:no") {
      const state = userState.get(chatId);
      if (!state) {
        await answerCallbackQuery(callbackQueryId, "Session expired.", true);
        return;
      }
      await answerCallbackQuery(callbackQueryId);
      await confirmOrderSummary(chatId, state);
      return;
    }

    if (data === "order_done_items") {
      const state = userState.get(chatId);
      if (!state || !state.data.items?.length) {
        await answerCallbackQuery(callbackQueryId, "Add at least one item.", true);
        return;
      }
      await answerCallbackQuery(callbackQueryId);
      await confirmOrderSummary(chatId, state);
      return;
    }

    // ── Confirm / Cancel order ────────────────────────────────────
    if (data === "confirm:yes") {
      const state = userState.get(chatId);
      if (!state) {
        await answerCallbackQuery(callbackQueryId, "Session expired.", true);
        return;
      }
      await answerCallbackQuery(callbackQueryId, "Placing your order...");
      await submitInteractiveOrder(chatId, state);
      return;
    }

    if (data === "confirm:no") {
      userState.delete(chatId);
      await answerCallbackQuery(callbackQueryId, "Order cancelled.");
      await sendSimpleMessage(chatId, "Order cancelled. Use /start to begin again.");
      return;
    }

    // ── Delivery acceptance ────────────────────────────────────────
    if (data.startsWith("delivery_accept_")) {
      console.log(`[delivery_accept] Handling accept for data: ${data}`);
      try {
        const orderId = data.replace("delivery_accept_", "");
        const driverChatId = from?.id;
        const driverTag = from?.username;
        const driverDisplayName = from?.first_name || "Driver";
        const driverUsername = driverTag || `delivery_${driverChatId || 'unknown'}`;
        const messageId = message?.message_id;
        const groupChatId = process.env.TELEGRAM_DELIVERY_GROUP_ID;

        console.log(`[delivery_accept] orderId: ${orderId}, driverUsername: ${driverUsername}, messageId: ${messageId}`);

        // Atomic update: only update if it's currently unassigned
        console.log(`[delivery_accept] Executing DB UPDATE...`);
        const [updateResult] = await pool.query(
          `UPDATE orders 
           SET status = 'In Transit', assigned_to = ?, delivery_message_id = ? 
           WHERE id = ? AND assigned_to IS NULL AND status NOT IN ('In Transit', 'Delivered')`,
          [driverUsername, messageId, orderId]
        ) as [any, any];
        
        console.log(`[delivery_accept] DB UPDATE affectedRows: ${updateResult.affectedRows}`);

        // ── Always try to remove buttons from the group message ──────
        // IMPORTANT: use the chat.id the message actually came from, not the
        // env var. If TELEGRAM_DELIVERY_GROUP_ID doesn't exactly match the
        // group's real chat id (e.g. after a group→supergroup migration, or
        // a stray type/whitespace mismatch), editMessageText/editMessageReplyMarkup
        // will silently fail against the wrong chat, and the buttons never disappear.
        async function removeButtons(text: string) {
          const chatIdForEdit = message?.chat?.id ?? groupChatId;
          console.log(`[delivery_accept] removeButtons called with chatIdForEdit: ${chatIdForEdit} (env groupChatId: ${groupChatId}), messageId: ${messageId}`);
          if (!messageId || !chatIdForEdit) {
            console.warn(`[delivery_accept] Skipping removeButtons because messageId or chatId is missing!`);
            return;
          }
          try {
            console.log(`[delivery_accept] Calling editMessageText...`);
            const r = await editMessageText(chatIdForEdit, messageId, text, { inline_keyboard: [] });
            if (!r || !r.ok) {
              console.warn(`[delivery_accept] editMessageText returned not ok, falling back to editMessageReplyMarkup...`);
              await editMessageReplyMarkup(chatIdForEdit, messageId, { inline_keyboard: [] });
            }
          } catch (err) {
            console.error(`[delivery_accept] Error in removeButtons:`, err);
            await editMessageReplyMarkup(chatIdForEdit, messageId, { inline_keyboard: [] }).catch(() => {});
          }
        }

        if (updateResult.affectedRows === 0) {
          console.log(`[delivery_accept] Order already taken or doesn't exist.`);
          const [rows] = await pool.query(`SELECT assigned_to FROM orders WHERE id = ?`, [orderId]) as [any[], any];
          const takenBy = rows[0]?.assigned_to;
          if (takenBy) {
            await removeButtons(`${message?.text || "Order Details"}\n\nAccepted by: @${escapeMarkdown(takenBy)}`);
          }
          console.log(`[delivery_accept] Calling answerCallbackQuery (Already taken)`);
          await answerCallbackQuery(callbackQueryId, "This order has already been taken by another driver.", true);
          return;
        }

        // Claim succeeded — update message in group and answer callback
        console.log(`[delivery_accept] Claim successful! Updating message...`);
        await removeButtons(`${message?.text || "Order Details"}\n\nAccepted by: ${escapeMarkdown(driverDisplayName)} (@${escapeMarkdown(driverUsername)})`);
        
        console.log(`[delivery_accept] Calling answerCallbackQuery (Success)`);
        await answerCallbackQuery(callbackQueryId, "Accepted! Sending you the details...", false);

        // ── Non-critical post-claim steps ────────────────────────────
        try {
          console.log(`[delivery_accept] Running post-claim steps...`);
          const [orders] = await pool.query(`SELECT * FROM orders WHERE id = ?`, [orderId]) as [any[], any];
          const order = orders[0];

          await pool.query(
            `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
             VALUES (?, ?, ?, 'In Transit', ?, 'Accepted by delivery from Telegram', NOW())`,
            [crypto.randomUUID(), orderId, 'Pending', driverUsername]
          );

          void mirrorOrderStatusToSheets({
            orderId,
            oldStatus: "Pending",
            newStatus: "In Transit",
            changedBy: driverUsername ?? "delivery_driver",
            note: "Accepted by delivery from Telegram",
          });

          await pool.query(
            `INSERT INTO delivery_assignments (order_id, driver_username, telegram_message_id, claimed_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE driver_username = VALUES(driver_username), claimed_at = NOW()`,
            [orderId, driverUsername, messageId]
          );

          void mirrorDeliveryAssignmentToSheets({
            orderId,
            driverUsername,
            messageId: messageId ?? null,
          });

          const [items] = await pool.query(`SELECT * FROM order_items WHERE order_id = ?`, [orderId]) as [any[], any];
          console.log(`[delivery_accept] Sending details to driver ${driverChatId}`);
          const dmSent = await sendDetailsToAssignedDriver(driverChatId, { ...order, items });

          if (!dmSent) {
            // Driver hasn't started the bot in private — can't DM them.
            // Post the full order details as a reply in the delivery group so
            // they still receive the information immediately.
            console.warn(`[delivery_accept] DM to driver ${driverChatId} failed (bot not started). Falling back to group reply.`);
            const fallbackGroupId = message?.chat?.id ?? process.env.TELEGRAM_DELIVERY_GROUP_ID;
            if (fallbackGroupId) {
              await sendDetailsToGroupAsReply(
                fallbackGroupId,
                messageId,
                driverDisplayName,
                { ...order, items }
              );
            }
          }

          console.log(`[delivery_accept] Notifying customer...`);
          void sendTelegramToCustomer({
            phone: order.phone,
            message: `Hi ${order.customer_name}, your order *${orderId}* is now *In Transit*.`,
          });
          console.log(`[delivery_accept] Fully completed successfully!`);
        } catch (err) {
          console.error("[delivery_accept] Post-claim steps failed:", err);
        }
      } catch (err) {
        console.error(`[delivery_accept] CRITICAL ERROR IN HANDLER:`, err);
        // Try to answer so it stops spinning!
        await answerCallbackQuery(callbackQueryId, "An error occurred.", true).catch(console.error);
      }
      return;
    }

    if (data.startsWith("delivery_reject_")) {
      console.log(`[delivery_reject] Handling reject for data: ${data}`);
      await answerCallbackQuery(callbackQueryId, "Order rejected. Thank you.", false);
      return;
    }

    // ── Vendor PO callbacks (existing) ─────────────────────────────
    if (data.startsWith("po_accept_")) {
      const orderId = data.replace("po_accept_", "");
      await pool.query(
        `UPDATE vendor_orders SET status = 'approved', updated_at = NOW() WHERE order_id = ?`,
        [orderId]
      );
      await answerCallbackQuery(callbackQueryId, "PO Accepted!", false);
      return;
    }

    if (data.startsWith("po_decline_")) {
      const orderId = data.replace("po_decline_", "");
      await pool.query(
        `UPDATE vendor_orders SET status = 'cancelled', updated_at = NOW() WHERE order_id = ?`,
        [orderId]
      );
      await answerCallbackQuery(callbackQueryId, "PO Declined", false);
      return;
    }

    await answerCallbackQuery(callbackQueryId, "Processed", false);
  } catch (err) {
    console.error("[handleCallback] Error:", err);
    await answerCallbackQuery(callbackQueryId, "Error processing", true);
  }
}

async function handleMessage(message: any): Promise<void> {
  const { text, chat, from } = message;

  try {
    if (!text || (chat?.type && chat.type !== "private")) return;

    await upsertTelegramUser(message);
    const chatId = chat.id as number;

    // ── Check active conversation state ──────────────────────────
    const state = userState.get(chatId);
    if (state) {
      if (state.step === "awaiting_name") {
        state.data.name = text.trim();
        state.step = "awaiting_phone";
        userState.set(chatId, state);
        await sendSimpleMessage(chatId, "Great! Now send me your *phone number* (e.g., +251911234567).");
        return;
      }

      if (state.step === "awaiting_phone") {
        state.data.phone = text.trim();
        state.step = "awaiting_city";
        userState.set(chatId, state);
        await showCityOptions(chatId);
        return;
      }

      if (state.step === "awaiting_location") {
        state.data.location = text.trim();
        state.step = "awaiting_order_type";
        userState.set(chatId, state);
        await showOrderTypeOptions(chatId);
        return;
      }

      if (state.step === "awaiting_item_qty") {
        const qty = parseInt(text.trim(), 10);
        if (isNaN(qty) || qty < 1) {
          await sendSimpleMessage(chatId, "Please enter a valid quantity (number greater than 0).");
          return;
        }
        const pending = state.data.pendingItem as { name: string; size: string; price: number };
        state.data.items.push({ ...pending, qty });
        delete state.data.pendingItem;
        userState.set(chatId, state);
        await showAddMorePrompt(chatId);
        return;
      }

      if (state.step === "awaiting_staff_username") {
        state.data.username = text.trim();
        state.step = "awaiting_staff_password";
        userState.set(chatId, state);
        await sendSimpleMessage(chatId, "Enter your *password*:");
        return;
      }

      if (state.step === "awaiting_staff_password") {
        const username = state.data.username;
        const password = text.trim();
        const [rows] = await pool.query(
          `SELECT id, full_name, password_hash, role FROM staff_users
           WHERE (username = ? OR email = ?) AND active = TRUE AND deleted_at IS NULL LIMIT 1`,
          [username, username]
        ) as [any[], any];
        const user = rows[0];
        const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
        if (!valid) {
          await sendSimpleMessage(chatId, "Invalid username or password. Try again with /start.");
          userState.delete(chatId);
          return;
        }
        state.data.staffId = user.id;
        state.data.fullName = user.full_name;
        state.data.role = user.role;
        state.step = "confirm_identity";
        userState.set(chatId, state);
        await sendWithButtons(chatId,
          `Welcome *${user.full_name}* (${user.role}).\n\nPlease confirm your identity to access staff features.`,
          [
            [{ text: "Confirm Identity", callback_data: "staff:confirm" }],
            [{ text: "Cancel", callback_data: "staff:cancel" }],
          ]
        );
        return;
      }

      if (state.step === "confirm_identity") {
        await sendSimpleMessage(chatId, "Please tap the Confirm Identity button above.");
        return;
      }

      if (state.step === "awaiting_driver_username") {
        state.data.username = text.trim();
        state.step = "awaiting_driver_password";
        userState.set(chatId, state);
        await sendSimpleMessage(chatId, "Enter your *password*:");
        return;
      }

      if (state.step === "awaiting_driver_password") {
        const username = state.data.username;
        const password = text.trim();
        const [rows] = await pool.query(
          `SELECT id, full_name, password_hash, role FROM staff_users
           WHERE (username = ? OR email = ?) AND role = 'delivery' AND active = TRUE AND deleted_at IS NULL LIMIT 1`,
          [username, username]
        ) as [any[], any];
        const user = rows[0];
        const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
        if (!valid) {
          await sendSimpleMessage(chatId, "Invalid driver credentials. Try again with /start.");
          userState.delete(chatId);
          return;
        }
        userState.delete(chatId);
        await sendSimpleMessage(chatId,
          `Welcome *${user.full_name}* — you are registered as a driver.\n\nYou'll receive delivery assignments here automatically.`
        );
        return;
      }

      if (state.step === "awaiting_track_id") {
        userState.delete(chatId);
        const orderId = text.trim();
        await sendOrderStatus(chatId, orderId);
        return;
      }

      if (state.step === "awaiting_link_phone") {
        const phone = text.trim();
        if (!phone) {
          await sendSimpleMessage(chatId, "Please send your phone number (e.g., +251911234567).");
          return;
        }
        const fallbackName = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "Telegram Customer";
        const outcome = await linkCustomerChat(phone, chatId, fallbackName);
        userState.delete(chatId);
        await sendSimpleMessage(chatId, describeLinkOutcome(outcome, phone));
        return;
      }

      // Unrecognized step — reset
      userState.delete(chatId);
    }

    // ── Commands (no active state) ────────────────────────────────
    if (text === "/start" || text === "/help") {
      // Check if this chat is linked to a verified staff member
      const [staffRows] = await pool.query(
        `SELECT id, full_name, role FROM staff_users
         WHERE telegram_chat_id = ? AND active = TRUE AND deleted_at IS NULL LIMIT 1`,
        [chatId]
      ) as [any[], any];
      if (staffRows[0]) {
        await sendStaffRoleMenu(chatId, staffRows[0].role, staffRows[0].full_name);
        return;
      }
      await sendRoleMenu(chatId);
      return;
    }

    if (text === "/store" || text === "/shop" || text === "store" || text === "shop") {
      const storeUrl = getStoreUrl();
      await sendWithButtons(chatId,
        "*Asella Organic Store*\n\nBrowse 100% natural health supplements and organic remedies directly inside Telegram:",
        [
          [{ text: "Open Organic Store", web_app: { url: storeUrl } }],
          [{ text: "Track Existing Order", callback_data: "menu_track" }],
        ]
      );
      return;
    }

    if (text === "/logout") {
      await pool.query(
        `UPDATE staff_users SET telegram_chat_id = NULL WHERE telegram_chat_id = ?`,
        [chatId]
      );
      await sendSimpleMessage(chatId, "You have been logged out from staff features. Use /start to continue.");
      return;
    }

    if (text.startsWith("/link")) {
      const phone = text.replace("/link", "").trim();
      if (!phone) {
        userState.set(chatId, { step: "awaiting_link_phone", data: {} });
        await sendSimpleMessage(chatId, "Send me your *phone number* to link (e.g., +251911234567).");
        return;
      }

      const fallbackName = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "Telegram Customer";
      const outcome = await linkCustomerChat(phone, chatId, fallbackName);
      await sendSimpleMessage(chatId, describeLinkOutcome(outcome, phone));
      return;
    }

    if (text === "/order" || text === "order") {
      await startOrderFlow(chatId);
      return;
    }

    if (text.startsWith("/order\n") || text.toLowerCase().startsWith("order\n")) {
      const order = parseOrderMessage(text);
      if (!order) {
        await sendSimpleMessage(chatId, ORDER_HELP);
        return;
      }

      try {
        const created = await createTelegramOrder(order, chatId);
        await sendSimpleMessage(
          chatId,
          `Thank you ${order.customer_name}. Your order *${created.id}* has been received.\nTotal: ETB ${created.total.toLocaleString()}.\nWe will message you here when the status changes.`
        );
      } catch (err: any) {
        await sendSimpleMessage(chatId, `I could not create that order: ${err.message}\n\n${ORDER_HELP}`);
      }
      return;
    }

    if (text === "/myorders") {
      await sendCustomerOrders(chatId);
      return;
    }

    if (text.startsWith("/track")) {
      const orderId = text.replace("/track", "").trim();
      if (!orderId) {
        await sendSimpleMessage(chatId, "Send /track followed by your order ID, for example: /track ORD-20260630-ABCD");
        return;
      }
      await sendOrderStatus(chatId, orderId);
      return;
    }

    // Unrecognized text — show role menu
    await sendRoleMenu(chatId);
  } catch (err) {
    console.error("[handleMessage] Error:", err);
    if (chat?.id) {
      await sendSimpleMessage(chat.id, "Sorry, something went wrong while processing your message. Please try again.");
    }
  }
}

router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  if (!verifyTelegramWebhook(secretHeader)) {
    console.warn("[telegram webhook] Rejected: invalid secret token");
    res.sendStatus(200);
    return;
  }

  let update: any = req.body;
  if (Buffer.isBuffer(update)) {
    try {
      update = JSON.parse(update.toString("utf8"));
    } catch (err) {
      console.error("[telegram webhook] Rejected: invalid JSON body", err);
      res.sendStatus(200);
      return;
    }
  }

  const updateId: number | undefined = update?.update_id;
  if (!updateId) {
    console.warn("[telegram webhook] Rejected: missing update_id");
    res.sendStatus(200);
    return;
  }

  try {
    const [existing] = await pool.query(
      `SELECT update_id FROM webhook_events WHERE update_id = ?`,
      [updateId]
    ) as [any[], any];

    if (existing.length > 0) {
      console.warn(`[telegram webhook] Duplicate update_id ${updateId} - skipping`);
      res.sendStatus(200);
      return;
    }

    // Only apply staleness protection to plain messages (e.g. a backlog of
    // /start or text messages replayed after an outage). Never apply it to
    // callback_query taps: Telegram only ever generates those in real time,
    // the instant a button is pressed — the only "date" available on them
    // is the *original* message's post time, which has nothing to do with
    // when the tap happened. An old order sitting in the group must stay
    // tappable indefinitely.
    const messageDate: number | undefined = update?.message?.date;

    if (messageDate) {
      const ageSeconds = Math.floor(Date.now() / 1000) - messageDate;
      const maxAgeSeconds = 5 * 60;
      if (ageSeconds > maxAgeSeconds) {
        console.warn(`[telegram webhook] Stale update_id ${updateId} (${ageSeconds}s old) - recording and skipping`);
        await pool.query(
          `INSERT IGNORE INTO webhook_events (update_id) VALUES (?)`,
          [updateId]
        );
        res.sendStatus(200);
        return;
      }
    }

    await pool.query(
      `INSERT IGNORE INTO webhook_events (update_id) VALUES (?)`,
      [updateId]
    );
  } catch (err) {
    console.error("[telegram webhook] Replay-protection DB error:", err);
    res.sendStatus(200);
    return;
  }

  try {
    if (update?.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update?.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error("[telegram webhook] Error:", err);
  }
  res.sendStatus(200);
});

// ─── Webhook registration endpoint (admin) ────────────────────────────
router.get("/set-webhook", async (_req: Request, res: Response): Promise<void> => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || !secret) {
      res.status(400).json({ success: false, error: "TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set" });
      return;
    }
    // Determine public URL from the request or env
    const baseUrl = process.env.PUBLIC_URL || `${_req.protocol}://${_req.get("host")}`;
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;

    const result = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(secret)}&drop_pending_updates=true`
    );
    const data = await result.json();

    if (data.ok) {
      const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
      res.json({ success: true, webhookUrl, result: data, webhookInfo: info });
    } else {
      res.status(500).json({ success: false, error: data.description, webhookUrl });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Telegram Mini App Endpoints ─────────────────────────────────────

// POST /api/telegram/validate-init-data — Validates Telegram WebApp initData
router.post("/validate-init-data", async (req: Request, res: Response): Promise<void> => {
  try {
    const initData = (req.body?.initData || req.headers["x-telegram-init-data"]) as string;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      res.status(500).json({ success: false, error: "Bot token not configured on server" });
      return;
    }

    if (!initData) {
      res.status(400).json({ success: false, error: "Missing initData payload" });
      return;
    }

    const validation = validateTelegramInitData(initData, token);
    if (!validation.valid || !validation.user) {
      res.status(401).json({ success: false, error: validation.error || "Invalid authentication data" });
      return;
    }

    const tgUser = validation.user;

    // Upsert into telegram_users table
    await pool.query(
      `INSERT INTO telegram_users (chat_id, username, first_name, last_name, registered_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         first_name = VALUES(first_name),
         last_name = VALUES(last_name),
         last_seen = NOW()`,
      [tgUser.id, tgUser.username ?? null, tgUser.first_name, tgUser.last_name ?? null]
    );

    // Look up customer linked to this chat_id
    const [customers] = await pool.query(
      `SELECT id, name, phone, city, location, email FROM customers WHERE telegram_chat_id = ? LIMIT 1`,
      [tgUser.id]
    ) as [any[], any];

    res.json({
      success: true,
      data: {
        user: tgUser,
        customer: customers[0] || null,
        startParam: validation.startParam,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to validate Telegram user" });
  }
});

// POST /api/telegram/app-order — Mini App order placement
router.post("/app-order", async (req: Request, res: Response): Promise<void> => {
  try {
    const initData = (req.body?.initData || req.headers["x-telegram-init-data"]) as string;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    let verifiedChatId: number | null = null;

    if (initData && token) {
      const validation = validateTelegramInitData(initData, token);
      if (validation.valid && validation.user) {
        verifiedChatId = validation.user.id;
      }
    }

    const parsed = CreateOrderSchema.safeParse({
      ...req.body,
      source: "telegram",
    });

    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      res.status(422).json({
        success: false,
        error: firstError ?? "Order validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { referral_code, items, ...fields } = parsed.data;
    const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomId(4)}`;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const customerId = crypto.randomUUID();
      await connection.query(
        `INSERT INTO customers (id, phone, name, city, location, gender, age_group, telegram_chat_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           city = VALUES(city),
           location = VALUES(location),
           telegram_chat_id = COALESCE(VALUES(telegram_chat_id), telegram_chat_id),
           updated_at = NOW()`,
        [
          customerId,
          fields.phone,
          fields.customer_name,
          fields.city,
          fields.location,
          fields.gender ?? null,
          fields.age_group ?? null,
          verifiedChatId,
        ]
      );

      const [custRows] = await connection.query(
        `SELECT id FROM customers WHERE phone = ?`,
        [fields.phone]
      ) as [any[], any];

      await connection.query(
        `INSERT INTO orders
           (id, source, customer_name, phone, location, city, gender, age_group,
            order_type, status, total, notes, customer_id, delivery_date, payment_status)
         VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, 'Pending')`,
        [
          orderId,
          fields.customer_name,
          fields.phone,
          fields.location,
          fields.city,
          fields.gender ?? null,
          fields.age_group ?? null,
          fields.order_type,
          total,
          fields.notes ?? null,
          custRows[0].id,
          fields.delivery_date ?? null,
        ]
      );

      for (const item of items) {
        const [prodRows] = await connection.query(
          `SELECT id, unit_cost FROM products WHERE LOWER(name) = LOWER(?) AND package_size = ? LIMIT 1`,
          [item.name, item.package_size]
        ) as [any[], any];
        const unitCost = prodRows.length ? Number(prodRows[0].unit_cost) : 0;
        const productId = prodRows.length ? prodRows[0].id : null;

        await connection.query(
          `INSERT INTO order_items (id, order_id, item_name, package_size, quantity, unit_price, unit_cost, product_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), orderId, item.name, item.package_size, item.quantity, item.unit_price, unitCost, productId]
        );
      }

      await connection.query(
        `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
         VALUES (?, ?, NULL, 'Pending', 'telegram-miniapp', 'Order placed via Telegram Mini App', NOW())`,
        [crypto.randomUUID(), orderId]
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Delivery routing to staff/delivery group
    if (fields.order_type === "delivery") {
      void sendToDeliveryGroup({ id: orderId, ...fields, total, items });
    }

    // Direct Telegram Receipt Message to Customer
    if (verifiedChatId) {
      const itemsText = items
        .map((i, idx) => `${idx + 1}. ${i.name} [${i.package_size}] x ${i.quantity} - ETB ${(i.quantity * i.unit_price).toLocaleString()}`)
        .join("\n");
      const receipt = [
        `*Order Confirmation*`,
        `----------------------------------`,
        `*Order ID:* ${orderId}`,
        `*Customer:* ${fields.customer_name}`,
        `*Phone:* ${fields.phone}`,
        `*Location:* ${fields.location}, ${fields.city}`,
        `*Delivery Type:* ${fields.order_type === "delivery" ? "Delivery" : "Store Pickup"}`,
        ``,
        `*Items Ordered:*`,
        itemsText,
        ``,
        `*Total:* ETB ${total.toLocaleString()}`,
        `----------------------------------`,
        `Thank you for choosing Asella Organic. You will receive real-time updates directly in this chat as your order is prepared and delivered.`,
      ].join("\n");

      void sendSimpleMessage(verifiedChatId, receipt);
    }

    res.status(201).json({
      success: true,
      data: {
        id: orderId,
        total,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to create order" });
  }
});

// GET /api/telegram/my-orders — Fetch the authenticated customer's orders
// Supports ?search= (order id / product name), ?status= (or a status group)
// and ?page= for the Orders tab. Requires verified Telegram initData.
router.get("/my-orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = authenticateMiniApp(req, res);
    if (!auth || !auth.ok) return;
    const chatId = auth.chatId;

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const offset = (page - 1) * limit;

    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";

    const conditions: string[] = ["o.deleted_at IS NULL", "c.telegram_chat_id = ?"];
    const params: any[] = [chatId];

    if (statusFilter && statusFilter !== "all") {
      const statuses = resolveStatusFilter(statusFilter);
      if (statuses.length === 0) {
        res.json({ success: true, data: [], meta: { total: 0, page, limit, pages: 0 } });
        return;
      }
      conditions.push(`o.status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }

    if (search) {
      conditions.push("(o.id LIKE ? OR o.customer_name LIKE ? OR o.notes LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const where = conditions.join(" AND ");

    // Search also matches products inside an order, so filter those orders in.
    const searchCondition = search
      ? `EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.item_name LIKE ?)`
      : null;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM orders o
       JOIN customers c ON c.phone = o.phone
       WHERE ${where}${searchCondition ? ` AND ${searchCondition}` : ""}`,
      params
    ) as [any[], any];

    const total = Number(countRows[0]?.total ?? 0);

    const [orders] = await pool.query(
      `SELECT o.id, o.status, o.total, o.order_type, o.city, o.location,
              o.created_at, o.payment_status, o.customer_name
       FROM orders o
       JOIN customers c ON c.phone = o.phone
       WHERE ${where}${searchCondition ? ` AND ${searchCondition}` : ""}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ) as [any[], any];

    const orderIds = orders.map((o: any) => o.id);
    const itemsByOrder: Record<string, any[]> = {};

    if (orderIds.length > 0) {
      const [itemRows] = await pool.query(
        `SELECT order_id, item_name, package_size, quantity, unit_price
         FROM order_items WHERE order_id IN (?)`,
        [orderIds]
      ) as [any[], any];

      for (const item of itemRows) {
        const list = itemsByOrder[item.order_id] ?? [];
        list.push(item);
        itemsByOrder[item.order_id] = list;
      }
    }

    const data = orders.map((o: any) => ({
      ...o,
      items: itemsByOrder[o.id] || [],
    }));

    res.json({
      success: true,
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to retrieve orders" });
  }
});

// GET /api/telegram/profile — Mini App Account tab
router.get("/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = authenticateMiniApp(req, res);
    if (!auth || !auth.ok) return;
    const chatId = auth.chatId;

    await upsertTelegramProfile(
      chatId,
      {
        username: auth.user.username ?? null,
        first_name: auth.user.first_name,
        last_name: auth.user.last_name ?? null,
      },
      false
    );

    const [userRows] = await pool.query(
      `SELECT display_name, phone, city, location, profile_updated_at
       FROM telegram_users WHERE chat_id = ? LIMIT 1`,
      [chatId]
    ) as [any[], any];

    const stored = userRows[0] ?? {};

    // Fall back to the customer record so the form is never blank for a
    // customer who already has delivery history.
    const [customerRows] = await pool.query(
      `SELECT name, phone, city, location FROM customers
       WHERE telegram_chat_id = ? LIMIT 1`,
      [chatId]
    ) as [any[], any];
    const customer = customerRows[0] ?? null;

    const displayName =
      stored.display_name ||
      customer?.name ||
      [auth.user.first_name, auth.user.last_name].filter(Boolean).join(" ");

    const [statsRows] = await pool.query(
      `SELECT
         COUNT(*) AS order_count,
         COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled', 'Returned') THEN o.total ELSE 0 END), 0) AS total_spent,
         COALESCE(SUM(CASE WHEN o.status = 'Delivered' THEN 1 ELSE 0 END), 0) AS delivered_count,
         COALESCE(SUM(CASE WHEN o.status IN ('Pending', 'Confirmed', 'Packed', 'In Transit', 'Processing', 'Out for Delivery') THEN 1 ELSE 0 END), 0) AS active_count
       FROM orders o
       JOIN customers c ON c.phone = o.phone
       WHERE c.telegram_chat_id = ? AND o.deleted_at IS NULL`,
      [chatId]
    ) as [any[], any];
    const stats = statsRows[0] ?? {};

    res.json({
      success: true,
      data: {
        chat_id: chatId,
        telegram: {
          username: auth.user.username ?? null,
          first_name: auth.user.first_name,
          last_name: auth.user.last_name ?? null,
          photo_url: auth.user.photo_url ?? null,
          is_premium: auth.user.is_premium ?? false,
        },
        profile: {
          display_name: displayName,
          phone: stored.phone ?? customer?.phone ?? "",
          city: stored.city ?? customer?.city ?? "",
          location: stored.location ?? customer?.location ?? "",
          updated_at: stored.profile_updated_at ?? null,
        },
        stats: {
          order_count: Number(stats.order_count ?? 0),
          delivered_count: Number(stats.delivered_count ?? 0),
          active_count: Number(stats.active_count ?? 0),
          total_spent: Number(stats.total_spent ?? 0),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to load profile" });
  }
});

// PUT /api/telegram/profile — Persist the editable Account tab profile
router.put("/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const auth = authenticateMiniApp(req, res);
    if (!auth || !auth.ok) return;
    const chatId = auth.chatId;

    const parsed = TelegramProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      res.status(422).json({
        success: false,
        error: firstError ?? "Profile validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { display_name, phone, city, location } = parsed.data;
    const normalizedPhone = normalizePhone(phone);

    await upsertTelegramProfile(
      chatId,
      {
        username: auth.user.username ?? null,
        first_name: auth.user.first_name,
        last_name: auth.user.last_name ?? null,
        display_name,
        phone: normalizedPhone,
        city,
        location,
      },
      true
    );

    res.json({
      success: true,
      data: {
        chat_id: chatId,
        profile: {
          display_name,
          phone: normalizedPhone,
          city,
          location,
          updated_at: new Date().toISOString(),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to update profile" });
  }
});

// POST /api/telegram/set-menu-button — Sets the chat menu button in Telegram
router.post("/set-menu-button", async (_req: Request, res: Response): Promise<void> => {
  try {
    const storeUrl = getStoreUrl();
    const result = await setChatMenuButton(storeUrl, "Store");

    if (result && result.ok) {
      res.json({ success: true, menuButtonUrl: storeUrl, result });
    } else {
      res.status(500).json({ success: false, error: result?.description || "Failed to set menu button", storeUrl });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Error setting menu button" });
  }
});

// GET /api/telegram/health — Bot health & webhook diagnostics
router.get("/health", async (_req: Request, res: Response): Promise<void> => {
  try {
    const me = await getBotMe();
    const webhookInfo = await getWebhookInfo();

    if (!me || !me.ok) {
      res.status(503).json({
        status: "error",
        error: me?.description || "Failed to reach Telegram Bot API",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      status: "ok",
      bot: me.result,
      webhook: webhookInfo?.result || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: "error",
      error: err.message || "Bot health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/telegram/info — Bot metadata
router.get("/info", async (_req: Request, res: Response): Promise<void> => {
  try {
    const me = await getBotMe();
    if (!me || !me.ok) {
      res.status(503).json({ success: false, error: me?.description || "Failed to fetch bot info" });
      return;
    }
    res.json({ success: true, data: me.result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/telegram/set-webhook — Sets the production webhook URL
router.post("/set-webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const webhookUrl = req.body?.url || `${(process.env.PUBLIC_URL || "https://asellaorganic.com").replace(/\/$/, "")}/api/telegram/webhook`;
    const secret = req.body?.secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;

    const result = await setWebhook(webhookUrl, secret);
    if (result && result.ok) {
      res.json({ success: true, url: webhookUrl, result });
    } else {
      res.status(500).json({ success: false, error: result?.description || "Failed to set webhook", result });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/telegram/delete-webhook — Deletes webhook
router.post("/delete-webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const dropPending = req.body?.dropPendingUpdates !== false;
    const result = await deleteWebhook(dropPending);
    if (result && result.ok) {
      res.json({ success: true, result });
    } else {
      res.status(500).json({ success: false, error: result?.description || "Failed to delete webhook", result });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/telegram/configure-bot — Triggers full bot synchronization
router.post("/configure-bot", async (_req: Request, res: Response): Promise<void> => {
  try {
    const success = await initBotConfiguration();
    if (success) {
      res.json({ success: true, message: "Bot configuration and commands synchronized successfully." });
    } else {
      res.status(500).json({ success: false, error: "Bot synchronization failed. Check logs and TELEGRAM_BOT_TOKEN." });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/telegram/send-push — Pushes notification to chat
router.post("/send-push", async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId, message } = req.body || {};
    if (!chatId || !message) {
      res.status(400).json({ success: false, error: "Missing chatId or message" });
      return;
    }

    const sent = await sendTelegramPush({ chatId, message });
    if (sent) {
      res.json({ success: true, chatId });
    } else {
      res.status(500).json({ success: false, error: "Failed to deliver Telegram push message" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;