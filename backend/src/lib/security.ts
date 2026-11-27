/**
 * src/lib/security.ts
 * Asella Organic — Security Utilities
 *
 * Scope: XSS sanitization, HMAC reset tokens, Telegram webhook
 * verification, and randomId helper.
 *
 * JWT (issueToken / verifyToken) lives ONLY in src/middleware/auth.ts.
 */

import crypto    from "crypto";
import DOMPurify from "isomorphic-dompurify";
import { getJwtSecret, getPreviousJwtSecret } from "../config/jwtSecret.js";

// ─── JWT secret ────────────────────────────────────────────────────────────
// The key itself is owned by src/config/jwtSecret.ts (single source of
// truth for the issuer, the verifier and the boot guard). This module only
// reuses it.

// ─── XSS Sanitization ─────────────────────────────────────────────────────

export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";
  return DOMPurify.sanitize(input.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      out[key] = (key.endsWith("_url") || key === "url") ? value.trim() : sanitizeInput(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map(item =>
        typeof item === "string"
          ? sanitizeInput(item)
          : typeof item === "object" && item !== null
            ? sanitizeObject(item as Record<string, unknown>)
            : item
      );
    } else if (typeof value === "object" && value !== null) {
      out[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

// ─── Telegram Webhook Verification ────────────────────────────────────────

export function verifyTelegramWebhook(header: string | undefined): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !header) return false;
  const headerBuf   = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

// ─── HMAC Password Reset Token ────────────────────────────────────────────

interface ResetPayload {
  userId: string;
  exp:    number;
  nonce:  string;
}

export function generateResetToken(userId: string): string {
  const payload: ResetPayload = {
    userId,
    exp:   Date.now() + 15 * 60 * 1_000, // 15 minutes
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  // Always sign with the *current* secret. Older tokens signed before a
  // JWT_SECRET rotation keep working because verifyResetToken() tries the
  // previous secret as a fallback.
  const sig  = crypto
    .createHmac("sha256", getJwtSecret())
    .update(b64)
    .digest("base64url");
  return `${b64}.${sig}`;
}

/**
 * Try the current secret, then JWT_SECRET_PREVIOUS if set.
 * Identical fall-back semantics to verifyJwt() in
 * src/config/jwtSecret.ts — see the comment there for the full rotation
 * rationale. We do not try JWT_SECRET_PREVIOUS on an expired-token error
 * because exp is an absolute deadline, not a function of which secret
 * signed the token.
 */
function verifyResetSignature(b64: string, sig: string): void {
  const expected = crypto
    .createHmac("sha256", getJwtSecret())
    .update(b64)
    .digest("base64url");

  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return;

  const previous = getPreviousJwtSecret();
  if (previous) {
    const prevExpected = crypto
      .createHmac("sha256", previous)
      .update(b64)
      .digest("base64url");
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(prevExpected))) return;
  }
  throw new Error("Invalid signature");
}

export function verifyResetToken(token: string): string {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) throw new Error("Malformed token");

  verifyResetSignature(b64, sig);

  const payload: ResetPayload = JSON.parse(
    Buffer.from(b64, "base64url").toString()
  );
  if (Date.now() > payload.exp) throw new Error("Token expired");

  return payload.userId;
}

// ─── Random ID helper ─────────────────────────────────────────────────────

export const randomId = (bytes = 8): string =>
  crypto.randomBytes(bytes).toString("hex").toUpperCase();