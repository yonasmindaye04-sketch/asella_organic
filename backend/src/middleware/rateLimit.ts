/**
 * src/middleware/rateLimit.ts
 * Asella Organic — Rate Limiting Middleware
 *
 * Two-tier rate limiting:
 *   - For UNAUTHENTICATED requests: key on IP (the existing behavior).
 *   - For AUTHENTICATED requests:    key on `user:<id>` (per-user).
 *
 * This solves the "multiple users behind one corporate NAT share one
 * bucket" problem. The IP key is the fallback when auth isn't present
 * (e.g. /api/auth/login before login).
 */

import { Request, Response, NextFunction } from "express";
import { LRUCache } from "lru-cache";
import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | null = null;

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch((err: any) => console.error("[Redis] Rate limit connection error:", err));
}

function makeCache(ttlMs: number) {
  return new LRUCache<string, number>({ max: 10_000, ttl: ttlMs });
}

async function check(
  cache: LRUCache<string, number>,
  prefix: string,
  key: string,
  max: number,
  ttlMs: number
): Promise<boolean> {
  if (redisClient && redisClient.isReady) {
    const fullKey = `ratelimit:${prefix}:${key}`;
    try {
      const current = await redisClient.incr(fullKey);
      if (current === 1) {
        await redisClient.pExpire(fullKey, ttlMs);
      }
      return current <= max;
    } catch (err) {
      console.error("[Redis] rate limit error, falling back to memory:", err);
      // Fall through to memory cache
    }
  }

  // Memory fallback
  const existing = cache.get(key);
  const current  = (existing !== undefined ? existing : 0) + 1;
  cache.set(key, current);
  return current <= max;
}

function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return (forwarded.split(",")[0] ?? "unknown").trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Build a stable per-request key. If the request is authenticated
 * (req.user is populated by the auth middleware), we key on user id.
 * Otherwise we fall back to the IP.
 */
function getRateLimitKey(req: Request): string {
  const user = (req as any).user as { id?: string } | undefined;
  if (user && typeof user.id === "string" && user.id.length > 0) {
    return `user:${user.id}`;
  }
  return `ip:${getIp(req)}`;
}

const generalCache = makeCache(60 * 1_000);
const loginCache   = makeCache(5 * 60 * 1_000);
const orderCache   = makeCache(5 * 60 * 1_000);  // 5 minutes for order creation

export async function generalRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const allowed = await check(generalCache, "general", getRateLimitKey(req), 600, 60 * 1_000);
  if (!allowed) {
    res.status(429).json({ success: false, error: "Too many requests. Try again in a minute." });
    return;
  }
  next();
}

export async function loginRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const allowed = await check(loginCache, "login", getRateLimitKey(req), 10, 5 * 60 * 1_000);
  if (!allowed) {
    res.status(429).json({ success: false, error: "Too many login attempts. Wait 5 minutes." });
    return;
  }
  next();
}

export async function orderRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const allowed = await check(orderCache, "order", getRateLimitKey(req), 10, 5 * 60 * 1_000);
  if (!allowed) {
    res.status(429).json({ success: false, error: "Too many orders. Maximum 10 orders per 5 minutes." });
    return;
  }
  next();
}

/**
 * Receipt-upload limiter.
 *
 * POST /api/upload/receipt is deliberately UNAUTHENTICATED — it is the
 * customer uploading proof of payment during checkout, so it cannot require a
 * session. That makes it an unauthenticated write of up to 5 MB into the
 * account's web root, which the general 600/min bucket does not meaningfully
 * constrain (~3 GB/min from one address).
 *
 * 10 per 5 minutes per IP leaves ample room for a customer retrying a receipt
 * and for staff bulk-entry, and caps the abuse at ~10 MB per 5 minutes.
 */
const uploadCache = makeCache(5 * 60 * 1_000);

export async function uploadRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const allowed = await check(uploadCache, "upload", getRateLimitKey(req), 10, 5 * 60 * 1_000);
  if (!allowed) {
    res.status(429).json({
      success: false,
      error: "Too many uploads. Please wait a few minutes and try again.",
    });
    return;
  }
  next();
}

/**
 * SMS send limiter.
 *
 * Every endpoint that spends real money needs its own budget rather than the
 * shared 600/minute general bucket. POST /api/sms/send-test enqueues a
 * genuine message on every call, so under the general limit a single admin
 * session — or a stolen one — could queue 600 messages a minute. The daily
 * cost ceiling (SMS_MAX_DAILY_COST_ETB) would eventually stop the bleeding,
 * but that is hours of spend and outbound SMS to real handsets in the
 * meantime.
 *
 * 20 per 10 minutes is ample for a technician confirming an API key and a
 * number format, and is not reachable by accident. Dispatch, the expensive
 * operation, keeps its own controls: 2FA, a typed confirmation phrase, and
 * the per-campaign and per-day cost ceilings.
 */
const smsCache = makeCache(10 * 60 * 1_000);

export async function smsSendRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const allowed = await check(smsCache, "sms-send", getRateLimitKey(req), 20, 10 * 60 * 1_000);
  if (!allowed) {
    res
      .status(429)
      .json({ success: false, error: "Too many SMS sends. Wait a few minutes and try again." });
    return;
  }
  next();
}