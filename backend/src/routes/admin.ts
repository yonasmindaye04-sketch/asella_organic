/**
 * src/routes/admin.ts
 * Asella Organic — Admin & Operations Endpoints
 *
 * Routes:
 *   GET /api/v1/admin/pool-stats  — MySQL connection pool internals
 *   GET /api/v1/admin/audit-log   — paginated audit trail
 *
 * Mounted at both /api/v1/admin and /api/admin for backward compat.
 */
import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

router.get(
  "/pool-stats",
  authenticate,
  authorise("admin", "manager"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const internals = (pool as any).pool ?? {};
      const total      = (internals._allConnections  ?? []).length;
      const free       = (internals._freeConnections ?? []).length;
      const queued     = (internals._connectionQueue  ?? []).length;
      const inUse      = total - free;
      const utilization = total > 0 ? inUse / total : 0;

      const config = pool.config ?? {};
      const connectionLimit = config.connectionLimit ?? null;

      res.json({
        success: true,
        data: {
          pool: {
            total,
            free,
            inUse,
            queued,
            utilization:        Math.round(utilization * 1000) / 1000,
            connectionLimit,
            database:           config.database ?? null,
            host:               config.host     ?? null,
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      const log = createLogger(_req);
      log.error("Failed to read pool stats", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/**
 * GET /admin/audit-log
 * Paginated audit trail, filterable by table, action, actor, date range.
 */
router.get(
  "/audit-log",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { table_name, action, actor, from, to, page = "1", limit = "50" } = req.query as Record<string, string>;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (table_name) {
        conditions.push("table_name = ?");
        params.push(table_name);
      }
      if (action) {
        conditions.push("action = ?");
        params.push(action);
      }
      if (actor) {
        conditions.push("actor LIKE ?");
        params.push(`%${actor}%`);
      }
      if (from) {
        conditions.push("created_at >= ?");
        params.push(from);
      }
      if (to) {
        conditions.push("created_at <= ?");
        params.push(to);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_log ${where}`,
        params
      ) as [any[], any];
      const total = parseInt(countRows[0]?.total ?? "0", 10);

      const [rows] = await pool.query(
        `SELECT id, table_name, record_id, order_id, actor, action,
                old_values, new_values, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      ) as [any[], any];

      log.info("Audit log listed", { page: pageNum, limit: limitNum, total });
      res.json({
        success: true,
        data:    rows,
        meta:    { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      log.error("Failed to list audit log", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;