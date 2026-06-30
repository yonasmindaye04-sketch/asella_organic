/**
 * src/routes/videos.ts
 * Community Videos — admin can add/delete, public can list
 *
 *   GET  /api/v1/videos          — list all videos (public, no auth)
 *   POST /api/v1/videos          — add a video (admin/manager only)
 *   DELETE /api/v1/videos/:id    — delete a video (admin/manager only)
 */
import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

/** GET /videos — public */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  try {
    const [rows] = await pool.query(
      "SELECT id, url, title, created_at FROM community_videos ORDER BY created_at DESC"
    ) as [any[], any];
    res.json({ success: true, data: rows });
  } catch (err: any) {
    // Table may not exist yet if migration hasn't been run
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      res.json({ success: true, data: [] });
      return;
    }
    log.error("Failed to list videos", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/** POST /videos — admin / manager */
router.post(
  "/",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { url, title } = req.body as { url?: string; title?: string };
      if (!url || typeof url !== "string") {
        res.status(400).json({ success: false, error: "url is required" });
        return;
      }
      const safeTitle = (title ?? "Community Testimonial").trim().slice(0, 200);
      const [result] = await pool.query(
        "INSERT INTO community_videos (url, title) VALUES (?, ?)",
        [url.trim(), safeTitle]
      ) as [any, any];
      res.status(201).json({ success: true, data: { id: result.insertId, url, title: safeTitle } });
    } catch (err) {
      log.error("Failed to add video", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/** DELETE /videos/:id — admin / manager */
router.delete(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { id } = req.params;
      const [result] = await pool.query(
        "DELETE FROM community_videos WHERE id = ?",
        [id]
      ) as [any, any];
      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Video not found" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      log.error("Failed to delete video", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
