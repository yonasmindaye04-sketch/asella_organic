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
 *   • The key is RESERVED before the handler runs, with an atomic INSERT
 *     against the unique index. The lookup and the insert used to be two
 *     separate statements, so parallel requests with the same key could all
 *     miss the cache and all run the handler — and all create an order.
 *     Two concurrent retries of one checkout produced two orders.
 */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { ResultSetHeader } from "mysql2";
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

/**
 * How long to wait for a request that already holds this key to finish,
 * so its response can be replayed instead of the caller being told to
 * come back later.
 */
const IN_FLIGHT_WAIT_MS = 5_000;
const IN_FLIGHT_POLL_MS = 100;

/**
 * A reservation older than this is presumed to belong to a request that
 * died. The key is taken over rather than being blocked for the full TTL.
 */
const STALE_RESERVATION_SECONDS = 60;

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

/**
 * True for MySQL/MariaDB's ER_DUP_ENTRY — the unique index refused a
 * second row for the same key.
 */
function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number } | null;
  if (!e) return false;
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}

type HolderOutcome =
  | { kind: "replay"; status: number | null; response_body: unknown }
  | { kind: "conflict" }
  | { kind: "taken-over" }
  | { kind: "in-flight" };

/**
 * Waits for the request that holds this key to finish, so its response can
 * be replayed.
 *
 * A retry that arrives while the original request is still running must
 * NOT run the handler again — that is the whole point of the key. So the
 * duplicate waits, and when the holder completes it gets that response.
 *
 * If the holder has not finished within the budget the caller is told the
 * request is still in progress, rather than being allowed to run the
 * handler a second time.
 */
async function waitForHolder(
  scopeKey: string,
  idemKey: string,
  reqHash: string
): Promise<HolderOutcome> {
  const deadline = Date.now() + IN_FLIGHT_WAIT_MS;

  for (;;) {
    const [rows] = await pool.query(
      `SELECT request_hash, status, response_body, created_at
       FROM idempotency_keys
       WHERE scope_key = ? AND idem_key = ?
       LIMIT 1`,
      [scopeKey, idemKey]
    ) as [any[], any];

    const holder = rows[0];

    if (!holder) {
      // The holder's row is gone (expired and purged). Treat the key as
      // free; the caller will retry and the reservation will succeed.
      return { kind: "in-flight" };
    }

    // A reservation with no response body is a request still in flight —
    // unless it is old enough that the request must have died.
    const hasResponse = holder.response_body !== null && holder.response_body !== undefined;
    if (!hasResponse) {
      const ageSeconds = holder.created_at
        ? Math.floor((Date.now() - new Date(holder.created_at).getTime()) / 1000)
        : 0;

      if (ageSeconds > STALE_RESERVATION_SECONDS) {
        // The holder is presumed dead. Take the reservation over: the
        // conditional UPDATE only succeeds if the row is still unclaimed.
        const [taken] = await pool.query(
          `UPDATE idempotency_keys
           SET request_hash = ?, created_at = NOW()
           WHERE scope_key = ? AND idem_key = ?
             AND response_body IS NULL
             AND created_at < (NOW() - INTERVAL ? SECOND)`,
          [reqHash, scopeKey, idemKey, STALE_RESERVATION_SECONDS]
        ) as [ResultSetHeader, unknown];

        if (taken.affectedRows === 1) {
          // We now own the reservation — run the handler.
          return { kind: "taken-over" };
        }
        // Somebody else got there first; loop and read the row again.
        continue;
      }

      if (Date.now() >= deadline) return { kind: "in-flight" };
      await new Promise(r => setTimeout(r, IN_FLIGHT_POLL_MS));
      continue;
    }

    // The holder finished.
    if (holder.request_hash !== reqHash) return { kind: "conflict" };
    return {
      kind: "replay",
      status: holder.status ?? null,
      response_body: holder.response_body,
    };
  }
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

  // 1. Reserve the key, atomically.
  //
  // ASE-2026-009: the lookup and the insert used to be two separate
  // statements, so N parallel requests with the same key could all miss
  // the cache and all run the handler — and all create an order. The
  // reservation is a single INSERT against the (scope_key, idem_key)
  // unique index, so exactly one request can win it.
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO idempotency_keys
         (idem_key, user_id, scope_key, method, path, request_hash,
          status, response_body, response_headers, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NOW(), ?)`,
      [idemKey, userId, scopeKey, method, path, reqHash, expiresAt]
    );
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      // A database problem is not the caller's fault, and it must not
      // silently disable the guarantee. Fail the request rather than run
      // the handler unprotected.
      console.error("[idempotency] failed to reserve key:", err);
      res.status(503).json({
        success: false,
        error:   "Could not reserve the Idempotency-Key. Please retry.",
      });
      return;
    }

    // 2. Someone else holds this key.
    const existing = await waitForHolder(scopeKey, idemKey, reqHash);

    if (existing.kind === "replay") {
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

    if (existing.kind === "conflict") {
      // 2a. Different payload with same key — caller error
      res.status(409).json({
        success: false,
        error:   "Idempotency-Key reused with a different payload",
      });
      return;
    }

    if (existing.kind === "in-flight") {
      // 2b. The holder has not finished yet and did not finish in time.
      res.setHeader("Retry-After", "1");
      res.status(409).json({
        success: false,
        error:   "A request with this Idempotency-Key is still in progress. Please retry shortly.",
      });
      return;
    }

    // 2c. "taken-over": the previous holder died and we hold its
    // reservation now. Fall through and run the handler ourselves.
  }

  // 3. We own the key — wrap res to capture the response
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
  // write the result onto the reservation we already hold.
  res.on("finish", async () => {
    if (captureSkipped) return;
    try {
      // Use a fresh connection from the pool so the write is independent
      // of the request's connection lifecycle.
      await pool.query(
        `UPDATE idempotency_keys
         SET status = ?, response_body = ?, response_headers = ?,
             request_hash = ?, expires_at = ?
         WHERE scope_key = ? AND idem_key = ?`,
        [
          capturedStatus,
          JSON.stringify(capturedBody),
          JSON.stringify({}),
          reqHash,
          expiresAt,
          scopeKey,
          idemKey,
        ]
      );
    } catch (err) {
      // Don't crash the response on idempotency write failure
      console.error("[idempotency] failed to save key:", err);
    }
  });

  void 0;
  next();
}
