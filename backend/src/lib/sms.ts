/**
 * src/lib/sms.ts
 * Asella Organic — SMS facade and provider selection
 *
 * Shaped deliberately after lib/mailer.ts: the same exports, the same
 * SendResult contract, and the same rule that a transport failure is
 * REPORTED rather than THROWN.
 *
 * That rule is not stylistic. Sends happen inside order-status handling and
 * campaign dispatch, where a thrown error would either roll back a committed
 * order or abort a 500-recipient batch after 40 have already gone out. Every
 * caller decides what to do with a failure from the returned value.
 *
 * ── What lives where ─────────────────────────────────────────────────────
 *
 * This file owns everything that must behave identically no matter which
 * provider is selected:
 *
 *   • destination normalization  (smsNormalize.ts, pure)
 *   • segment counting           (smsNormalize.ts, pure)
 *   • the segment ceiling        (a cost guard, not a provider limit)
 *   • the SendResult contract    (what the queue's retry policy reads)
 *
 * Provider-specific concerns — endpoints, auth headers, retry semantics,
 * pacing — live in smsSmsethiopia.ts and smsTextbee.ts. A transport receives
 * an already-normalized destination and an already-checked body, and returns
 * only what is specific to the provider.
 *
 * ── Selecting a provider ─────────────────────────────────────────────────
 *
 * SMS_PROVIDER picks the transport; it defaults to "smsethiopia", so an
 * existing deployment that sets no new variables behaves exactly as it did
 * before this split. Adding a provider is a new transport file and one line
 * in PROVIDERS below — no call site moves.
 *
 * The switch exists because the two available providers are not
 * interchangeable. SMSEthiopia is an HTTP API with per-message billing and no
 * hardware dependency. TextBee sends from a physical Android handset and has
 * neither a per-message cost nor a carrier-grade sender ID. Keeping both
 * reachable means TextBee can carry low-volume traffic and testing while
 * campaigns stay on a provider with a real throughput ceiling — and that
 * there is still a working fallback if one is unavailable.
 */

/**
 * Hard provider ceiling. SMSEthiopia publishes no length limit; a single
 * GSM-7 message is 160 chars and anything beyond a handful of segments is
 * both expensive and unreadable on a handset. Rejecting here keeps a paste
 * accident from becoming a 10-segment bill.
 *
 * This is a project-level cost and readability policy, not a provider
 * limit — it applies identically whichever transport is active, and does not
 * relax for TextBee just because a handset has no per-message price. The
 * customer's data allowance is not free.
 */
export const MAX_SEGMENTS_PER_MESSAGE = 5;

import {
  normalizeEthiopianMSISDN,
  calculateSmsSegments,
  type SmsEncoding,
} from "./smsNormalize.js";

import { smseEthiopiaTransport } from "./smsSmsethiopia.js";
import { textbeeTransport } from "./smsTextbee.js";
import type {
  SmsOutcome,
  SmsProviderId,
  SmsTransport,
  TransportResult,
} from "./smsTypes.js";

export type { SmsOutcome, SmsProviderId, SmsTransport } from "./smsTypes.js";

/** Every transport this build knows how to talk to. */
const PROVIDERS: Record<SmsProviderId, SmsTransport> = {
  smsethiopia: smseEthiopiaTransport,
  textbee: textbeeTransport,
};

function configuredProviderId(): SmsProviderId {
  const raw = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  // An unrecognised value falls back to the default rather than throwing.
  // This is read on every send; a typo in a staging .env should not take
  // the dispatcher down at boot with an exception from deep in a queue tick.
  if (raw === "textbee") return "textbee";
  return "smsethiopia";
}

/** The transport that sends right now. */
export function activeSmsTransport(): SmsTransport {
  return PROVIDERS[configuredProviderId()];
}

/** Identifier of the active transport, for status output and logs. */
export function activeSmsProviderId(): SmsProviderId {
  return configuredProviderId();
}

