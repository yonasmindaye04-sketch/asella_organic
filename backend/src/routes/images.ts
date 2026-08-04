/**
 * src/routes/images.ts
 * Asella Organic — On-the-fly Image Optimization
 *
 * Intercepts GET /image/* requests, compresses them with Sharp,
 * and serves WebP with long-lived cache headers.
 *
 * Params (query string):
 *   w   — max width in px  (default: 800)
 *   q   — quality 1-100    (default: 78)
 *
 * Cache strategy:
 *   - Processed images are cached to disk in public/cache/img/
 *   - Cache-Control: public, max-age=31536000, immutable
 *   - ETag based on source file mtime + params
 */

import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import sharp from "sharp";
import crypto from "crypto";
import { createLogger } from "../lib/logger.js";

const router = Router();

const PUBLIC_DIR   = path.join(process.cwd(), "public");
const CACHE_DIR    = path.join(PUBLIC_DIR, "cache", "img");

// Ensure the cache directory exists at startup
fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});

// Allowed extensions for image optimization
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".avif"]);

router.get(/.*/, async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);

  // Extract sub-path after /image/
  let subPath = decodeURI(req.path);
  if (subPath.startsWith("/")) {
    subPath = subPath.substring(1);
  }
  
  if (!subPath) {
    res.status(400).json({ error: "No image path provided" });
    return;
  }

  const ext = path.extname(subPath).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    res.status(400).json({ error: "Unsupported file type" });
    return;
  }

  // Resolve source file — sanitise to prevent path traversal
  const sourcePath = path.resolve(PUBLIC_DIR, "image", subPath);
  if (!sourcePath.startsWith(PUBLIC_DIR)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!existsSync(sourcePath)) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  // Parse params
  const w = Math.min(2000, Math.max(32, parseInt((req.query.w as string) ?? "800", 10) || 800));
  const q = Math.min(100, Math.max(10, parseInt((req.query.q as string) ?? "78",  10) || 78));

  try {
    // Build cache key from path + params + file mtime
    const stat = await fs.stat(sourcePath);
    const cacheKey = crypto
      .createHash("md5")
      .update(`${subPath}:w${w}:q${q}:${stat.mtimeMs}`)
      .digest("hex");
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.webp`);

    // Serve from disk cache if it exists
    if (existsSync(cachePath)) {
      res.set({
        "Content-Type":  "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag":          `"${cacheKey}"`,
        "Vary":          "Accept-Encoding",
      });

      // Handle conditional GET
      if (req.headers["if-none-match"] === `"${cacheKey}"`) {
        res.status(304).end();
        return;
      }

      const buf = await fs.readFile(cachePath);
      res.end(buf);
      return;
    }

    // Process with Sharp
    const buf = await sharp(sourcePath)
      .rotate()                        // auto-rotate based on EXIF
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: q, effort: 4 })
      .toBuffer();

    // Write to cache (non-blocking)
    fs.writeFile(cachePath, buf).catch(err =>
      log.warn("Failed to write image cache", { path: cachePath, err: String(err) })
    );

    res.set({
      "Content-Type":  "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag":          `"${cacheKey}"`,
      "Vary":          "Accept-Encoding",
    });
    res.end(buf);
  } catch (err) {
    log.warn("Image optimization failed, serving original", { subPath, err: String(err) });
    // Fallback: stream the original file unmodified
    try {
      const raw = await fs.readFile(sourcePath);
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png",  ".gif": "image/gif",
        ".webp": "image/webp",".bmp": "image/bmp",
      };
      res.set("Content-Type", mimeMap[ext] ?? "application/octet-stream");
      res.set("Cache-Control", "public, max-age=86400");
      res.end(raw);
    } catch {
      res.status(500).json({ error: "Failed to serve image" });
    }
  }
});

export default router;
