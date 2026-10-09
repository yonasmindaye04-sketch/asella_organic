/**
 * backend/src/scripts/telegram-poll.ts
 * 
 * Local Development Utility for Telegram Bot
 * Since localhost cannot receive incoming webhooks from Telegram,
 * this script polls the Telegram API for updates and manually forwards
 * them to the local backend webhook endpoint.
 */

import "dotenv/config";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
// Must default to the same port the backend listens on (backend/src/config/env.ts).
// Defaulting to 5000 here silently sent every update to a dead port.
const TARGET_URL = `http://127.0.0.1:${process.env.PORT || 3001}/api/telegram/webhook`;

// Telegram allows either a webhook OR long polling, never both. Starting this
// script therefore requires deleting the webhook — but doing that
// unconditionally means running this against a production token takes the live
// bot offline, with no way to restore it on exit. Make it explicit instead.
const DELETE_WEBHOOK = process.argv.includes("--delete-webhook");

if (!TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

console.log(`Starting Telegram Long Polling (Local Dev Mode)`);
console.log(`Forwarding updates to: ${TARGET_URL}\n`);

let lastUpdateId = 0;

async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
    if (!res.ok) {
      console.error(`Telegram API error: ${res.status} ${res.statusText}`);
      setTimeout(poll, 5000);
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram API error:`, data.description);
      setTimeout(poll, 5000);
      return;
    }

    const updates = data.result || [];
    for (const update of updates) {
      console.log(`[${new Date().toLocaleTimeString()}] Received update ${update.update_id}`);
      
      // Keep track of the latest update ID so we don't fetch it again
      lastUpdateId = Math.max(lastUpdateId, update.update_id);

      // Forward to local webhook endpoint
      try {
        const forwardRes = await fetch(TARGET_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(WEBHOOK_SECRET ? { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET } : {})
          },
          body: JSON.stringify(update)
        });
        
        if (!forwardRes.ok) {
          console.error(`  [ERROR] Failed to forward to webhook: ${forwardRes.status}`);
        } else {
          console.log(`  [OK] Successfully forwarded to webhook`);
        }
      } catch (err: any) {
        console.error(`  [ERROR] Failed to reach local backend at ${TARGET_URL}: ${err.message}`);
      }
    }

    // Immediately poll again
    poll();
  } catch (err: any) {
    console.error(`Polling error: ${err.message}`);
    setTimeout(poll, 5000);
  }
}

// Ensure the bot isn't trying to use a webhook at the same time.
// Opt-in: pass --delete-webhook, or the webhook is left untouched and the
// bot will keep delivering updates to production instead of this process.
async function deleteWebhook() {
  if (!DELETE_WEBHOOK) {
    console.log(
      "Webhook left untouched (Telegram allows a webhook OR polling, not both).\n" +
      "If this bot is not receiving your messages, re-run with --delete-webhook.\n" +
      "WARNING: that removes the live webhook and it is NOT restored on exit.\n",
    );
    poll();
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook`);
    const data = await res.json();
    if (data.ok) {
      console.log("Deleted any existing Telegram webhook.");
      console.log("Restore it when done: POST /api/telegram/set-webhook");
      poll();
    } else {
      console.error("Failed to delete webhook:", data);
    }
  } catch (err) {
    console.error("Error deleting webhook:", err);
  }
}

deleteWebhook();