/** Human-readable name of the active transport, e.g. for an admin screen. */
export function activeSmsProviderName(): string {
  return activeSmsTransport().displayName;
}

// ─── Configuration ──────────────────────────────────────────────────────

/**
 * Whether the ACTIVE transport has what it needs.
 *
 * Deliberately transport-scoped rather than "any credential is present": on a
 * box carrying both an SMSEthiopia key and TextBee credentials, this must
 * reflect the provider that would actually be used, or the dispatcher would
 * start while every send fails on the missing half of TextBee's config.
 */
export function isSmsConfigured(): boolean {
  return activeSmsTransport().isConfigured();
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
  //
  // TextBee has no sender field either, and here the limitation is real
  // rather than cosmetic: recipients see the raw SIM number. The label is
  // shown in the admin UI so staff are not surprised by what a customer
  // actually receives.
  return process.env.SMS_SENDER_LABEL ?? "Asella Organic";
}

// ─── Result contract ────────────────────────────────────────────────────

/**
 * Public send result, as consumed by the queue.
 *
 *   accepted   — provider took it. Terminal, no retry.
 *   rejected   — provider refused this specific message. Retrying is
 *                pointless and, on a metered test tier, actively harmful.
 *   transient  — timeout, 5xx, 429, DNS, TLS. Retry with backoff.
 */
export interface SendResult {
  sent: boolean;
  skipped: boolean;
  outcome: SmsOutcome;
  /** Retry-safe. Absent for transient so a caller cannot mistake a timeout
   *  for a rejection and drop a message that may still have gone out. */
  error?: string;
  /** Provider message id, when the response carries a usable one. Normally
   *  absent — neither supported provider issues one. */
  providerRef?: string;
  /** HTTP status, or 0 for a transport failure with no response. */
  httpStatus?: number;
  segmentCount: number;
  encoding: SmsEncoding;
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

/** Merge a transport's provider-specific report into the full contract. */
function toSendResult(
  result: TransportResult,
  segmentCount: number,
  encoding: SmsEncoding,
): SendResult {
  return {
    sent: result.sent,
    skipped: false,
    outcome: result.outcome,
    // exactOptionalPropertyTypes is on, so optional fields are spread in
    // only when present rather than assigned `undefined`.
    ...(result.error !== undefined ? { error: result.error } : {}),
    ...(result.providerRef !== undefined
      ? { providerRef: result.providerRef }
      : {}),
    // httpStatus is 0 for a transport failure, which is meaningful — it
    // distinguishes "no response" from "never called". Test on undefined,
    // never truthiness.
    ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
    segmentCount,
    encoding,
  };
}

// ─── Transport ──────────────────────────────────────────────────────────

/**
 * Send one SMS. Never throws.
 *
 * Normalizes the destination, computes the segment count for the audit
 * record, applies the cost ceiling, and reports the outcome. The caller owns
 * retry and persistence.
 */
export async function sendSms(to: string, text: string): Promise<SendResult> {
  const transport = activeSmsTransport();

  if (!transport.isConfigured()) {
    return skippedResult(`${transport.displayName} is not configured`);
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

  // The transport must not throw: an unhandled rejection here would abort a
  // campaign batch mid-way. Catch defensively anyway and convert an
  // unexpected throw into the same "transient" shape a transport failure
  // would produce, so a bug in a new provider degrades into retries rather
  // than a crashed dispatcher.
  try {
    const result = await transport.send({ msisdn, text, segmentCount, encoding });
    return toSendResult(result, segmentCount, encoding);
  } catch (err) {
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
}

/**
 * Probe reachability for the health check. Returns true only on a 2xx from
 * the configured provider. Never throws.
 *
 * Provider-scoped: this must reflect the transport that would actually send,
 * not "whichever provider happens to be healthy".
 */
export async function checkSmsHealth(): Promise<boolean> {
  return activeSmsTransport().checkHealth();
}