/**
 * src/utils/smsSegments.ts
 * Asella Organic — client-side GSM-7 / UCS-2 segment counter
 *
 * A live copy of the segment maths in backend/src/lib/smsNormalize.ts,
 * substituted for the composer's per-keystroke feedback. The AUTHORITATIVE
 * value is always computed server-side at preview and dispatch time — this
 * mirror exists so the operator can watch the segment count rise before
 * they commit any spend.
 *
 * SMS segments drive billing: 160 chars/segment in GSM-7, 70 in UCS-2.
 * Amharic is UCS-2, so the same greting costs ~2.3x more in Amharic than
 * in English, and a native eyeball of "how many characters" is unreliable.
 */

export type SmsEncoding = 'GSM-7' | 'UNICODE';

export interface SegmentResult {
  encoding: SmsEncoding;
  characterCount: number;
  segmentCount: number;
  charsRemaining: number;
}

export const GSM7_SINGLE = 160;
export const GSM7_MULTI = 153;
export const UCS2_SINGLE = 70;
export const UCS2_MULTI = 67;

/**
 * GSM 03.38 basic alphabet plus the extension table. Same table as the
 * backend's; anything outside it forces UCS-2. Accented Latin (é, ü, ñ)
 * really is in the basic set — simplified regex checks that assume
 * /[^\x00-\x7F]/ == UCS-2 would over-quote the cost.
 */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./" +
  "0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€_";

export function detectSmsEncoding(text: string): SmsEncoding {
  for (const char of text) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENDED.includes(char)) {
      return 'UNICODE';
    }
  }
  return 'GSM-7';
}

export function calculateSmsSegments(text: string): SegmentResult {
  const encoding = detectSmsEncoding(text);
  // Spread into an array so an emoji counts as ONE character (a grapheme)
  // rather than a UTF-16 pair — the carrier bills UTF-16 code units, but the
  // per-message cap in the composer is a character-count UI concern.
  const characterCount = [...text].length;

  if (characterCount === 0) {
    return {
      encoding,
      characterCount: 0,
      segmentCount: 0,
      charsRemaining: encoding === 'GSM-7' ? GSM7_SINGLE : UCS2_SINGLE,
    };
  }

  if (encoding === 'GSM-7') {
    const single = characterCount <= GSM7_SINGLE;
    const segmentCount = single ? 1 : Math.ceil(characterCount / GSM7_MULTI);
    const capacity = single ? GSM7_SINGLE : segmentCount * GSM7_MULTI;
    return { encoding, characterCount, segmentCount, charsRemaining: capacity - characterCount };
  }

  // UCS-2 is billed per UTF-16 code unit, so an emoji counts twice.
  const encodedLength = text.length;
  const single = encodedLength <= UCS2_SINGLE;
  const segmentCount = single ? 1 : Math.ceil(encodedLength / UCS2_MULTI);
  const capacity = single ? UCS2_SINGLE : segmentCount * UCS2_MULTI;
  return { encoding, characterCount, segmentCount, charsRemaining: capacity - encodedLength };
}

/** The backend's published 0.10-0.45 ETB/segment band, in ETB. */
export function estimateSmsCostEtb(segmentCount: number): { min: number; max: number } {
  return { min: segmentCount * 0.1, max: segmentCount * 0.45 };
}

/** Formats a cost band as "37.00 – 166.50 ETB" for the audit trail UI. */
export function formatCostBand(min: number, max: number): string {
  return `${min.toFixed(2)} – ${max.toFixed(2)} ETB`;
}