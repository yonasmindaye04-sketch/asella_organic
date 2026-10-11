/**
 * src/lib/smsTextbee.ts
 * Asella Organic — TextBee transport (self-hosted or textbee.dev)
 *
 * The second transport behind the facade in sms.ts. TextBee turns an Android
 * handset into an SMS gateway: the phone runs their app, holds the SIM, and
 * sends messages when we ask the API to tell it to.
 *
 * ── Read this before choosing it for a campaign ───────────────────────────
 *
 * This trades a per-message cost for a hardware dependency, and the trade is
 * not free. Three things differ from an HTTP provider, and they are the
 * reason this is a switch rather than a replacement:
 *
 * 1. ACCEPTANCE IS WEAKER. A 2xx here means "handed to the device", not
 *    "the carrier has it". SMSEthiopia's 2xx is closer to a carrier
 *    acceptance. Neither returns a delivery receipt, so neither can prove a
 *    handset received anything — but TextBee adds a second failure window
 *    (API accepted, then the phone was asleep, out of credit, or off the
 *    network) that is invisible to us. `accepted` here genuinely means
 *    "submitted", and the audit record should be read that way.
 *
 * 2. THROUGHPUT IS RADIO-BOUND. One handset manages roughly one message
 *    every few seconds, not the 25-per-tick burst an HTTP API absorbs. The
 *    pacing fields below enforce that against the dispatcher, so a
 *    500-recipient campaign takes roughly 40 minutes instead of 40 seconds.
 *    Plan campaign windows around that, and add devices for throughput —
 *    but note that adding devices multiplies the handsets you must keep
 *    charged, online, and topped up.
 *
 * 3. THE SENDER IS THE SIM. Customers see a raw Ethiopian mobile number, not
 *    an alphanumeric sender ID. There is no sender field in this API. That
 *    reads as spam and suppresses reply rates, so it is usually right for
 *    transactional traffic to an existing customer and wrong for campaigns.
 *
 * The recurring failure mode to watch for is the handset simply not being
 * there — powered off, the app killed by the OS, the SIM out of credit. TextBee
 * reports some of these as 4xx and some as an accepted job that never left
 * the device. A sudden drop in first-attempt accept rate, with no matching
 * jump in retries, usually means the phone, not the account.
 *
 * ── Provider contract (textbee README, verified against upstream vernu/
 *    textbee) ─────────────────────────────────────────────────────────────
 *
 *   POST {base}/api/v1/gateway/devices/{deviceId}/send-sms
 *   Headers: x-api-key: <api_key>, Content-Type: application/json
 *   Body:    { "recipients": ["+251XXXXXXXXX"], "message": "..." }
 *
 * 4. The destination carries a LEADING PLUS. SMSEthiopia wants 251XXXXXXXXX
 *    with no plus. The facade normalizes to the latter and this file adds the
 *    plus back, so the stored and audited form stays identical across
 *    providers and only this line knows about the difference.
 *
 * 5. x-api-key is the only documented auth. No Bearer, no query string.
 *
 * 6. `recipients` is an array and TextBee will happily fan one message out
 *    to many numbers in a single call. We do NOT use that. The queue
 *    accounts for cost per recipient, enforces per-recipient opt-out, and
 *    writes one sms_messages row per person; a fan-out call would collapse
 *    all of that into one opaque result and make an opt-out unenforceable.
 *    One message, one recipient, always.
 */

import {
  describeProviderError,
  isRetryableStatus,
  parseJsonObject,
  type SmsTransport,
  type TransportResult,
  type TransportSendContext,
} from "./smsTypes.js";

/** textbee.dev cloud API. Self-hosted deployments override this. */
const DEFAULT_BASE_URL = "https://api.textbee.dev";

/**
 * Floor between sends, in milliseconds.
 *
 * A handset on the mobile network is radio-bound: requests to the handset
 * serialize through the cellular modem, and a burst simply overwrites the
 * previous ones. 5s is roughly 12 messages a minute, or 720 an hour.
 * Raising this is the correct response to carrier throttling complaints;
 * lowering it will not increase real throughput.
 */
const MIN_INTERVAL_MS = 5_000;

/**
 * Messages per dispatcher tick. One, deliberately — see MIN_INTERVAL_MS.
 * The dispatcher clamps SMS_DISPATCH_BATCH_SIZE down to this.
 */
const MAX_BATCH_SIZE = 1;

