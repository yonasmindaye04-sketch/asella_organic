/**
 * src/middleware/auth.ts
 * Asella Organic — JWT Authentication + Role Guard Middleware (MySQL)
 *
 * Changes from v2:
 *   + authenticate() now reads the JWT from the `access_token` HttpOnly cookie
 *     FIRST, and falls back to the Authorization: Bearer header if absent.
 *     → Browser clients using cookies work automatically.
 *     → Existing API / Postman / mobile clients using Bearer are unaffected.
 *   + Re-checks user active status and deletion status with a short (30s)
 *     in-memory LRU cache to instantly invalidate deactivated users without
 *     hitting the DB on every single request (F-10).
 *
 * Usage:
 *   router.get("/orders",   authenticate, authorise("admin","manager"), handler)
 *   router.post("/orders",  authenticate, handler)   // any logged-in role
 */

import { Request, Response, NextFunction } from "express";
import pool   from "../config/db.js";
import crypto from "crypto";
import { LRUCache } from "lru-cache";
import { signJwt, verifyJwt } from "../config/jwtSecret.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenPayload {
  id:       string;
  username: string;
  role:     "admin" | "manager" | "employee" | "affiliate" | "delivery" | "vendor" | "call_center" | "store_manager" | "tech_support";
  jti:      string;
}

interface UserStatusCacheEntry {
  exists: boolean;
  active: boolean;
  role: TokenPayload["role"];
}

declare global {
  namespace Express {
    interface Request {
      user?:      TokenPayload;
      requestId:  string;           // set by requestId middleware
    }
  }
}

// ── In-Memory Active Status Cache (30s TTL) ───────────────────────────────────

export const userStatusCache = new LRUCache<string, UserStatusCacheEntry>({
  max: 1000,
  ttl: 1000 * 30, // 30 seconds
});

export function invalidateUserStatusCache(userId?: string): void {
  if (userId) {
    userStatusCache.delete(userId);
  } else {
    userStatusCache.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify a token.
 *
 * Rotation-aware: accepts either the current secret or JWT_SECRET_PREVIOUS
 * (during a rotation window). The rules — including the rule that an
 * EXPIRED token is never rescued by the previous secret — live in
 * src/config/jwtSecret.ts so the verifier and the issuer agree.
 */
function verifyToken(token: string): TokenPayload {
  return verifyJwt<TokenPayload>(token);
}

// ── authenticate ──────────────────────────────────────────────────────────────

/**
 * Reads the raw access token from the request, in the same order authenticate
 * uses:
 *   1. `access_token` HttpOnly cookie (browser / cookie-auth clients)
 *   2. `Authorization: Bearer <token>` header (API / mobile / Postman clients)
 *
 * Exported so middleware that runs BEFORE the per-route authenticate() can
 * still work out who the caller is. The idempotency middleware needs this:
 * it is mounted app-wide, ahead of the routers, so req.user is not populated
 * yet when it runs, and without a caller it cannot scope an idempotency key
 * to anything but "everybody on the internet".
 */
export function extractAccessToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.access_token;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  return undefined;
}

/**
 * Reads the JWT from:
 *   1. `access_token` HttpOnly cookie (browser / cookie-auth clients)
 *   2. `Authorization: Bearer <token>` header (API / mobile / Postman clients)
 *
 * Populates req.user on success.
 */
export async function authenticate(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  const token = extractAccessToken(req);

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized: no token" });
    return;
  }

  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch (err: any) {
    const message =
      err.name === "TokenExpiredError"
        ? "Session expired. Please log in again."
        : "Invalid token.";
    res.status(401).json({ success: false, error: message });
    return;
  }

  // Check session blocklist (revoked on logout)
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM session_blocklist
       WHERE jti = ? AND expires_at > NOW()
       LIMIT 1`,
      [payload.jti]
    ) as [any[], any];

    if (rows.length > 0) {
      res.status(401).json({ success: false, error: "Session has been revoked." });
      return;
    }
  } catch {
    // If table doesn't exist yet, proceed — non-blocking
  }

  // Re-check user active & deletion status in DB with 30s LRU cache (F-10)
  try {
    let status = userStatusCache.get(payload.id);
    if (!status) {
      const [userRows] = await pool.query(
        `SELECT active, deleted_at, role FROM staff_users WHERE id = ? LIMIT 1`,
        [payload.id]
      ) as [any[], any];

      if (userRows.length === 0) {
        status = { exists: false, active: false, role: payload.role };
      } else {
        const u = userRows[0];
        status = {
          exists: true,
          active: Boolean(u.active) && u.deleted_at === null,
          role: u.role,
        };
      }
      userStatusCache.set(payload.id, status);
    }

    if (!status.exists || !status.active) {
      res.status(401).json({ success: false, error: "Account is inactive or has been disabled." });
      return;
    }

    // Keep payload role synchronized in memory if role changed in DB
    if (status.role && status.role !== payload.role) {
      payload.role = status.role;
    }
  } catch (err) {
    console.error("[authenticate] Error verifying user status:", err);
  }

  req.user = payload;
  next();
}

// ── authorise ─────────────────────────────────────────────────────────────────

/**
 * Role guard — always use AFTER authenticate.
 * Empty roles array = any authenticated user is allowed.
 *
 * Access is decided ONLY by the role list passed at the call site.
 *
 * There used to be an exception here: tech_support returned next()
 * before the requested roles were ever compared, so a tech_support
 * account passed EVERY guarded route in the application — including
 * `authorise("admin")` on staff administration, agent referrals and
 * expense deletion.
 *
 * That was not a permission, it was an omission, and it chained into
 * full privilege escalation. require2FA only challenges accounts that
 * have 2FA switched on, so a tech_support account with 2FA off could
 * reach POST /api/staff (2FA required, but nothing to challenge) and
 * create a brand new admin account in one request — then use it.
 *
 * tech_support is now an ordinary least-privilege role. It reaches the
 * read-only surfaces support engineers actually need by being listed
 * explicitly on those routes, and nothing else. See the capability
 * summary in the PR description for the exact list.
 */
export function authorise(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: requires one of [${roles.join(", ")}]`,
      });
      return;
    }
    next();
  };
}

// ── Token issuers ─────────────────────────────────────────────────────────────

export function issueToken(
  payload:   Omit<TokenPayload, "jti">,
  expiresIn  = "7d"
): string {
  const jti = crypto.randomBytes(16).toString("hex");
  return signJwt({ ...payload, jti }, { expiresIn } as any);
}

export function issueTokens(
  payload: Omit<TokenPayload, "jti">
): { accessToken: string; refreshToken: string; jti: string } {
  const jti          = crypto.randomBytes(16).toString("hex");
  const accessToken  = signJwt({ ...payload, jti }, { expiresIn: "1h" } as any);
  const refreshToken = crypto.randomBytes(40).toString("hex");
  return { accessToken, refreshToken, jti };
}
