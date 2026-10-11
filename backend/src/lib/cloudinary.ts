import { v2 as cloudinary } from 'cloudinary';
import { logger as log } from './logger.js';

// ── Cloudinary configuration ─────────────────────────────────────────────
//
// Two supported shapes, checked independently:
//
//   1. The discrete triple — CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY +
//      CLOUDINARY_API_SECRET. All three, or nothing.
//   2. CLOUDINARY_URL — a single cloudinary://api_key:api_secret@cloud_name
//      string, which the SDK parses itself.
//
// Why the shape check has to happen before config() is called
// ------------------------------------------------------------
// cloudinary.config() merges via lodash `extend`, which copies keys whose
// value is `undefined`. The SDK only parses CLOUDINARY_URL when config() is
// invoked without an object. So passing an object built from a missing triple
// (cloud_name: undefined, ...) both skips URL parsing AND overwrites the
// parsed values with undefined. The result is a client that reports itself
// unconfigured and 500s on the first upload, with no warning — the exact
// failure mode the previous version of this file had.
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

/**
 * The discrete triple, or undefined when any part of it is missing.
 *
 * Built as one expression so the completeness test and the values handed to
 * config() can never disagree. exactOptionalPropertyTypes rejects
 * `string | undefined`, which is what makes this narrowing load-bearing
 * rather than cosmetic: passing the raw env vars is exactly the bug that
 * used to leave a CLOUDINARY_URL-only deployment with cloud_name undefined.
 */
const triple =
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
    ? {
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
      }
    : undefined;

if (triple) {
  // A complete, explicit triple wins over CLOUDINARY_URL when both are set.
  cloudinary.config(triple);
  log.info("Cloudinary configured from CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.");
} else if (CLOUDINARY_URL) {
  // No argument: `true` forces the SDK to re-read CLOUDINARY_URL even if some
  // other import already touched the config.
  cloudinary.config(true);
  log.info("Cloudinary configured from CLOUDINARY_URL.");
} else {
  log.warn("Cloudinary environment variables missing. Cloudinary uploads will fail.");
}

if (!triple && !CLOUDINARY_URL) {
  // A partially filled triple is far more likely to be a typo in cPanel than a
  // deliberate setup, and it fails later and less legibly than it fails here.
  const missing = [
    !CLOUDINARY_CLOUD_NAME && "CLOUDINARY_CLOUD_NAME",
    !CLOUDINARY_API_KEY && "CLOUDINARY_API_KEY",
    !CLOUDINARY_API_SECRET && "CLOUDINARY_API_SECRET",
  ].filter(Boolean);
  if (missing.length > 0) {
    log.warn(
      `Cloudinary configuration is incomplete — missing ${missing.join(", ")}. ` +
        "Uploads will fail until all three are set."
    );
  }
}

export default cloudinary;