function baseUrl(): string {
  const raw = process.env.TEXTBEE_BASE_URL || DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function deviceId(): string {
  const id = process.env.TEXTBEE_DEVICE_ID;
  if (!id) {
    throw new Error("TextBee is not configured — set TEXTBEE_DEVICE_ID.");
  }
  return id;
}

function apiKey(): string {
  const key = process.env.TEXTBEE_API_KEY;
  if (!key) {
    throw new Error("TextBee is not configured — set TEXTBEE_API_KEY.");
  }
  return key;
}

/**
 * The handset path is slower than an HTTP provider's: the request has to
 * reach a phone, and the app may be waking up. Default well above the
 * SMSEthiopia timeout, and cap well above it too — a phone that is merely
 * asleep should retry, not be recorded as a hard failure.
 */
function timeoutMs(): number {
  return Number(process.env.TEXTBEE_SEND_TIMEOUT_MS ?? 20_000);
}

export const textbeeTransport: SmsTransport = {
  id: "textbee",
  displayName: "TextBee",

  minIntervalMs: MIN_INTERVAL_MS,
  maxBatchSize: MAX_BATCH_SIZE,

  isConfigured(): boolean {
    // Both are required: a key without a device has nothing to send from.
    return Boolean(process.env.TEXTBEE_API_KEY && process.env.TEXTBEE_DEVICE_ID);
  },

  async send(ctx: TransportSendContext): Promise<TransportResult> {
    let endpoint: string;
    try {
      endpoint = `${baseUrl()}/api/v1/gateway/devices/${encodeURIComponent(deviceId())}/send-sms`;
    } catch (err) {
      // Misconfiguration is terminal. Retrying it every cycle would burn
      // backoff cycles and fill the error log with one repeated line.
      return {
        sent: false,
        outcome: "rejected",
        error: err instanceof Error ? err.message : String(err),
        httpStatus: 0,
      };
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": apiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // The plus sign is TextBee's requirement; the facade handed us
          // 251XXXXXXXXX. See the note at the top of this file.
          recipients: [`+${ctx.msisdn}`],
          message: ctx.text,
        }),
        signal: AbortSignal.timeout(timeoutMs()),
      });
    } catch (err) {
      // A timeout here is genuinely ambiguous: the handset may well have sent
      // it. It must stay retryable so the queue cannot mistake a slow phone
      // for a rejection and silently drop a customer's order confirmation.
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
      // TextBee reports { success: true, data: [...] }. As with SMSEthiopia,
      // an empty or unparseable body still means the API took the request —
      // a proxy serving an HTML page with a 200 is far more likely than a
      // successful send that somehow carries no body.
      const success = parsed?.success === undefined ? true : Boolean(parsed.success);

      // TextBee does not issue a per-message id. There is nothing to
      // correlate a receipt against, so providerRef stays absent — the
      // sms_messages.provider_ref column stays NULL, as it already does for
      // SMSEthiopia.
      return {
        sent: success,
        outcome: success ? "accepted" : "rejected",
        ...(success ? {} : { error: describeProviderError(parsed, bodyText) }),
        httpStatus: response.status,
      };
    }

    // 401/403 is a wrong API key and 404 is a device that was never
    // registered — both permanent until someone edits the environment, so
    // they land in `rejected` and are not retried. 429 and 5xx are the
    // handset or the API being briefly unable to keep up.
    const retryable = isRetryableStatus(response.status);

    return {
      sent: false,
      outcome: retryable ? "transient" : "rejected",
      error: `TextBee HTTP ${response.status}: ${describeProviderError(parsed, bodyText)}`,
      httpStatus: response.status,
    };
  },

  /**
   * Probe reachability for the health check.
   *
   * A cheap authenticated GET against the device list rather than a send:
   * this must never put a real message on a customer's handset. It confirms
   * the API key is live and the API is reachable, but NOT that the handset
   * is powered on or has credit — TextBee reports those as an accepted job
   * that never leaves the device. For the real device check, open the
   * TextBee dashboard.
   */
  async checkHealth(): Promise<boolean> {
    if (!textbeeTransport.isConfigured()) return false;
    try {
      const response = await fetch(`${baseUrl()}/api/v1/gateway/devices`, {
        method: "GET",
        headers: { "x-api-key": apiKey() },
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok || response.status < 500;
    } catch {
      return false;
    }
  },
};