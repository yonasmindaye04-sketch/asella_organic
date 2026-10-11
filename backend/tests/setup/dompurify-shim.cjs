/**
 * tests/setup/dompurify-shim.cjs
 *
 * Test double for `isomorphic-dompurify`, which is ESM-only and cannot be
 * required from Jest's CommonJS module registry. Tests must NOT silently
 * exercise a weaker sanitizer than production uses, so this mirrors the two
 * behaviours of the real library that lib/security.ts depends on:
 *
 *   1. FORBID_CONTENTS elements are removed WITH their text content.
 *      DOMPurify keeps the children of a removed tag by default
 *      (KEEP_CONTENT), but exempts a fixed list of elements whose content is
 *      itself executable or metadata. That list is reproduced verbatim below.
 *      Stripping `<script>` but leaving `alert("xss")` behind is what this
 *      shim used to do, which is why security.test.ts had three permanently
 *      red assertions that said nothing true about production.
 *
 *   2. Everything else is unwrapped, keeping the text.
 *
 * The options argument is accepted and ignored: lib/security.ts always calls
 * with ALLOWED_TAGS: [] and ALLOWED_ATTR: [], which is the strictest setting
 * and therefore the one this shim implements.
 *
 * If the real library ever becomes loadable here, delete the moduleNameMapper
 * entry in jest.config.js:18 and prefer the genuine article over any double.
 */

// Verbatim from dompurify's DEFAULT_FORBID_CONTENTS.
const FORBID_CONTENTS = [
  "annotation-xml", "audio", "colgroup", "desc", "foreignobject", "head",
  "iframe", "math", "mi", "mn", "mo", "ms", "mtext", "noembed", "noframes",
  "noscript", "plaintext", "script", "style", "svg", "template", "thead",
  "title", "video", "xmp",
];

const FORBID_RE = new RegExp(
  `<(${FORBID_CONTENTS.join("|")})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  "gi"
);

// Unclosed variants, e.g. a bare "<script>" with no closing tag: drop to end.
const UNCLOSED_FORBID_RE = new RegExp(
  `<(${FORBID_CONTENTS.join("|")})\\b[^>]*>[\\s\\S]*$`,
  "gi"
);

const TAG_RE = /<[^>]*>/g;

function sanitize(input) {
  if (typeof input !== "string") return input;
  return input
    .replace(FORBID_RE, "")
    .replace(UNCLOSED_FORBID_RE, "")
    .replace(TAG_RE, "");
}

module.exports = {
  sanitize,
  default: { sanitize },
};
