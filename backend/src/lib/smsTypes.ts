/**
 * src/lib/smsTypes.ts
 * Asella Organic — provider-independent SMS transport contract
 *
 * Pure types. No network, no config, no DB. Everything a transport needs to
 * describe itself and perform one send lives here, so adding a provider is a
 * new file plus one line in sms.ts and nothing else in the codebase moves.
 *
 * ── What lives here and what does not ────────────────────────────────────
 *
 * DESTINATION FORMAT is deliberately NOT in this contract. The facade in
 * sms.ts normalizes to 251XXXXXXXXX before calling a transport, because that
 * is the form SMSEthiopia wants and it is the form we store. A transport
 * that needs another shape — TextBee wants a leading "+" — converts inside
 * its own file. That keeps "how we represent an Ethiopian MSISDN" a
 * project-wide decision rather than something each provider re-litigates.
 *
 * SEGMENT COUNTING is likewise absent. It is provider-independent billing
 * arithmetic and lives in smsNormalize.ts.
 *
 * DELIVERY RECEIPTS are absent because neither supported transport has them.
 * SMSEthiopia returns an `id` documented as always 0; TextBee hands the
 * message to the handset and never reports back. Both are "accepted, and we
 * will not hear again". The SendResult contract is deliberately honest about
 * this rather than carrying a status field nothing ever populates.
 *
 * ── Pacing fields ────────────────────────────────────────────────────────
 *
 * minIntervalMs and maxBatchSize exist because providers differ by two
 * orders of magnitude in how fast a message can leave the building.
 * SMSEthiopia is an HTTP API: a request is a request, and concurrency is
 * bounded by nothing but the carrier. TextBee is one physical Android phone
 * on the GPRS network, radio-bound to roughly one message every few seconds.
 * Without these fields a dispatcher tuned for an HTTP API would fire a
 * 25-message burst at a handset that can only manage one, and the failures
 * would surface as provider errors rather than as a pacing problem.
 */

import type { SmsEncoding } from "./smsNormalize.js";

/** Provider identifiers, matched by SMS_PROVIDER in the environment. */
export type SmsProviderId = "smsethiopia" | "textbee";

/**
 * Classification of a send attempt, for the queue's retry policy.
 *
 *   accepted   — provider took it. Terminal, no retry.
 *   rejected   — provider refused this specific message. Retrying is
 *                pointless and, against a rate-limited or metered provider,
 *                actively harmful.
 *   transient  — timeout, 5xx, 429, DNS, TLS. Retry with backoff.
 */
export type SmsOutcome = "accepted" | "rejected" | "transient";

/** What a transport is handed, already normalized and already size-checked. */
export interface TransportSendContext {
  /** 251XXXXXXXXX, no plus sign, no separators. */
  msisdn: string;
  text: string;
  /** Precomputed for the audit record and the campaign cost estimate. */
  segmentCount: number;
  encoding: SmsEncoding;
}

/**
 * What a transport reports back. Segment and encoding fields are deliberately
 * absent — the facade carries them from the context it already computed, so
 * a transport cannot disagree with the billing record about them.
 */
export interface TransportResult {
  sent: boolean;
  outcome: SmsOutcome;
  /** Retry-safe: never present for `transient`. */
  error?: string;
  /** Provider message id, when the provider actually issues one. */
  providerRef?: string;
  /** HTTP status, or 0 for a transport failure with no response. */
  httpStatus?: number;
}

export interface SmsTransport {
  readonly id: SmsProviderId;
  readonly displayName: string;

  /**
   * Floor the dispatcher must respect between ticks, in ms. The configured
   * SMS_DISPATCH_INTERVAL_MS is raised to this when it is lower — an operator
   * cannot accidentally outrun a handset by editing a tuning constant.
   */
  readonly minIntervalMs: number;

  /**
   * Ceiling on a single dispatcher tick's batch, regardless of
   * SMS_DISPATCH_BATCH_SIZE. See the pacing note above.
   */
  readonly maxBatchSize: number;

  /** Whether this transport has the credentials it needs. */
  isConfigured(): boolean;

  /**
   * Send exactly one message to exactly one recipient. Never throws — a
   * failure is reported through TransportResult, because this runs inside
   * order-status handling and campaign dispatch where a throw would roll back
   * a committed order or abort a batch mid-way.
   */
  send(ctx: TransportSendContext): Promise<TransportResult>;

  /** Reachability probe for the health check. Never throws. */
  checkHealth(): Promise<boolean>;
}

/**
 * Parse a response body as a JSON object, or null for anything else.
 *
 * Shared rather than duplicated: every provider here has at least one code
 * path that must survive a proxy returning an HTML error page with a 200.
 */
export function parseJsonObject(body: string): Record<string, unknown> | null {
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
 * Best-effort extraction of a provider error string. Reads the fields a
 * conventional JSON error response carries, falls back to the raw body.
 */
export function describeProviderError(
  parsed: Record<string, unknown> | null,
  bodyText: string,
): string {
  if (parsed) {
    for (const field of ["message", "error", "description", "detail", "title"]) {
      const value = parsed[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  const trimmed = bodyText.trim();
  return trimmed ? trimmed.slice(0, 300) : "no response body";
}

/**
 * Is this HTTP status worth retrying?
 *
 * 429 is the rate limit. 408 and 425 are the other two worth a second
 * attempt. Everything else in 4xx is the provider telling us this specific
 * message will never work — including 401 and 402, which no retry can fix.
 * 5xx is the provider's problem and usually transient.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 425 || status >= 500;
}