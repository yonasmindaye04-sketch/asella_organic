/**
 * tests/setup/isomorphic-dompurify-mock.js
 *
 * Jest mock for `isomorphic-dompurify`. The real package pulls in
 * jsdom + parse5 + @asamuzakjp/css-color + a long transitive chain
 * of ESM-only packages, all of which Jest struggles to transform in
 * the "node" test environment.
 *
 * We replace it with a small regex-based sanitizer that covers the
 * unit tests' expectations (strip <script>, <b>, <em>, on* attributes,
 * and any tags). It is not a full DOMPurify substitute — integration
 * tests (real HTTP path) exercise the real sanitizer in-process.
 *
 * Sanitization rules:
 *   - <script>...</script>              → removed entirely
 *   - <anytag attrs>...</anytag>        → text content kept
 *   - <img onerror="..." />             → removed entirely
 *   - leading/trailing whitespace       → trimmed
 */

"use strict";

const SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const TAG_RE    = /<[^>]+>/g;
const EVENT_ATTR_RE = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SELF_CLOSING_VOID = /<(?:img|br|hr|input|meta|link)\b[^>]*\/?>/gi;

function sanitize(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(SCRIPT_RE, "")
    .replace(SELF_CLOSING_VOID, "")
    .replace(EVENT_ATTR_RE, "")
    .replace(TAG_RE, "")
    .trim();
}

module.exports = {
  __esModule: true,
  default: { sanitize },
  sanitize,
};
