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

function makeCache(ttlMs: number) {
  return new LRUCache<string, number>({ max: 10_000, ttl: ttlMs });
}

function check(
  cache: LRUCache<string, number>,
  key: string,
  max: number
): boolean {
  const existing = cache.get(key);                  // number | undefined
  const current  = (existing !== undefined ? existing : 0) + 1;  //
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
  // The auth middleware in src/middleware/auth.ts sets req.user =
  // { id, username, role } after verifying a JWT.
  const user = (req as any).user as { id?: string } | undefined;
  if (user && typeof user.id === "string" && user.id.length > 0) {
    return `user:${user.id}`;
  }
  return `ip:${getIp(req)}`;
}

const generalCache = makeCache(60 * 1_000);
const loginCache   = makeCache(5 * 60 * 1_000);
const orderCache   = makeCache(5 * 60 * 1_000);  // 5 minutes for order creation

export function generalRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!check(generalCache, getRateLimitKey(req), 600)) {
    res.status(429).json({ success: false, error: "Too many requests. Try again in a minute." });
    return;
  }
  next();
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!check(loginCache, getRateLimitKey(req), 10)) {
    res.status(429).json({ success: false, error: "Too many login attempts. Wait 5 minutes." });
    return;
  }
  next();
}

export function orderRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!check(orderCache, getRateLimitKey(req), 10)) {
    res.status(429).json({ success: false, error: "Too many orders. Maximum 10 orders per 5 minutes." });
    return;
  }
  next();
}