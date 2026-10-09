/**
 * src/lib/smsNormalize.ts
 * Asella Organic — Ethiopian MSISDN normalization + SMS segment maths
 *
 * Pure functions only. No DB, no network, no config. Everything here is
 * unit-testable in isolation and is the single source of truth for how a
 * phone number becomes a destination string and how a message body becomes
 * a number of billable segments.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 * SMSEthiopia requires the destination in 251XXXXXXXXX form: no plus sign,
 * no leading zero, no separators. What we store is not that. `customers.phone`
 * and `orders.phone` are VARCHAR(50) and in practice hold strings like
 * "+251 911234567" (NewOrderPage joins a country-code select to a national
 * number with a space). Two ad-hoc `replace(/\s/g, "")` calls exist in the
 * codebase — neither strips a leading "+", and both would leave "0911234567"
 * as a local number the carrier cannot route.
 *
 * So: normalize on the way out, never mutate storage. Rewriting
 * customers.phone in place would collide with its UNIQUE index (the same
 * person can currently exist as "+251911234567", "0911234567" and
 * "251 911 234 567"), and that merge is a separate piece of work with its
 * own rollback plan.
 */

/** Ethio Telecom mobile prefixes: Safaricom (091/2519) and Ethio Telecom (071/2517). */
const MSISDN_INTERNATIONAL = /^251[79]\d{8}$/;
const MSISDN_LOCAL = /^0[79]\d{8}$/;

/**
 * Strip presentation formatting without altering digits.
 * Handles "+251 911 234 567", "(251) 911-234-567", "0911 23 45 67".
 */
function stripFormatting(raw: string): string {
  return raw.trim().replace(/[\s\-().+]/g, "");
}

/**
 * Normalize any accepted Ethiopian mobile number to 251XXXXXXXXX.
 *
 * Accepted:
 *   251911234567   already international
 *   +251911234567  international with a plus
 *   0911234567     local Safaricom
 *   0711234567     local Ethio Telecom
 *   any of the above with spaces, dashes, dots or parentheses
 *
 * Throws on anything else. Landline ranges (25111...), invalid lengths and
 * empty input are rejected rather than passed through to the carrier — a
 * send that will certainly fail costs a retry cycle and an error log entry.
 */
export function normalizeEthiopianMSISDN(rawInput: string): string {
  if (!rawInput || typeof rawInput !== "string") {
    throw new Error("Phone number input cannot be empty.");
  }

  const cleaned = stripFormatting(rawInput);

  if (MSISDN_INTERNATIONAL.test(cleaned)) {
    return cleaned;
  }

  if (MSISDN_LOCAL.test(cleaned)) {
    return `251${cleaned.slice(1)}`;
  }

  throw new Error(
    `Invalid Ethiopian mobile number: "${rawInput}". Expected 09XXXXXXXX, ` +
      "07XXXXXXXX, or 251XXXXXXXXX."
  );
}

/** Non-throwing variant, for CSV rows and bulk validation. */
export function tryNormalizeEthiopianMSISDN(rawInput: string): string | null {
  try {
    return normalizeEthiopianMSISDN(rawInput);
  } catch {
    return null;
  }
}

/**
 * Canonical display form for staff and templates: 0911 234 567.
 * For rendering only — never a send destination.
 */
