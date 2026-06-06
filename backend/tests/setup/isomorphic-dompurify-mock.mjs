/**
 * tests/setup/isomorphic-dompurify-mock.mjs
 *
 * Jest mock for `isomorphic-dompurify`. The real package pulls in
 * jsdom + parse5 + @asamuzakjp/css-color + a long transitive chain
 * of ESM-only packages, all of which Jest struggles to transform in
 * the "node" test environment.
 *
 * Written as a pure ESM `.mjs` file (default export) so Jest's
 * `useESM: true` loader sees a real ESM module with a named default
 * export — same shape as the real package.
 *
 * We replace it with a small regex-based sanitizer that covers the
 * unit tests' expectations (strip <script>, <b>, <em>, on* attributes,
 * and any tags). It is not a full DOMPurify substitute — integration
 * tests (real HTTP path) exercise the real sanitizer in-process.
 */

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

const mock = { sanitize };
export default mock;
export { sanitize };
