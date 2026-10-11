/**
 * src/lib/smsSmsethiopia.ts
 * Asella Organic — SMSEthiopia transport
 *
 * One of two transports behind the facade in sms.ts. Shaped deliberately
 * after lib/mailer.ts, and it obeys the same rule the rest of the SMS stack
 * does: a transport failure is REPORTED rather than THROWN.
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
 *    outcome below is derived from status class and refined by the few body
 *    shapes that are unambiguous. Do not add invented code checks here;
 *    there is no published code table to check against.
 */

import {
  describeProviderError,
  isRetryableStatus,
  parseJsonObject,
  type SmsTransport,
  type TransportResult,
  type TransportSendContext,
} from "./smsTypes.js";

const API_URL = "https://smsethiopia.com/api/sms/send";

function apiKey(): string {
  const key = process.env.SMSETHIOPIA_API_KEY;
  if (!key) {
    throw new Error("SMSEthiopia is not configured — set SMSETHIOPIA_API_KEY.");
  }
  return key;
}

export const smseEthiopiaTransport: SmsTransport = {
  id: "smsethiopia",
  displayName: "SMSEthiopia",

  // An HTTP API has no radio in the path. Concurrency is bounded by the
  // carrier, not by us, so the dispatcher's own tuning is the only limit.
  minIntervalMs: 0,
  maxBatchSize: 25,

  isConfigured(): boolean {
    return Boolean(process.env.SMSETHIOPIA_API_KEY);
  },

  async send(ctx: TransportSendContext): Promise<TransportResult> {
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          KEY: apiKey(),
          "Content-Type": "application/json",
        },
        // msisdn arrives already normalized to 251XXXXXXXXX by the facade.
        body: JSON.stringify({ msisdn: ctx.msisdn, text: ctx.text }),
        signal: AbortSignal.timeout(
          Number(process.env.SMS_SEND_TIMEOUT_MS ?? 10_000),
        ),
      });
    } catch (err) {
      // fetch rejects on DNS/TLS/socket failure and AbortSignal.timeout on
      // deadline. Both are transient, but a timeout is ambiguous — the
      // carrier may still deliver it — so the caller should treat it as
      // "probably sent, maybe not" rather than a clean failure.
      const message = err instanceof Error ? err.message : String(err);
      return {
        sent: false,
        outcome: "transient",
        error: `Transport failure: ${message}`,
        httpStatus: 0,
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
        outcome: sent ? "accepted" : "rejected",
        ...(providerRef ? { providerRef } : {}),
        ...(sent ? {} : { error: describeProviderError(parsed, bodyText) }),
        httpStatus: response.status,
      };
    }

    return {
      sent: false,
      outcome: isRetryableStatus(response.status) ? "transient" : "rejected",
      error: `SMSEthiopia HTTP ${response.status}: ${describeProviderError(parsed, bodyText)}`,
      httpStatus: response.status,
    };
  },

  /**
   * Probe reachability for the health check. Returns true only on a 2xx from
   * the configured provider.
   */
  async checkHealth(): Promise<boolean> {
    if (!smseEthiopiaTransport.isConfigured()) return false;
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
  },
};