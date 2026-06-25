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