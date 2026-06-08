/**
 * src/routes/admin.ts
 * Asella Organic — Admin & Operations Endpoints
 *
 * Routes:
 *   GET /api/v1/admin/pool-stats  — MySQL connection pool internals
 *   GET /api/v1/admin/audit-log   — soft-delete audit trail (TODO)
 *
 * Mounted at both /api/v1/admin and /api/admin for backward compat.
 */
import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";

const router = Router();

/**
 * Returns the MySQL connection pool's current state. Useful for
 * monitoring (Prometheus / Datadog / etc.) and for on-call debugging
 * "why is the app slow" tickets.
 *
 * mysql2's pool exposes:
 *   - pool.pool._allConnections.length  — total connections ever created
 *   - pool.pool._freeConnections.length — idle connections in the pool
 *   - pool.pool._connectionQueue.length  — requests waiting for a connection
 *
 * These are private APIs (underscore prefix) but stable enough across
 * the mysql2 major versions we use. If a future mysql2 release breaks
 * this, we wrap with a try/catch and return a "metrics unavailable"
 * payload rather than crashing the metrics endpoint.
 */
router.get(
  "/pool-stats",
  authenticate,
  authorise("admin", "manager"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // mysql2's pool internals — typed as any to avoid a hard dep
      // on a private API surface.
      const internals = (pool as any).pool ?? {};
      const total      = (internals._allConnections  ?? []).length;
      const free       = (internals._freeConnections ?? []).length;
      const queued     = (internals._connectionQueue  ?? []).length;
      const inUse      = total - free;
      const utilization = total > 0 ? inUse / total : 0;

      // Configured limits from the pool config (db.ts)
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
            utilization:        Math.round(utilization * 1000) / 1000, // 3 decimals
            connectionLimit,
            database:           config.database ?? null,
            host:               config.host     ?? null,
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error:   "Failed to read pool stats",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

export default router;