/**
 * src/lib/utils.ts
 * Asella Organic — Query Param Helpers
 *
 * Express types req.query values as:
 * string | string[] | ParsedQs | ParsedQs[] | undefined
 *
 * Parameterized queries expect: string | null
 * These helpers bridge that gap safely.
 */

import type { ParsedQs } from "qs";

type QueryValue = string | string[] | ParsedQs | ParsedQs[] | undefined | null;

/**
 * Safely extract a single string from any Express query param.
 * Returns null for anything that isn't a plain string.
 */
export function qs(value: QueryValue): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  // ParsedQs (nested object) — not a valid scalar param
  return null;
}

/**
 * Parse a query param as a positive integer with a fallback default.
 */
export function qsInt(value: QueryValue, defaultVal: number): number {
  const s = qs(value);
  if (!s) return defaultVal;
  const n = parseInt(s, 10);
  return isNaN(n) ? defaultVal : n;
}