/**
 * src/middleware/rateLimit.ts
 * Asella Organic — Rate Limiting Middleware
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

const generalCache = makeCache(60 * 1_000);
const loginCache   = makeCache(5 * 60 * 1_000);
const orderCache   = makeCache(5 * 60 * 1_000);  // 5 minutes for order creation

export function generalRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!check(generalCache, getIp(req), 600)) {
    res.status(429).json({ success: false, error: "Too many requests. Try again in a minute." });
    return;
  }
  next();
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!check(loginCache, getIp(req), 10)) {
    res.status(429).json({ success: false, error: "Too many login attempts. Wait 5 minutes." });
    return;
  }
  next();
}

export function orderRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!check(orderCache, getIp(req), 10)) {
    res.status(429).json({ success: false, error: "Too many orders. Maximum 10 orders per 5 minutes." });
    return;
  }
  next();
}