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
import { logger, createLogger } from "./lib/logger.js";
import compression from "compression";
import imageRoutes from "./routes/images.js";


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
import mediaRoutes          from "./routes/media.js";
import reportRoutes         from "./routes/reports.js";
import customerRoutes       from "./routes/customers.js";
import smsRoutes            from "./routes/sms.js";
import callcenterRoutes     from "./routes/callcenter.js";
import performanceRoutes   from "./routes/performance.js";
import affiliatePortalRoutes, { publicAffiliateRouter } from "./routes/affiliatePortal.js";

const app = express();

// @ts-expect-error: csp-config is a commonjs file without types
import cspConfig from "../../csp-config.js";

// ── 0. Trust proxy ────────────────────────────────────────────────────────────
// Behind Cloudflare (and any reverse proxy) the client IP is in
// x-forwarded-for. Without this, req.ip is the proxy's address and the rate
// limiter collapses every customer into a single bucket.
// TRUST_PROXY accepts a hop count ("1") or "true". Defaults to 1 hop, which is
// correct for Cloudflare -> origin. Set to "false"/"0" when running with no
// proxy so a spoofed header cannot influence the key.
const trustProxyRaw = (process.env.TRUST_PROXY ?? "1").trim().toLowerCase();
const trustProxy =
  trustProxyRaw === "false" || trustProxyRaw === "0" ? false
  : trustProxyRaw === "true" ? true
  : Number.isNaN(Number(trustProxyRaw)) ? false
  : Number(trustProxyRaw);
app.set("trust proxy", trustProxy);

// ── 1. Security headers (helmet) — must be first ──────────────────────────────
app.use(helmet({
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: cspConfig,
  },
  // @ts-expect-error — permissionsPolicy works at runtime but @types/helmet doesn't include it
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

// ── 1b. Gzip / Brotli compression ────────────────────────────────────────────
app.use(compression());

// ── 2. Static files ───────────────────────────────────────────────────────────
// Image optimizer must be BEFORE express.static so it intercepts /image/* first
app.use("/image", imageRoutes);
app.use(express.static(path.join(process.cwd(), "public")));

// ── 3. CORS ───────────────────────────────────────────────────────────────────
// credentials:true is required for HttpOnly cookies to work cross-origin.
// NOTE: When credentials:true, origin cannot be "*" — must be explicit.
// In development, allow http://localhost:5173. In production, restrict to ALLOWED_ORIGINS.
import { allowedOrigins, isAllowedOrigin, isProduction } from "./lib/origins.js";

if (isProduction && !process.env.ALLOWED_ORIGINS && process.env.FRONTEND_URL) {
  logger.warn("ALLOWED_ORIGINS is unset, falling back to FRONTEND_URL");
}

logger.info("CORS allowed origins resolved to:", { allowedOrigins });

app.use(cors({
  origin: allowedOrigins,
  methods:        ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-2fa-token", "x-request-id", "x-telegram-init-data"],
  exposedHeaders: ["x-request-id"],
  credentials:    true,
}));

// ── 3b. Strict Origin Checking (CSRF Defense-in-Depth) ──────────────────────

/**
 * Origin substituted for the CSRF check when a request carries neither Origin
 * nor Referer — and only when NODE_ENV is exactly "test".
 *
 * Supertest sends neither header, so without this every mutating request in
 * the suite is rejected at the door and each suite that logs in first fails on
 * an undefined token. Patching supertest itself was tried first and abandoned:
 * the tests are ESM, and swapping the module through moduleNameMapper made
 * Jest's loader import it after the environment had torn down.
 *
 * Gated on "test" rather than "not production" on purpose. config/env.ts
 * DEFAULTS NODE_ENV to "development" when it is unset, so a production host
 * that forgets NODE_ENV=production would otherwise have silently lost the
 * "a mutating request must carry an Origin" half of the defence — turning a
 * misconfiguration into a weaker security posture. A browser always attaches
 * Origin to a cross-site POST, so real traffic is unaffected either way; only
 * the non-browser test client is.
 *
 * The value is one isAllowedOrigin already accepts outside production, so the
 * matcher still runs rather than being bypassed. A caller that supplies its own
 * header is untouched: only the absent case is filled in.
 */
const TEST_ORIGIN_FALLBACK = "http://localhost:5173";
const IS_TEST_ENV = process.env.NODE_ENV === "test";

app.use((req: Request, res: Response, next: NextFunction) => {
  // Safe methods don't mutate state
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  
  // Skip external webhooks and requests authenticated via Telegram initData
  if (
    req.path.includes("/payment/callback") ||
    req.path.includes("/telegram/webhook") ||
    Boolean(req.headers["x-telegram-init-data"])
  ) {
    next();
    return;
  }

  // ── Test-mode accommodation ──────────────────────────────────────────────
  // Fills in a known-allowed origin ONLY when the header is absent AND
  // NODE_ENV is exactly "test". See TEST_ORIGIN_FALLBACK above for why the
  // gate is "test" and not "not production".
  //
  // A request that supplies its own Origin still goes through isAllowedOrigin
  // below, so "the origin must match" — the property that actually stops a
  // hostile page — stays fully enforced and testable. Only "a header must be
  // present at all" is relaxed, and only for the test client.
  const origin =
    req.headers.origin ||
    req.headers.referer ||
    (IS_TEST_ENV ? TEST_ORIGIN_FALLBACK : undefined);
  
  if (!origin) {
    res.status(403).json({ success: false, error: "CSRF protection: Missing Origin or Referer header" });
    return;
  }
  
  const isAllowed = isAllowedOrigin(origin);
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
  // Affiliate self-service portal. Mounted separately from /referrals because
  // its auth model is inverted: role 'affiliate' only, scoped by JWT subject.
  ["/affiliate",    affiliatePortalRoutes],
  ["/telegram",     telegramRoutes],
  ["/stock",        stockRoutes],
  ["/upload",       uploadRoutes],
  ["/vendor-orders",vendorOrderRoutes],
  ["/notifications",notificationRoutes],
  ["/appointments", appointmentRoutes],
  ["/admin",        adminRoutes],
  ["/expenses",     expenseRoutes],
  ["/videos",       videoRoutes],
  ["/media",        mediaRoutes],
  ["/reports",      reportRoutes],
  ["/customers",    customerRoutes],
  ["/sms",          smsRoutes],
  ["/callcenter",   callcenterRoutes],
  ["/performance",  performanceRoutes],
];

// ── Public affiliate click tracking ────────────────────────────────────────
// Registered BEFORE the route loop so it is not swallowed by the affiliate
// session guard on the /affiliate router below: a visitor arriving from
// ?ref=CODE has no session yet. Only POST /track-click lives here.
app.use("/api/affiliate",    publicAffiliateRouter);
app.use("/api/v1/affiliate", publicAffiliateRouter);

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
  const log = createLogger(req);
  log.error(`Unhandled error on ${req.method} ${req.path}`, err);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    });
  }
});

export default app;
