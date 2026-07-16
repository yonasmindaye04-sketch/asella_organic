/**
 * src/server.ts
 * Asella Organic — HTTP Server Entry Point (MySQL)
 */

import "./config/env.js";
import app from "./app.js";
import cron from "node-cron";
import { sendMorningBriefing } from "./lib/telegram.js";

const PORT = process.env.PORT ?? "3001";

const server = app.listen(PORT as any, () => {
  console.log(`\n Asella Organic API running`);
  console.log(`   http://localhost:${PORT}/api/health\n`);
});

// ── Graceful shutdown on SIGINT/SIGTERM/uncaughtException/unhandledRejection 

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] ${signal} received — shutting down gracefully...`);
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

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});