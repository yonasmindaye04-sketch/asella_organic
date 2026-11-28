/**
 * src/middleware/idempotency.ts
 * Asella Organic — Idempotency-Key Middleware
 *
 * Accepts a client-supplied `Idempotency-Key: <uuid>` header on
 * POST endpoints. The first request with a given key runs the
 * handler and caches the result. Subsequent requests with the
 * SAME key + SAME caller + SAME payload return the cached response
 * without re-running the handler.
 *
 * If the same key is replayed with a DIFFERENT payload, the
 * middleware returns 409 Conflict (caller is misusing the key).
 *
 * Keys expire after 24 hours.
 *
 * ── ASE-2026-006 ────────────────────────────────────────────────────────
 *
 * This middleware used to be mounted app-wide, ahead of the routers, and
 * it stored every key with `user_id = NULL` because req.user is not
 * populated until a route runs its own `authenticate`. Two things followed
 * from that:
 *
 *   1. The key namespace was GLOBAL. `WHERE user_id IS NULL AND idem_key = ?`
 *      matched any client's key, so one caller could be served another
 *      caller's cached response. Worse, `user_id` is nullable inside the
 *      (user_id, idem_key) unique key, and in MySQL NULLs never collide —
 *      so every anonymous request with the same key inserted ANOTHER row
 *      and the lookup returned an arbitrary one of them.
 *
 *   2. Authentication responses were cached like any other. `POST
 *      /api/auth/login` returns an access token and a refresh token, and
 *      that body was written to the idempotency_keys table. Replaying a
 *      login key returned a previously issued token — a working session
 *      for whoever logged in first.
 *
 * The fixes, in order of importance:
 *
 *   • Authentication routes are never cached and never replayed. A token
 *     must only ever come from a live credential check.
 *   • Every key is scoped to a CALLER, so one caller can never be served
 *     another caller's response:
 *       - an authenticated caller is scoped to their staff id;
 *       - an anonymous caller (the public checkout) is scoped to a salted
 *         hash of an identifier they supply — their phone number, which the
 *         order schema already requires.
 *     A caller who guesses somebody else's key simply lands in their own
 *     scope and gets their own response.
 */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { extractAccessToken } from "./auth.js";
import { verifyJwt } from "../config/jwtSecret.js";

const TTL_HOURS = 24;

const IDEMPOTENT_METHODS = new Set(["POST"]);

/**
 * Routes whose responses must never be cached or replayed.
 *
 * These are the credential endpoints: they mint sessions. Caching one
 * turns an idempotency key into a session-replay token, which is the
 * whole of ASE-SESS-04.
 */
const NEVER_CACHED_PATH = /^\/auth\//;

function hashRequest(method: string, path: string, body: unknown): string {
  const h = crypto.createHash("sha256");
  h.update(method);
  h.update("\n");
  h.update(path);
  h.update("\n");
  h.update(JSON.stringify(body ?? null));
  return h.digest("hex");
}

/**
 * Salt for the anonymous scope hash.
 *
 * This is not a secret — it only exists so that the same phone number
 * cannot be turned back into a scope key by brute force over the small
 * space of plausible phone numbers. A stable per-deployment salt is
 * enough: it is only ever compared against other values hashed with the
 * same salt.
 */
const SCOPE_SALT = process.env.IDEMPOTENCY_SCOPE_SALT ?? "asella-idempotency-scope-v1";

function hashScope(prefix: string, value: string): string {
  return prefix + crypto.createHash("sha256").update(SCOPE_SALT).update(value).digest("hex");
}

interface CallerScope {
  /** Value stored in idempotency_keys.scope_key. */
  scopeKey: string;
  /** The authenticated staff id, or null for an anonymous caller. */
  userId: string | null;
}

/**
 * Works out which caller a request belongs to.
 *
 * Authenticated callers are scoped to their staff id, which the server
 * derives from a verified token and the client cannot influence.
 *
 * Anonymous callers are scoped to a salted hash of the phone number they
 * supplied (the order schema requires one). That is not a secret either,
 * but it is enough to keep two different customers out of each other's
 * idempotency namespace: a customer who reuses another customer's key
 * lands in their own scope and gets their own order, instead of the other
 * customer's cached response or a 409 that blocks their checkout.
 *
 * When there is no phone number either, the request body itself is the
 * scope. The practical effect is the same — two different payloads can
 * never share a cached response — and the request-hash check below still
 * applies within that scope.
 */
function resolveCallerScope(req: Request): CallerScope {
  const token = extractAccessToken(req);
  if (token) {
    try {
      const payload = verifyJwt<{ id?: string }>(token);
      if (payload?.id) {
        return { scopeKey: `u:${payload.id}`, userId: payload.id };
      }
    } catch {
      // An invalid or expired token falls through to the anonymous scope.
      // The route's own authenticate() will reject it if it needs a session.
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (phone) {
    return { scopeKey: hashScope("a:", phone), userId: null };
  }

  return { scopeKey: hashScope("a:", JSON.stringify(body)), userId: null };
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

  // Authentication responses are never cached and never replayed. A token
  // must come from a live credential check and nowhere else.
  if (NEVER_CACHED_PATH.test(req.path)) {
    res.setHeader("Idempotency-Not-Cached", "auth-route");
    next();
    return;
  }

  const { scopeKey, userId } = resolveCallerScope(req);
  const method  = req.method;
  const path    = req.path;
  const reqHash = hashRequest(method, path, req.body);

  // 1. Look up an existing key for this (scope, idem_key)
  const [rows] = await pool.query(
    `SELECT request_hash, status, response_body
     FROM idempotency_keys
     WHERE scope_key = ?
       AND idem_key = ?
     LIMIT 1`,
    [scopeKey, idemKey]
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
  let captureSkipped  = false;

  res.json = ((body: unknown) => {
    capturedStatus = res.statusCode;
    capturedBody   = body;
    return originalJson(body);
  }) as typeof res.json;

  res.send = ((body: unknown) => {
    capturedStatus = res.statusCode;
    // Express implements res.json() ON TOP OF res.send(), so this wrapper
    // also sees the serialised text of a body the json wrapper above has
    // already captured. Overwriting capturedBody with that text stores a
    // DOUBLE-ENCODED payload: the replay then JSON.parses it once and hands
    // back a JSON string instead of the original object.
    //
    // So only capture here when the json wrapper did not, and never capture
    // a Buffer — a binary body cannot be replayed faithfully from JSON.
    if (capturedBody === null) {
      if (Buffer.isBuffer(body)) {
        captureSkipped = true;
      } else {
        capturedBody = body;
      }
    }
    return originalSend(body);
  }) as typeof res.send;

  res.on("finish", () => {
    capturedStatus = res.statusCode;
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
    if (captureSkipped) return;
    try {
      // Use a fresh connection from the pool so the write is independent
      // of the request's connection lifecycle.
      const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO idempotency_keys
           (idem_key, user_id, scope_key, method, path, request_hash,
            status, response_body, response_headers, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status          = VALUES(status),
           response_body   = VALUES(response_body),
           response_headers = VALUES(response_headers),
           expires_at      = VALUES(expires_at)`,
        [
          idemKey, userId, scopeKey, method, path, reqHash,
          capturedStatus,
          JSON.stringify(capturedBody),
          JSON.stringify({}),
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
