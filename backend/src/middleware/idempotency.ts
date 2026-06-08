/**
 * src/middleware/idempotency.ts
 * Asella Organic — Idempotency-Key Middleware
 *
 * Accepts a client-supplied `Idempotency-Key: <uuid>` header on
 * POST endpoints. The first request with a given key runs the
 * handler and caches the result. Subsequent requests with the
 * SAME key + SAME user + SAME payload return the cached response
 * without re-running the handler.
 *
 * If the same key is replayed with a DIFFERENT payload, the
 * middleware returns 409 Conflict (caller is misusing the key).
 *
 * Keys expire after 24 hours.
 */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import pool from "../config/db.js";

const TTL_HOURS = 24;

const IDEMPOTENT_METHODS = new Set(["POST"]);

function hashRequest(method: string, path: string, body: unknown): string {
  const h = crypto.createHash("sha256");
  h.update(method);
  h.update("\n");
  h.update(path);
  h.update("\n");
  h.update(JSON.stringify(body ?? null));
  return h.digest("hex");
}

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!IDEMPOTENT_METHODS.has(req.method)) { next(); return; }

  const idemKey = req.header("Idempotency-Key");
  if (!idemKey || idemKey.length === 0 || idemKey.length > 128) {
    next();
    return;
  }

  const user = (req as any).user as { id?: string } | undefined;
  const userId  = user?.id ?? null;
  const method  = req.method;
  const path    = req.path;
  const reqHash = hashRequest(method, path, req.body);

  // 1. Look up an existing key for this (user, idem_key)
  const [rows] = await pool.query(
    `SELECT request_hash, status, response_body, response_headers
     FROM idempotency_keys
     WHERE user_id ${userId ? "= ?" : "IS NULL"}
       AND idem_key = ?
     LIMIT 1`,
    userId ? [userId, idemKey] : [idemKey]
  ) as [any[], any];

  if (rows[0]) {
    const existing = rows[0];

    // 2a. Same payload — return the cached response
    if (existing.request_hash === reqHash) {
      let body: unknown;
      try {
        body = typeof existing.response_body === "string"
          ? JSON.parse(existing.response_body)
          : existing.response_body;
      } catch (parseErr) {
        // If the cached body is corrupt for any reason, fall through
        // and re-execute the handler.
        console.error("[idempotency] failed to parse cached body:", parseErr);
        next();
        return;
      }
      res.status(existing.status ?? 200);
      res.setHeader("Idempotency-Replay", "true");
      // Use res.json which sets Content-Type and lets supertest
      // parse the body. Pass an object, not a string.
      res.json(body);
      return;
    }

    // 2b. Different payload with same key — caller error
    res.status(409).json({
      success: false,
      error:   "Idempotency-Key reused with a different payload",
    });
    return;
  }

  // 3. New key — wrap res to capture the response
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let capturedStatus  = 200;
  let capturedBody:   unknown = null;
  const capturedHeaders: Record<string, string> = {};

  res.json = ((body: unknown) => {
    capturedStatus = res.statusCode;
    capturedBody   = body;
    return originalJson(body);
  }) as typeof res.json;

  res.send = ((body: unknown) => {
    capturedStatus = res.statusCode;
    capturedBody   = body;
    return originalSend(body);
  }) as typeof res.send;

  res.on("finish", () => {
    capturedStatus = res.statusCode;
    // Capture set-cookie headers
    const setCookies = res.getHeaders()["set-cookie"];
    if (Array.isArray(setCookies)) {
      capturedHeaders["set-cookie"] = setCookies.join("\n");
    }
  });

  // Hook into res.status to capture the status
  const originalStatus = res.status.bind(res);
  res.status = ((code: number) => {
    capturedStatus = code;
    return originalStatus(code);
  }) as typeof res.status;

  // Continue the middleware chain. After the route handler finishes,
  // save the result to the idempotency_keys table.
  res.on("finish", async () => {
    try {
      // Use a fresh connection from the pool so the write is independent
      // of the request's connection lifecycle.
      const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO idempotency_keys
           (idem_key, user_id, method, path, request_hash,
            status, response_body, response_headers, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status          = VALUES(status),
           response_body   = VALUES(response_body),
           response_headers = VALUES(response_headers),
           expires_at      = VALUES(expires_at)`,
        [
          idemKey, userId, method, path, reqHash,
          capturedStatus,
          JSON.stringify(capturedBody),
          JSON.stringify(capturedHeaders),
          expiresAt,
        ]
      );
    } catch (err) {
      // Don't crash the response on idempotency write failure
      console.error("[idempotency] failed to save key:", err);
    }
  });

  next();
}