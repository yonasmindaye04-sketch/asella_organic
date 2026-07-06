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
import path from "path";

import helmet from "helmet";
import { generalRateLimit } from "./middleware/rateLimit.js";
import { requestId }        from "./middleware/requestId.js";
import { idempotencyMiddleware } from "./middleware/idempotency.js";
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
import adminRoutes          from "./routes/admin.js";
import expenseRoutes        from "./routes/expenses.js";
import videoRoutes          from "./routes/videos.js";

const app = express();

// ── 1. Security headers (helmet) — must be first ──────────────────────────────
app.use(helmet({
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.asellaorganic.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  permissionsPolicy: {
    features: {
      geolocation: [],
      camera: [],
      microphone: [],
      payment: [],
      usb: [],
    },
  },
}));

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

// ── 3b. Strict Origin Checking (CSRF Defense-in-Depth) ──────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  // Safe methods don't mutate state
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  
  // Skip external webhooks that don't come from a browser
  if (req.path.includes("/payment/callback") || req.path.includes("/telegram/webhook")) {
    next();
    return;
  }

  const origin = req.headers.origin || req.headers.referer;
  
  if (!origin) {
    res.status(403).json({ success: false, error: "CSRF protection: Missing Origin or Referer header" });
    return;
  }
  
  const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed));
  if (!isAllowed) {
    res.status(403).json({ success: false, error: "CSRF protection: Origin mismatch" });
    return;
  }
  
  next();
});

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

// ── 9b. Idempotency-Key middleware (POST endpoints only) ────────────────────
//
// Clients that send `Idempotency-Key: <uuid>` on a POST get safe
// retry semantics: the first request runs the handler, subsequent
// requests with the same key return the cached response. Used by
// order creation to handle flaky-mobile-network retries.
app.use("/api", idempotencyMiddleware);

// ── 10. Health check ──────────────────────────────────────────────────────────
//
// Shared function used by both /api/v1/health (preferred) and
// /api/health (backward-compat shim). The two endpoints return the
// same data; v1 includes an `api: "v1"` discriminator.
async function healthCheck() {
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

  return {
    db,
    telegram,
    healthy: db && telegram,
  };
}

app.get("/api/v1/health", async (_req, res) => {
  const h = await healthCheck();
  res.status(h.healthy ? 200 : 503).json({
    api:       "v1",
    db:        h.db,
    telegram:  h.telegram,
    timestamp: new Date().toISOString(),
  });
});

// Backward-compat health check (no api version field)
app.get("/api/health", async (_req, res) => {
  const h = await healthCheck();
  res.status(h.healthy ? 200 : 503).json({
    db:        h.db,
    telegram:  h.telegram,
    timestamp: new Date().toISOString(),
  });
});

// ── 11. Routes ────────────────────────────────────────────────────────────────
//
// All routes are mounted at BOTH /api/v1/* and /api/* for backward
// compatibility. New clients should use /api/v1. The /api/* paths will
// be removed in v2.
//
// We use express.Router() sub-routers so the routes themselves don't
// have to know their prefix; each router file can do `router.get("/")`
// etc. and we mount it at multiple paths.
const routeMounts: Array<[string, express.Router]> = [
  ["/auth",         authRoutes],
  ["/staff",        staffRoutes],
  ["/orders",       orderRoutes],
  ["/products",     productRoutes],
  ["/referrals",    referralRoutes],
  ["/telegram",     telegramRoutes],
  ["/stock",        stockRoutes],
  ["/upload",       uploadRoutes],
  ["/vendor-orders",vendorOrderRoutes],
  ["/notifications",notificationRoutes],
  ["/appointments", appointmentRoutes],
  ["/admin",        adminRoutes],
  ["/expenses",     expenseRoutes],
  ["/videos",       videoRoutes],
];

for (const [path, router] of routeMounts) {
  // Versioned — preferred path
  app.use(`/api/v1${path}`, router);
  // Backward-compat shim — will be removed in v2
  app.use(`/api${path}`, router);
}

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
