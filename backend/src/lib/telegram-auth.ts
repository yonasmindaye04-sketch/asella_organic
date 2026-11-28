/**
 * backend/src/lib/telegram-auth.ts
 * Asella Organic — Telegram Mini App initData Cryptographic Verification
 *
 * Implements HMAC-SHA256 signature verification according to Telegram
 * Mini App authentication specification.
 */

import crypto from "crypto";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  valid: boolean;
  user?: TelegramUser | undefined;
  authDate?: number | undefined;
  queryId?: string | undefined;
  startParam?: string | undefined;
  error?: string | undefined;
}

/**
 * Validates the raw initData string received from Telegram WebApp.
 *
 * @param initData Raw query string from window.Telegram.WebApp.initData
 * @param botToken Telegram Bot API token
 * @param maxAgeSeconds Maximum allowed age of auth_date in seconds (default: 86400 / 24 hours)
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): ValidatedInitData {
  if (!initData || typeof initData !== "string") {
    return { valid: false, error: "Missing initData payload" };
  }

  if (!botToken) {
    return { valid: false, error: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      return { valid: false, error: "Missing hash in initData" };
    }

    params.delete("hash");

    // Sort remaining keys alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckParts: string[] = [];

    for (const key of keys) {
      const val = params.get(key);
      if (val !== null) {
        dataCheckParts.push(`${key}=${val}`);
      }
    }

    const dataCheckString = dataCheckParts.join("\n");

    // 1. Secret key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // 2. Computed hash = HMAC_SHA256(secretKey, dataCheckString)
    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const hashBuffer = Buffer.from(hash, "hex");
    const computedBuffer = Buffer.from(computedHash, "hex");

    if (hashBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(hashBuffer, computedBuffer)) {
      return { valid: false, error: "Invalid signature: data tampered or forged" };
    }

    // 3. Replay protection: verify auth_date freshness
    //
    // ASE-2026-007: auth_date is REQUIRED. The freshness window used to be
    // applied only when `authDate > 0`, so a correctly signed payload with
    // no auth_date — or with a non-numeric one, which parses to NaN and
    // fails the same comparison — was accepted and never expired. A
    // signature is not a timestamp: without one, whoever captured the
    // payload can replay it for ever.
    const authDateStr = params.get("auth_date");
    if (!authDateStr || !/^\d+$/.test(authDateStr.trim())) {
      return { valid: false, error: "Missing or invalid auth_date in initData" };
    }
    const authDate = parseInt(authDateStr.trim(), 10);
    if (!Number.isFinite(authDate) || authDate <= 0) {
      return { valid: false, error: "Invalid auth_date in initData" };
    }
    const now = Math.floor(Date.now() / 1000);

    if (maxAgeSeconds > 0) {
      const age = now - authDate;
      if (age > maxAgeSeconds) {
        return { valid: false, error: `Authentication expired: age ${age}s exceeds limit` };
      }
      if (authDate > now + 300) {
        // More than 5 minutes in future
        return { valid: false, error: "Authentication timestamp from the future" };
      }
    }

    // 4. Extract user object
    const rawUser = params.get("user");
    let user: TelegramUser | undefined;
    if (rawUser) {
      try {
        user = JSON.parse(rawUser);
      } catch {
        return { valid: false, error: "Malformed user JSON in initData" };
      }
    }

    const queryId = params.get("query_id") || undefined;
    const startParam = params.get("start_param") || undefined;

    return {
      valid: true,
      user,
      authDate,
      queryId,
      startParam,
    };
  } catch (err: any) {
    return { valid: false, error: `Validation error: ${err.message}` };
  }
}
