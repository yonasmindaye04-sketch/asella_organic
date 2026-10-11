/**
 * src/routes/media.ts
 * Site Media — admin-overridable images for storefront "site chrome".
 *
 *   GET    /api/v1/media              — all active overrides (public, no auth)
 *   POST   /api/v1/media/:key/image   — upload a file, store override
 *   PUT    /api/v1/media/:key         — point a slot at a URL
 *   DELETE /api/v1/media/:key         — revert slot to its shipped default
 *
 * Why this table is usually empty
 * ------------------------------
 * A row exists ONLY when an admin has replaced the image that ships in the
 * bundle. No row means "render the frontend default", which is declared in
 * frontend/src/constants/siteAssets.ts. That keeps the public GET cheap and
 * makes reverting a single DELETE.
 *
 * Uploads go to Cloudinary (see routes/upload.ts for the equivalent product
 * image path), so swapping a hero image never requires a redeploy.
 */
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

import pool from "../config/db.js";
import cloudinary from "../lib/cloudinary.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createLogger } from "../lib/logger.js";
import { UpdateAssetSchema, assetKeyShape } from "../schemas/index.js";

const router = Router();

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Memory storage so the file is inspected (magic bytes) before it is ever
// handed to a third party.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/**
 * Wraps a multer middleware so its errors become a clean 400 instead of
 * falling through to Express's default handler as a 500. Without this an
 * oversized upload reports "Internal server error" and a client bug looks
 * like a server fault.
 */
function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `Image is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
          : "Invalid upload";
      res.status(400).json({ success: false, error: message });
      return;
    }
    next(err);
  });
}

/** Validates the :key path param once so every handler can assume it is safe. */
function parseAssetKey(req: Request, res: Response): string | null {
  const parsed = assetKeyShape.safeParse(req.params.key);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid asset key" });
    return null;
  }
  return parsed.data;
}

interface SiteAssetRow {
  asset_key: string;
  url: string;
  alt_text: string | null;
  updated_at: string;
}

/** GET /media — public. Returns only the slots that have been overridden. */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    // Deliberately not wrapped in apiCache: that cache has a 60s TTL with no
    // invalidation hook, so an admin who swaps an image would stare at the
    // old preview for a minute. The query is a scan of a table that is empty
    // in the common case, and admins fetch this on every media page load.
    res.setHeader("Cache-Control", "no-store");

    const [rows] = await pool.query(
      "SELECT asset_key, url, alt_text, updated_at FROM site_assets ORDER BY asset_key"
    ) as [SiteAssetRow[], any];

    res.json({ success: true, data: rows });
  } catch (err: any) {
    // Migration may not have run yet on a fresh deploy — the storefront must
    // still render its defaults rather than 500 on every page load.
    if (err?.code === "ER_NO_SUCH_TABLE") {
      res.json({ success: true, data: [] });
      return;
    }
    log.error("Failed to list site assets", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/** POST /media/:key/image — upload a file and point the slot at it. */
router.post(
  "/:key/image",
  authenticate,
  authorise("admin", "manager"),
  uploadSingleImage,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const key = parseAssetKey(req, res);
    if (!key) return;

    if (!req.file) {
      res.status(400).json({ success: false, error: "No image file uploaded" });
      return;
    }

    try {
      // Magic bytes, not the client-supplied MIME type or extension.
      const fileType = await fileTypeFromBuffer(req.file.buffer);
      if (!fileType || !fileType.mime.startsWith("image/")) {
        res.status(400).json({ success: false, error: "Invalid or corrupt image file" });
        return;
      }

      if (!cloudinary.config().cloud_name) {
        res.status(500).json({ success: false, error: "Cloudinary is not configured. Add API keys to .env" });
        return;
      }

      const secureUrl = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "asella-organic/site", resource_type: "image" },
          (error, result) => (result ? resolve(result.secure_url) : reject(error))
        );
        stream.end(req.file!.buffer);
      });

      const altText = typeof req.body?.alt_text === "string" ? req.body.alt_text.trim().slice(0, 255) : null;

      // ON DUPLICATE KEY UPDATE keeps this an upsert so the admin UI does not
      // need to know whether a slot has been touched before.
      await pool.query(
        `INSERT INTO site_assets (asset_key, url, alt_text, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE url = VALUES(url),
                                 alt_text = VALUES(alt_text),
                                 updated_by = VALUES(updated_by)`,
        [key, secureUrl, altText || null, req.user!.id]
      );

      await pool.query(
        `INSERT INTO audit_log (table_name, actor, action, old_values, new_values)
         VALUES ('site_assets', ?, 'UPDATE', NULL, ?)`,
        [req.user!.id, JSON.stringify({ asset_key: key, url: secureUrl })]
      ).catch(() => {});

      log.info("Site asset replaced", { assetKey: key });
      res.status(200).json({ success: true, data: { asset_key: key, url: secureUrl, alt_text: altText } });
    } catch (err) {
      log.error("Failed to upload site asset", err);
      res.status(500).json({ success: false, error: "Failed to upload image" });
    }
  }
);

/** PUT /media/:key — point a slot at a URL the admin pasted. */
router.put(
  "/:key",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateAssetSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const key = parseAssetKey(req, res);
    if (!key) return;

    try {
      const { url, alt_text } = req.body as { url: string; alt_text?: string | null };

      const [existing] = await pool.query(
        "SELECT url FROM site_assets WHERE asset_key = ?",
        [key]
      ) as [any[], any];

      await pool.query(
        `INSERT INTO site_assets (asset_key, url, alt_text, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE url = VALUES(url),
                                 alt_text = VALUES(alt_text),
                                 updated_by = VALUES(updated_by)`,
        [key, url, alt_text || null, req.user!.id]
      );

      await pool.query(
        `INSERT INTO audit_log (table_name, actor, action, old_values, new_values)
         VALUES ('site_assets', ?, 'UPDATE', ?, ?)`,
        [
          req.user!.id,
          JSON.stringify({ asset_key: key, url: existing[0]?.url ?? null }),
          JSON.stringify({ asset_key: key, url }),
        ]
      ).catch(() => {});

      log.info("Site asset URL changed", { assetKey: key });
      res.json({ success: true, data: { asset_key: key, url, alt_text: alt_text || null } });
    } catch (err) {
      log.error("Failed to update site asset", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/**
 * DELETE /media/:key — revert to the shipped default.
 *
 * No 2FA: this destroys an override, not business data, and the bundled
 * default is always still on disk. Same reasoning as product image changes.
 */
router.delete(
  "/:key",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const key = parseAssetKey(req, res);
    if (!key) return;

    try {
      const [result] = await pool.query(
        "DELETE FROM site_assets WHERE asset_key = ?",
        [key]
      ) as [any, any];

      await pool.query(
        `INSERT INTO audit_log (table_name, actor, action, old_values, new_values)
         VALUES ('site_assets', ?, 'DELETE', ?, NULL)`,
        [req.user!.id, JSON.stringify({ asset_key: key })]
      ).catch(() => {});

      log.info("Site asset reverted to default", { assetKey: key });
      res.json({ success: true, data: { asset_key: key, reverted: true, wasOverridden: result.affectedRows > 0 } });
    } catch (err) {
      log.error("Failed to revert site asset", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;