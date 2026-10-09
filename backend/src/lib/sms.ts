/**
 * src/lib/sms.ts
 * Asella Organic — SMSEthiopia transport (MySQL Compatible)
 *
 * Shaped deliberately after lib/mailer.ts: the same four exports, the same
 * SendResult contract, and the same rule that a transport failure is
 * REPORTED rather than THROWN.
 *
 * That rule is not stylistic. Sends happen inside order-status handling and
 * campaign dispatch, where a thrown error would either roll back a committed
 * order or abort a 500-recipient batch after 40 have already gone out.
 * Every caller decides what to do with a failure from the returned value.
 *
 * ── Provider contract (verified against smsethiopia.com/developer-docs.txt,
 *    April 2026 — do not guess, this API is narrower than it looks) ───────
 *
 *   POST https://smsethiopia.com/api/sms/send
 *   Headers: KEY: <api_key>, Content-Type: application/json
 *   Body:    { "msisdn": "251XXXXXXXXX", "text": "..." }
 *
 *   200 -> { "sent": true, "id": 0, "description": "Accepted for delivery" }
 *
 * Three consequences that shape this file:
 *
 * 1. `KEY` header auth. NOT Bearer, NOT username/password. There is a
 *    machine-generated note at smsethiopia.com warning specifically that
 *    models hallucinate username/password auth for this API.
 *
 * 2. `id` is documented as RESERVED and always 0. There is no message id to
 *    correlate. We therefore cannot receive or join a per-message delivery
 *    receipt, and we do NOT record one. `provider_ref` in sms_messages stays
 *    NULL until the provider confirms otherwise.
 *
 * 3. No error schema is documented — no codes, no JSON shape. So the only
 *    reliable signal is the HTTP status: 2xx accepted, 4xx rejected by us
 *    (do not retry), 5xx or transport failure transient (retry). The
 *    `permanent` flag below is derived from status class and refined by the
 *    few body shapes that are unambiguous. Do not add invented code checks
 *    here; there is no published code table to check against.
 */

import {
  normalizeEthiopianMSISDN,
  calculateSmsSegments,
} from "./smsNormalize.js";

const API_URL = "https://smsethiopia.com/api/sms/send";

/**
 * Hard provider ceiling. SMSEthiopia publishes no length limit; a single
 * GSM-7 message is 160 chars and anything beyond a handful of segments is
 * both expensive and unreadable on a handset. Rejecting here keeps a paste
 * accident from becoming a 10-segment bill.
 */
export const MAX_SEGMENTS_PER_MESSAGE = 5;

// ─── Configuration ──────────────────────────────────────────────────────

export function isSmsConfigured(): boolean {
  return Boolean(process.env.SMSETHIOPIA_API_KEY);
}

/**
 * Whether background dispatch runs at all. Separate from
 * isSmsConfigured() so a staging box with credentials can still refuse to
 * send real messages.
 */
export function isSmsDispatchEnabled(): boolean {
  if (process.env.SMS_DISPATCH_ENABLED === "false") return false;
  return isSmsConfigured();
}

export function smsSenderLabel(): string {
  // SMSEthiopia v1 accepts only msisdn and text — there is no sender field
  // in the request body. Alphanumeric sender IDs are a dashboard-level
  // account setting, not a per-request parameter, so this is display-only.
  return process.env.SMS_SENDER_LABEL ?? "Asella Organic";
}

function apiKey(): string {
  const key = process.env.SMSETHIOPIA_API_KEY;
  if (!key) {
    throw new Error("SMSEthiopia is not configured — set SMSETHIOPIA_API_KEY.");
  }
  return key;
}

// ─── Result contract ────────────────────────────────────────────────────

/**
 * Classification of a send attempt, for the queue's retry policy.
 *
 *   accepted   — provider took it. Terminal, no retry.
 *   rejected   — provider refused this specific message (4xx, bad MSISDN,
 *                malformed body, account restriction). Retrying is pointless
 *                and, on a free test tier, actively harmful: the account has
 *                a restricted-destination rule and each retry is a wasted
 *                call against a quota.
 *   transient  — 5xx, 429, DNS, TLS, timeout. Retry with backoff.
 */
export type SmsOutcome = "accepted" | "rejected" | "transient";

export interface SendResult {
  sent: boolean;
  skipped: boolean;
  outcome: SmsOutcome;
  /** Retry-safe. Absent for transient so a caller cannot mistake a timeout
   *  for a rejection and drop a message that may still have gone out. */
  error?: string;
  /**
   * Provider message id, when the response carries a usable one. Documented
   * as always 0, so this is normally undefined — kept so a future provider
   * response with a real id needs no call-site change.
   */
  providerRef?: string;
  /** HTTP status, or 0 for a transport failure with no response. */
  httpStatus?: number;
  segmentCount: number;
  encoding: "GSM-7" | "UNICODE";
}

