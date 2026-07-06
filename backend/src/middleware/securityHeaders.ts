/**
 * src/middleware/securityHeaders.ts
 * Asella Organic — HTTP Security Headers Middleware
 *
 * Apply this ONCE globally in app.ts BEFORE all routes:
 * app.use(securityHeaders);
 *
 * Headers applied:
 * - Strict-Transport-Security (HSTS — 1 year)
 * - X-Content-Type-Options (no MIME sniffing)
 * - X-Frame-Options (clickjacking protection)
 * - Referrer-Policy
 * - Permissions-Policy
 * - Remove X-Powered-By (server fingerprint)
 */

import { Request, Response, NextFunction } from "express";

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Content-Security-Policy
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: https://*.googleusercontent.com https://drive.google.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ")
  );

  // HSTS — enforce HTTPS for 1 year (only meaningful in production)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // Remove server fingerprint
  res.removeHeader("X-Powered-By");

  next();
}