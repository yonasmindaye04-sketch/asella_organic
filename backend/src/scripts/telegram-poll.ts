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
const TARGET_URL = `http://127.0.0.1:${process.env.PORT || 5000}/api/telegram/webhook`;

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
          console.error(`  ❌ Failed to forward to webhook: ${forwardRes.status}`);
        } else {
          console.log(`  ✅ Successfully forwarded to webhook`);
        }
      } catch (err: any) {
        console.error(`  ❌ Failed to reach local backend at ${TARGET_URL}: ${err.message}`);
      }
    }

    // Immediately poll again
    poll();
  } catch (err: any) {
    console.error(`Polling error: ${err.message}`);
    setTimeout(poll, 5000);
  }
}

// Ensure the bot isn't trying to use a webhook at the same time
async function deleteWebhook() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook`);
    const data = await res.json();
    if (data.ok) {
      console.log("Deleted any existing Telegram webhook.");
      poll();
    } else {
      console.error("Failed to delete webhook:", data);
    }
  } catch (err) {
    console.error("Error deleting webhook:", err);
  }
}

deleteWebhook();