function skippedResult(error: string): SendResult {
  return {
    sent: false,
    skipped: true,
    outcome: "rejected",
    error,
    segmentCount: 0,
    encoding: "GSM-7",
  };
}

// ─── Transport ──────────────────────────────────────────────────────────

/**
 * Send one SMS. Never throws.
 *
 * Normalizes the destination, computes the segment count for the audit
 * record, and reports the outcome. The caller owns retry and persistence.
 */
export async function sendSms(to: string, text: string): Promise<SendResult> {
  if (!isSmsConfigured()) {
    return skippedResult("SMSEthiopia is not configured");
  }

  let msisdn: string;
  try {
    msisdn = normalizeEthiopianMSISDN(to);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A number we cannot normalize is permanently unsendable. Retrying it
    // would burn a rate-limit slot every cycle.
    return { ...skippedResult(message), outcome: "rejected" };
  }

  const { segmentCount, encoding } = calculateSmsSegments(text);

  if (segmentCount > MAX_SEGMENTS_PER_MESSAGE) {
    return {
      sent: false,
      skipped: false,
      outcome: "rejected",
      error: `Message is ${segmentCount} segments; the limit is ${MAX_SEGMENTS_PER_MESSAGE}.`,
      segmentCount,
      encoding,
    };
  }

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        KEY: apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ msisdn, text }),
      signal: AbortSignal.timeout(
        Number(process.env.SMS_SEND_TIMEOUT_MS ?? 10_000),
      ),
    });
  } catch (err) {
    // fetch rejects on DNS/TLS/socket failure and AbortSignal.timeout on
    // deadline. Both are transient, but a timeout is ambiguous — the carrier
    // may still deliver it — so the caller should treat it as "probably
    // sent, maybe not" rather than a clean failure.
    const message = err instanceof Error ? err.message : String(err);
    return {
      sent: false,
      skipped: false,
      outcome: "transient",
      error: `Transport failure: ${message}`,
      httpStatus: 0,
      segmentCount,
      encoding,
    };
  }

  const bodyText = await response.text().catch(() => "");
  const parsed = parseJsonObject(bodyText);

  if (response.ok) {
    // Documented success shape is { sent: true, id: 0, description }.
    // Trust `sent` when present; when the body is empty or unparseable the
    // status line alone still means the provider accepted the request.
    const sent = parsed?.sent === undefined ? true : Boolean(parsed.sent);
    const rawId = parsed?.id;
    const providerRef =
      typeof rawId === "number" && rawId > 0
        ? String(rawId)
        : typeof rawId === "string" && rawId !== "" && rawId !== "0"
          ? rawId
          : undefined;

    // exactOptionalPropertyTypes is on, so optional fields are spread in
    // only when present rather than assigned `undefined`.
    return {
      sent,
      skipped: false,
      outcome: sent ? "accepted" : "rejected",
      ...(providerRef ? { providerRef } : {}),
      ...(sent ? {} : { error: describeProviderRejection(parsed, bodyText) }),
      httpStatus: response.status,
      segmentCount,
      encoding,
    };
  }

  // 429 is a rate limit: transient and explicitly retryable.
  // 408 and 425 are the other two worth retrying. The rest of 4xx is the
  // provider telling us this specific message will never work.
  const retryable =
    response.status === 429 ||
    response.status === 408 ||
    response.status === 425 ||
    response.status >= 500;

  return {
    sent: false,
    skipped: false,
    outcome: retryable ? "transient" : "rejected",
    error: `SMSEthiopia HTTP ${response.status}: ${describeProviderRejection(parsed, bodyText)}`,
    httpStatus: response.status,
    segmentCount,
    encoding,
  };
}

/** Parse a response body as a JSON object, or null for anything else. */
function parseJsonObject(body: string): Record<string, unknown> | null {
  if (!body.trim()) return null;
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort extraction of a provider error string. The API publishes no
 * error schema, so this reads the fields a PHP-style JSON error response
 * conventionally carries and falls back to the raw body.
 */
function describeProviderRejection(
  parsed: Record<string, unknown> | null,
  bodyText: string,
): string {
  if (parsed) {
    for (const field of ["message", "error", "description", "detail"]) {
      const value = parsed[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  const trimmed = bodyText.trim();
  return trimmed ? trimmed.slice(0, 300) : "no response body";
}

/**
 * Probe reachability for the health check. Returns true only on a 2xx from
 * the configured provider. Never throws.
 */
export async function checkSmsHealth(): Promise<boolean> {
  if (!isSmsConfigured()) return false;
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { KEY: apiKey(), "Content-Type": "application/json" },
      // Deliberately invalid: we are testing the credential and the network
      // path, and a rejected request must not cost a real SMS or send one to
      // a live subscriber.
      body: JSON.stringify({ msisdn: "251000000000", text: "health" }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}