export function formatEthiopianMSISDN(msisdn: string): string {
  const digits = stripFormatting(msisdn);
  if (digits.length !== 12 || !digits.startsWith("251")) return msisdn;
  // 251911234567 -> national 0911234567, grouped 4-3-3 as Ethiopian mobile
  // numbers are conventionally written. The leading 0 is re-added, so the
  // national part is digits 3..11 and the first group is 0 plus three.
  return `0${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
}

/** Canonical comparison/storage key, so one person is one row. */
export function msisdnKey(msisdn: string): string {
  return normalizeEthiopianMSISDN(msisdn);
}

// ── Segment maths ──────────────────────────────────────────────────────
//
// Segment count is what the customer is billed on (0.10–0.45 ETB), so this
// drives the dry-run cost estimate and the audit record. Getting it wrong
// means quoting a price that is off by 2x for Amharic copy.
//
// GSM-7 (Latin)  : 160 chars single, 153 per subsequent segment.
// UCS-2 (Unicode):  70 chars single,  67 per subsequent segment.
//
// Ethiopic script (U+1200–U+137F) forces UCS-2, so an Amharic message is
// cut to roughly half the length of the same content in English.

/**
 * The GSM 03.38 basic character set plus the extension table, minus the
 * chars that most consoles silently mangle. Everything outside this set is
 * billed as UCS-2.
 */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./" +
  "0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€_";

export type SmsEncoding = "GSM-7" | "UNICODE";

export interface SegmentCountResult {
  encoding: SmsEncoding;
  characterCount: number;
  segmentCount: number;
  charsRemaining: number;
  /** Total code units after the encoding is applied — what the carrier bills. */
  encodedLength: number;
}

export const GSM7_SINGLE = 160;
export const GSM7_MULTI = 153;
export const UCS2_SINGLE = 70;
export const UCS2_MULTI = 67;

/**
 * Classify text as GSM-7 or UCS-2.
 *
 * A naive /[^\x00-\x7F]/ test misclassifies anything with an accented Latin
 * letter or a curly quote as GSM-7 when the carrier bills it as UCS-2, which
 * under-quotes the cost. Ethiopic, emoji, CJK and typographic punctuation all
 * fall outside the GSM 03.38 tables and are correctly UCS-2 here.
 */
export function detectSmsEncoding(text: string): SmsEncoding {
  for (const char of text) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENDED.includes(char)) {
      return "UNICODE";
    }
  }
  return "GSM-7";
}

/**
 * Segment count and remaining headroom in the final segment.
 *
 * This is the function the composer calls on every keystroke and the one the
 * server calls again before enqueuing — the server result is the billable
 * one, the client result is advisory feedback.
 */
export function calculateSmsSegments(text: string): SegmentCountResult {
  const encoding = detectSmsEncoding(text);
  const characterCount = [...text].length;

  if (characterCount === 0) {
    return {
      encoding,
      characterCount: 0,
      segmentCount: 0,
      charsRemaining: encoding === "GSM-7" ? GSM7_SINGLE : UCS2_SINGLE,
      encodedLength: 0,
    };
  }

  if (encoding === "GSM-7") {
    const single = characterCount <= GSM7_SINGLE;
    const segmentCount = single ? 1 : Math.ceil(characterCount / GSM7_MULTI);
    const capacity = single ? GSM7_SINGLE : segmentCount * GSM7_MULTI;
    return {
      encoding,
      characterCount,
      segmentCount,
      charsRemaining: capacity - characterCount,
      encodedLength: segmentCount === 1 ? characterCount : characterCount + segmentCount,
    };
  }

  // UCS-2 is measured in UTF-16 code units, so an astral character (emoji)
  // counts as 2 even though [...text] reports it as 1.
  const encodedLength = text.length;
  const single = encodedLength <= UCS2_SINGLE;
  const segmentCount = single ? 1 : Math.ceil(encodedLength / UCS2_MULTI);
  const capacity = single ? UCS2_SINGLE : segmentCount * UCS2_MULTI;
  return {
    encoding,
    characterCount,
    segmentCount,
    charsRemaining: capacity - encodedLength,
    encodedLength,
  };
}

/** Published SMSEthiopia rate band, ETB per segment. */
export const SMS_PRICE_MIN_ETB = 0.1;
export const SMS_PRICE_MAX_ETB = 0.45;

/**
 * Estimated spend in ETB. Quoted as a band, never a point estimate — the
 * tier is determined by the account's volume and a single number would imply
 * a precision the rate card does not support.
 */
export function estimateSmsCostEtb(
  segmentCount: number,
): { min: number; max: number } {
  const min = segmentCount * SMS_PRICE_MIN_ETB;
  const max = segmentCount * SMS_PRICE_MAX_ETB;
  return { min: round2(min), max: round2(max) };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Template rendering ─────────────────────────────────────────────────

export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * Replace {{placeholder}} tokens. Unknown tokens collapse to an empty string
 * rather than leaking the braces into a customer's handset.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
}