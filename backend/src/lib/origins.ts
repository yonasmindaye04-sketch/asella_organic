export const isProduction = process.env.NODE_ENV === "production";

/**
 * Origins that are always allowed while developing.
 *
 * These are all addresses the developer controls: the loopback interface and
 * the private ranges a phone on the same LAN uses to reach the dev server.
 * A browser always sends the origin of the page it is on, so a page served
 * from one of these is the developer's own page.
 */
const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i;

/**
 * The origin of a URL, or null if the string is not a URL.
 */
function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Extra origins that may talk to this API cross-origin.
 *
 * ASE-2026-011: this list used to contain a wildcard pattern —
 *
 *   /^https?:\/\/[a-z0-9.-]+\.(run\.app|google\.com|googleusercontent\.com
 *      |trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/i
 *
 * — which trusted ANY host under those suffixes outside production. Those
 * suffixes are free to claim: anybody can start a Cloudflare quick tunnel
 * (`https://<random>.trycloudflare.com`), deploy a Cloud Run service
 * (`https://<project>.run.app`) or an ngrok tunnel, and then every one of
 * those origins was a trusted API origin.
 *
 * That matters because this list is not only the CORS allowlist — it is also
 * the CSRF Origin check (see app.ts §3b). A trusted origin passes the
 * Origin check on state-changing requests, so the wildcard turned the CSRF
 * gate into a pattern match over hostnames an attacker controls.
 *
 * The allowlist is now explicit. A hostname has to be named by the
 * operator:
 *
 *   PREVIEW_ORIGINS=https://my-tunnel.trycloudflare.com,https://x.ngrok.io
 *
 * The origin of TELEGRAM_MINIAPP_URL is included as well: that URL is
 * already configured by the operator for exactly this purpose (the Mini App
 * tunnel), so it is a named origin rather than a pattern.
 *
 * The session cookies are SameSite=Strict, so a browser will not attach
 * them to a cross-origin request at all — this list governs which origins
 * may *read* responses and which pass the Origin check, and it should not
 * be a pattern over attacker-controlled hostnames.
 */
const previewOrigins = (
  process.env.PREVIEW_ORIGINS ?? ""
)
  .split(",")
  .map((s) => originOf(s.trim()) ?? s.trim().replace(/\/+$/, ""))
  .filter((s) => s.length > 0);

const miniAppOrigin = originOf(process.env.TELEGRAM_MINIAPP_URL);

// Preview origins only ever apply outside production: in production the
// allowlist is the operator's ALLOWED_ORIGINS and nothing else.
const namedPreviewOrigins = new Set<string>(
  isProduction
    ? []
    : [...previewOrigins, ...(miniAppOrigin ? [miniAppOrigin] : [])]
);

let allowedOriginsString = process.env.ALLOWED_ORIGINS;
if (isProduction && !allowedOriginsString) {
  if (process.env.FRONTEND_URL) {
    allowedOriginsString = process.env.FRONTEND_URL;
  } else {
    allowedOriginsString = "https://www.asellaorganic.com,https://asellaorganic.com";
  }
}

export const allowedOrigins = (
  isProduction
    ? allowedOriginsString!
    : "http://localhost:5173,http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter((s) => s.length > 0)
  .filter((s) => !isProduction || !devOriginPattern.test(s));

export function isAllowedOrigin(origin: string): boolean {
  if (!isProduction && devOriginPattern.test(origin)) return true;
  if (namedPreviewOrigins.has(origin)) return true;
  return allowedOrigins.some((allowed) => origin === allowed);
}

if (!allowedOrigins.includes("https://web.telegram.org")) {
  allowedOrigins.push("https://web.telegram.org");
}

console.log("Allowed CORS origins:", allowedOrigins);
if (!isProduction && namedPreviewOrigins.size > 0) {
  console.log("Named preview origins:", [...namedPreviewOrigins].join(", "));
}
