import { Router, Request, Response } from "express";
import crypto from "crypto";
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
} from "../lib/telegram.js";

const router = Router();

const verifyTelegramWebhook = (token?: string) => token === process.env.TELEGRAM_WEBHOOK_SECRET;

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

    if (data.startsWith("po_accept_")) {
      const orderId = data.replace("po_accept_", "");
      await pool.query(
        `UPDATE vendor_orders SET status = 'confirmed' WHERE order_id = ?`,
        [orderId]
      );
      await answerCallbackQuery(callbackQueryId, "PO Accepted!", false);
      return;
    }

    if (data.startsWith("po_decline_")) {
      const orderId = data.replace("po_decline_", "");
      await pool.query(
        `UPDATE vendor_orders SET status = 'declined' WHERE order_id = ?`,
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

    if (text === "/start" || text === "/help") {
      await sendSimpleMessage(
        chat.id,
        `Welcome to Asella Organic Bot.\n\nYou can place orders and receive status updates here.\n\nCommands:\n/order - place an order\n/link +251900000000 - link your phone for updates\n/myorders - see recent orders\n/track ORD-... - check one order\n\n${ORDER_HELP}`
      );
      return;
    }

    if (text.startsWith("/link")) {
      const phone = text.replace("/link", "").trim();
      if (!phone) {
        await sendSimpleMessage(chat.id, "Send /link followed by your phone number, for example: /link +251900000000");
        return;
      }

      const fallbackName = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "Telegram Customer";
      await linkCustomerChat(phone, chat.id, fallbackName);
      await sendSimpleMessage(chat.id, "Your Telegram account is linked. You will receive updates for orders with that phone number.");
      return;
    }

    if (text === "/order" || text === "order") {
      await sendSimpleMessage(chat.id, ORDER_HELP);
      return;
    }

    if (text.startsWith("/order\n") || text.toLowerCase().startsWith("order\n")) {
      const order = parseOrderMessage(text);
      if (!order) {
        await sendSimpleMessage(chat.id, ORDER_HELP);
        return;
      }

      try {
        const created = await createTelegramOrder(order, chat.id);
        await sendSimpleMessage(
          chat.id,
          `Thank you ${order.customer_name}. Your order *${created.id}* has been received.\nTotal: ETB ${created.total.toLocaleString()}.\nWe will message you here when the status changes.`
        );
      } catch (err: any) {
        await sendSimpleMessage(chat.id, `I could not create that order: ${err.message}\n\n${ORDER_HELP}`);
      }
      return;
    }

    if (text === "/myorders") {
      await sendCustomerOrders(chat.id);
      return;
    }

    if (text.startsWith("/track")) {
      const orderId = text.replace("/track", "").trim();
      if (!orderId) {
        await sendSimpleMessage(chat.id, "Send /track followed by your order ID, for example: /track ORD-20260630-ABCD");
        return;
      }
      await sendOrderStatus(chat.id, orderId);
    }
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

export default router;
