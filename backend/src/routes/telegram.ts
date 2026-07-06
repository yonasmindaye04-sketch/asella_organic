import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { CreateOrderSchema } from "../schemas/index.js";
import { randomId } from "../lib/security.js";
import {
  answerCallbackQuery,
  editMessageText,
  sendDetailsToAssignedDriver,
  sendSimpleMessage,
  sendTelegramToCustomer,
  sendToDeliveryGroup,
  sendWithButtons,
} from "../lib/telegram.js";

const router = Router();

const verifyTelegramWebhook = (token?: string) => token === process.env.TELEGRAM_WEBHOOK_SECRET;

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
  await sendWithButtons(chatId,
    "*Welcome to Asella Organic Bot*\n\nPlease select your role:",
    [
      [
        { text: "Staff", callback_data: "role:staff" },
        { text: "Vendor", callback_data: "role:vendor" },
      ],
      [
        { text: "Customer", callback_data: "role:customer" },
        { text: "Driver", callback_data: "role:driver" },
      ],
    ]
  );
}

async function sendCustomerMenu(chatId: number): Promise<void> {
  await sendWithButtons(chatId,
    "*Customer Menu*\n\nChoose an option:",
    [
      [
        { text: "Place New Order", callback_data: "menu_order" },
        { text: "Order Tracking", callback_data: "menu_track" },
      ],
      [
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
  nav.push({ text: "✅ Done", callback_data: "order_done_items" });
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
      : `${r.package_size} — ❌ Out of stock`;
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
      { text: "✅ Confirm Order", callback_data: "confirm:yes" },
      { text: "❌ Cancel", callback_data: "confirm:no" },
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
      `✅ *Order Placed!*\n\nYour order *${created.id}* has been received.\nTotal: ETB ${created.total.toLocaleString()}\n\nWe'll update you here when the status changes.`
    );
  } catch (err: any) {
    await sendSimpleMessage(chatId, `❌ I could not create that order: ${err.message}`);
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

async function linkCustomerChat(phone: string, chatId: string | number, fallbackName: string): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  await pool.query(
    `INSERT INTO customers (id, phone, name, telegram_chat_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE telegram_chat_id = VALUES(telegram_chat_id), updated_at = NOW()`,
    [crypto.randomUUID(), normalizedPhone, fallbackName, chatId]
  );
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

  if (fields.order_type === "delivery" && fields.city.toLowerCase().includes("addis")) {
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

    // ── Delivery acceptance (existing) ─────────────────────────────
    if (data.startsWith("delivery_accept_")) {
      const orderId = data.replace("delivery_accept_", "");
      const [orders] = await pool.query(
        `SELECT * FROM orders WHERE id = ?`,
        [orderId]
      ) as [any[], any];

      if (!orders[0]) {
        await answerCallbackQuery(callbackQueryId, "Order not found", true);
        return;
      }

      const order = orders[0];
      await pool.query(
        `UPDATE orders SET status = 'In Transit', assigned_to = ?, delivery_message_id = ? WHERE id = ?`,
        [from?.username || `delivery_${chatId}`, message?.message_id, orderId]
      );

      await pool.query(
        `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
         VALUES (?, ?, ?, 'In Transit', ?, 'Accepted by delivery from Telegram', NOW())`,
        [crypto.randomUUID(), orderId, order.status, from?.username || `delivery_${chatId}`]
      );

      await pool.query(
        `INSERT INTO delivery_assignments (order_id, driver_username, telegram_message_id, claimed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE driver_username = VALUES(driver_username), claimed_at = NOW()`,
        [orderId, from?.username || `delivery_${chatId}`, message?.message_id]
      );

      const [items] = await pool.query(
        `SELECT * FROM order_items WHERE order_id = ?`,
        [orderId]
      ) as [any[], any];

      await sendDetailsToAssignedDriver(chatId, { ...order, items });

      if (message?.message_id && process.env.TELEGRAM_DELIVERY_GROUP_ID) {
        await editMessageText(
          process.env.TELEGRAM_DELIVERY_GROUP_ID,
          message.message_id,
          `${message.text}\n\nAccepted by: ${from?.first_name || "Driver"} (@${from?.username || "unknown"})`
        );
      }

      await answerCallbackQuery(callbackQueryId, "Accepted! Details sent to you.", false);

      void sendTelegramToCustomer({
        phone: order.phone,
        message: `Hi ${order.customer_name}, your order *${orderId}* is now *In Transit*.`,
      });

      return;
    }

    if (data.startsWith("delivery_reject_")) {
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
        userState.delete(chatId);
        await sendWithButtons(chatId,
          `Welcome *${user.full_name}* (${user.role}).\n\nStaff dashboard options:`,
          [
            [{ text: "View Orders", url: "https://app.asellaorganic.com/dashboard" }],
            [{ text: "Back to Menu", callback_data: "role:back" }],
          ]
        );
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
        await linkCustomerChat(phone, chatId, fallbackName);
        userState.delete(chatId);
        await sendSimpleMessage(chatId, "✅ Your Telegram account is linked! You'll receive updates for orders with that phone number.");
        return;
      }

      // Unrecognized step — reset
      userState.delete(chatId);
    }

    // ── Commands (no active state) ────────────────────────────────
    if (text === "/start" || text === "/help") {
      await sendRoleMenu(chatId);
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
      await linkCustomerChat(phone, chatId, fallbackName);
      await sendSimpleMessage(chatId, "Your Telegram account is linked. You will receive updates for orders with that phone number.");
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

    const messageDate: number | undefined =
      update?.message?.date ??
      update?.callback_query?.message?.date;

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

export default router;
