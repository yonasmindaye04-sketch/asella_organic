/**
 * csp-config.js
 * Single source of truth for Asella Organic Content-Security-Policy.
 * Shared between Express (Helmet) and the frontend Vite build (for .htaccess).
 *
 * This is the ONLY place a CSP directive may be declared. A hand-written
 * `Header always set Content-Security-Policy` in frontend/public/.htaccess used
 * to coexist with the header postbuild.js appends from this file. Apache emits
 * both, browsers enforce the intersection of multiple policies, and the stricter
 * one silently won — so YouTube embeds and Cloudflare Insights broke in
 * production while `npm run check-csp` still reported success.
 *
 * See DEPLOYMENT_GOTCHAS.md and MINIAPP_CLOUDFLARE_RUNBOOK.md §11.2.
 */
module.exports = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  // No 'unsafe-inline': postbuild.js fails the build if an inline <script>
  // appears in index.html or tma.html. Put new scripts in frontend/public/.
  scriptSrc: ["'self'", "https://telegram.org", "https://static.cloudflareinsights.com"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: [
    "'self'",
    "https://api.asellaorganic.com",
    "https://i.ytimg.com",
    "https://lh3.googleusercontent.com",
  ],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
  // YouTube product videos are embedded in the storefront and dashboard.
  frameSrc: ["https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
  upgradeInsecureRequests: [],
};
