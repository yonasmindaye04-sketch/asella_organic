/**
 * csp-config.js
 * Single source of truth for Asella Organic Content-Security-Policy.
 * Shared between Express (Helmet) and the frontend Vite build (for .htaccess).
 */
module.exports = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'", "https://telegram.org"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'", "https://api.asellaorganic.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
  upgradeInsecureRequests: [],
};
