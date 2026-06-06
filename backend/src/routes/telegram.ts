import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import {
  answerCallbackQuery,
  editMessageText,
  sendDetailsToAssignedDriver,
  sendSimpleMessage,
} from "../lib/telegram.js";

const router = Router();

// ─── Webhook Verification ────────────────────────────────────────────────────
const verifyTelegramWebhook = (token?: string) => token === process.env.TELEGRAM_WEBHOOK_SECRET;

// ─── Callback Query Handlers ──────────────────────────────────────────────────
async function handleCallback(query: any): Promise<void> {
  const { id: callbackQueryId, from, data, message } = query;
  const chatId = from?.id;

  try {
    if (!data) {
      await answerCallbackQuery(callbackQueryId);
      return;
    }

    // ────── DELIVERY ACCEPTANCE ───────────────────────────────────────────
    if (data.startsWith("delivery_accept_")) {
      const orderId = data.replace("delivery_accept_", "");
      const [orders] = await pool.query(
        `SELECT * FROM orders WHERE id = ?`,
        [orderId]
      ) as [any[], any];

      if (!orders[0]) {
        await answerCallbackQuery(callbackQueryId, "❌ Order not found", true);
        return;
      }

      const order = orders[0];

      // Update order status to "In Transit"
      await pool.query(
        `UPDATE orders SET status = 'In Transit', assigned_to = ?, delivery_message_id = ? WHERE id = ?`,
        [from?.username || `delivery_${chatId}`, message?.message_id, orderId]
      );

      // Record delivery assignment
      await pool.query(
        `INSERT INTO delivery_assignments (order_id, driver_username, telegram_message_id, claimed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE driver_username = VALUES(driver_username), claimed_at = NOW()`,
        [orderId, from?.username || `delivery_${chatId}`, message?.message_id]
      );

      // Send full order details privately to delivery person
      const [items] = await pool.query(
        `SELECT * FROM order_items WHERE order_id = ?`,
        [orderId]
      ) as [any[], any];

      const enrichedOrder = { ...order, items };
      await sendDetailsToAssignedDriver(chatId, enrichedOrder);

      // Update the group message to show accepted status
      if (message?.message_id && process.env.TELEGRAM_DELIVERY_GROUP_ID) {
        await editMessageText(
          process.env.TELEGRAM_DELIVERY_GROUP_ID,
          message.message_id,
          `${message.text}\n\n✅ *Accepted by: ${from?.first_name || "Driver"} (@${from?.username || "unknown"})*`
        );
      }

      // Notify delivery person
      await answerCallbackQuery(
        callbackQueryId,
        "✅ Accepted! Details sent to you.",
        false
      );

      return;
    }

    // ────── DELIVERY REJECTION ────────────────────────────────────────────
    if (data.startsWith("delivery_reject_")) {
      const _orderId = data.replace("delivery_reject_", "");
      await answerCallbackQuery(
        callbackQueryId,
        "❌ Order rejected. Thank you.",
        false
      );

      // Don't change order status; someone else may accept
      return;
    }

    // ────── PURCHASE ORDER CALLBACKS ───────────────────────────────────────
    if (data.startsWith("po_accept_")) {
      const orderId = data.replace("po_accept_", "");
      await pool.query(
        `UPDATE vendor_orders SET status = 'confirmed' WHERE order_id = ?`,
        [orderId]
      );
      await answerCallbackQuery(callbackQueryId, "✅ PO Accepted!", false);
      return;
    }

    if (data.startsWith("po_decline_")) {
      const orderId = data.replace("po_decline_", "");
      await pool.query(
        `UPDATE vendor_orders SET status = 'declined' WHERE order_id = ?`,
        [orderId]
      );
      await answerCallbackQuery(callbackQueryId, "❌ PO Declined", false);
      return;
    }

    // ────── STANDARD CALLBACKS ────────────────────────────────────────────
    await answerCallbackQuery(callbackQueryId, "Processed", false);
  } catch (err) {
    console.error("[handleCallback] Error:", err);
    await answerCallbackQuery(callbackQueryId, "⚠️ Error processing", true);
  }
}

// ─── Message Handlers ────────────────────────────────────────────────────────
async function handleMessage(message: any): Promise<void> {
  const { text, chat, from } = message;

  try {
    // /start command - register user
    if (text === "/start") {
      const [existingUsers] = await pool.query(
        `SELECT * FROM telegram_users WHERE chat_id = ?`,
        [chat.id]
      ) as [any[], any];

      if (!existingUsers[0]) {
        await pool.query(
          `INSERT INTO telegram_users (chat_id, username, first_name, last_name, registered_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [chat.id, from?.username, from?.first_name, from?.last_name]
        );
      }

      await sendSimpleMessage(
        chat.id,
        `👋 Welcome to Asella Organic Bot!\n\nYou are now registered for delivery notifications.`
      );
    }
  } catch (err) {
    console.error("[handleMessage] Error:", err);
  }
}

router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  // ── Verify Telegram webhook secret ───────────────────────────────────────
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  if (!verifyTelegramWebhook(secretHeader)) {
    console.warn("[telegram webhook] Rejected: invalid secret token");
    res.sendStatus(200);
    return;
  }

  const update = req.body;

  // ── Replay Protection ─────────────────────────────────────────────────────
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
      console.warn(`[telegram webhook] Duplicate update_id ${updateId} — skipping`);
      res.sendStatus(200);
      return;
    }

    const messageDate: number | undefined =
      update?.message?.date ??
      update?.callback_query?.message?.date;

    if (messageDate) {
      const ageSeconds    = Math.floor(Date.now() / 1000) - messageDate;
      const MAX_AGE_SECS  = 5 * 60;
      if (ageSeconds > MAX_AGE_SECS) {
        console.warn(`[telegram webhook] Stale update_id ${updateId} (${ageSeconds}s old) — recording and skipping`);
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

  // ── Process the update ────────────────────────────────────────────────────
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