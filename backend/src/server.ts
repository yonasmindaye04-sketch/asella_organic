/**
 * src/server.ts
 * Asella Organic — HTTP Server Entry Point (MySQL)
 */

import "./config/env.js";
import app from "./app.js";
import cron from "node-cron";
import { sendMorningBriefing, initBotConfiguration } from "./lib/telegram.js";
import { sendWeeklyAffiliateReports } from "./scripts/affiliate-report-cron.js";
import { startSmsDispatcher, stopSmsDispatcher } from "./lib/smsQueue.js";

const PORT = process.env.PORT ?? "3001";

const server = app.listen(PORT as any, () => {
  console.log(`\n Asella Organic API running`);
  console.log(`   http://localhost:${PORT}/api/health\n`);

  // Asynchronously synchronize bot commands, descriptions, and menu button
  void initBotConfiguration();
});

// ── Graceful shutdown on SIGINT/SIGTERM/uncaughtException/unhandledRejection 

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] ${signal} received — shutting down gracefully...`);
  // Stop accepting new SMS work before closing the pool, so an in-flight
  // tick cannot try to write to a closed connection.
  stopSmsDispatcher();
  server.close(async () => {
    const pool = (await import("./config/db.js")).default;
    await pool.end(); // Compatible with mysql2/promise
    console.log("[server] DB pool closed. Goodbye.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[server] Force exit after timeout.");
    process.exit(1);
  }, 10_000);
}

// ── Schedule morning briefing (daily at 8:00 AM EAT) ────────────
cron.schedule("0 8 * * *", sendMorningBriefing, {
  timezone: "Africa/Addis_Ababa",
});

// ── Weekly affiliate sales & engagement summary (Mondays, 8:00 AM EAT) ──
cron.schedule("0 8 * * 1", () => {
  void sendWeeklyAffiliateReports();
}, {
  timezone: "Africa/Addis_Ababa",
});

// ── SMS dispatcher ─────────────────────────────────────────────────────
// No-ops unless the ACTIVE transport is configured, so a machine without
// outbound SMS credentials starts normally with SMS simply inert.
startSmsDispatcher();

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});