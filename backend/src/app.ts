/**
 * src/app.ts
 * Asella Organic — Express Application (MySQL)
 *
 * Changes from v2:
 *   + cookie-parser        — reads HttpOnly cookies for optional cookie-based auth
 *   + requestId middleware — attaches x-request-id UUID to every request/response
 *   + /api/staff router    — staff management + 2FA setup/verify endpoints
 *   + CORS allowedHeaders  — added x-2fa-token and x-request-id
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import path from "path";

import { securityHeaders }  from "./middleware/securityHeaders.js";
import { generalRateLimit } from "./middleware/rateLimit.js";
import { requestId }        from "./middleware/requestId.js";
import { logger }           from "./lib/logger.js";

import authRoutes     from "./routes/auth.js";
import orderRoutes    from "./routes/orders.js";
import productRoutes  from "./routes/products.js";
import referralRoutes from "./routes/referrals.js";
import telegramRoutes from "./routes/telegram.js";
import stockRoutes    from "./routes/stock.js";
import uploadRoutes   from "./routes/upload.js";
import staffRoutes          from "./routes/staff.js";
import vendorOrderRoutes   from "./routes/vendor-orders.js";
import notificationRoutes  from "./routes/notification.js";
import appointmentRoutes   from "./routes/appointments.js";

const app = express();

// ── 1. Security headers — must be first ───────────────────────────────────────
app.use(securityHeaders);

// ── 2. Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(process.cwd(), "public")));

// ── 3. CORS ───────────────────────────────────────────────────────────────────
// credentials:true is required for HttpOnly cookies to work cross-origin.
// NOTE: When credentials:true, origin cannot be "*" — must be explicit.
// In development, allow http://localhost:5173. In production, restrict to FRONTEND_URL.
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? (process.env.FRONTEND_URL ?? "https://asellaorganic.com").split(",").map(s => s.trim())
    : ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"];

app.use(cors({
  origin: allowedOrigins,
  methods:        ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-2fa-token", "x-request-id"],
  exposedHeaders: ["x-request-id"],
  credentials:    true,
}));

// ── 4. Cookie parser (needed for HttpOnly cookie auth) ────────────────────────
app.use(cookieParser());

// ── 5. Request ID correlation — before all routes so req.requestId is always set
app.use(requestId);

// ── 6. Access log — structured JSON with request ID ──────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.requestId,
    ip:        req.ip,
  });
  next();
});

// ── 7. Raw body for webhook/payment routes (must come BEFORE JSON parser) ────
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (
    req.path.includes("/payment/callback") ||
    req.path.includes("/telegram/webhook")
  ) {
    express.raw({ type: "*/*", limit: "1mb" })(req, _res, next);
  } else {
    next();
  }
});

// ── 8. JSON parser ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb", strict: true }));

// ── 9. General rate limiter ───────────────────────────────────────────────────
app.use("/api", generalRateLimit);

// ── 10. Health check ──────────────────────────────────────────────────────────
app.get("/api/health", async (_req: Request, res: Response) => {
  const pool = (await import("./config/db.js")).default;
  let db       = false;
  let telegram = false;

  try {
    const connection = await pool.getConnection();
    await connection.query("SELECT 1");
    connection.release();
    db = true;
  } catch { /* silent */ }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      const result = await Promise.race<{ ok: boolean }>([
        globalThis.fetch(`https://api.telegram.org/bot${token}/getMe`)
          .then(r => ({ ok: r.ok })),
        new Promise<{ ok: boolean }>((_resolve, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3_000)
        ),
      ]);
      telegram = result.ok;
    }
  } catch { /* silent */ }

  res.status(db && telegram ? 200 : 503).json({
    db,
    telegram,
    timestamp: new Date().toISOString(),
  });
});

// ── 11. Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",      authRoutes);
app.use("/api/staff",     staffRoutes);
app.use("/api/orders",    orderRoutes);
app.use("/api/products",  productRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/telegram",  telegramRoutes);
app.use("/api/stock",     stockRoutes);
app.use("/api/upload",         uploadRoutes);
app.use("/api/vendor-orders",  vendorOrderRoutes);
app.use("/api/notifications",  notificationRoutes);
app.use("/api/appointments",   appointmentRoutes);

// ── 12. 404 ───────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// ── 13. Global error handler ──────────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

export default app;
