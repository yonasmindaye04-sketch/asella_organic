/**
 * backend/src/lib/logger.ts
 * Asella Organic — Structured Request-Correlated Logger
 *
 * Creates a scoped logger bound to a single request's ID.
 * Every line it emits includes the request ID so log aggregators
 * (Papertrail, Datadog, CloudWatch) can filter a full request trace
 * from a single query.
 *
 * Usage in a route handler:
 *   import { createLogger } from "../lib/logger.js";
 *
 *   router.get("/orders", authenticate, async (req, res) => {
 *     const log = createLogger(req);
 *     log.info("Fetching orders", { page: req.query.page });
 *     // ...
 *     log.error("DB query failed", err);
 *   });
 *
 * Output format (JSON, one line per log):
 *   {"ts":"2026-05-24T10:00:00.000Z","level":"INFO","requestId":"a1b2-...","msg":"Fetching orders","page":1}
 */

import { Request } from "express";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  ts: string;
  level: LogLevel;
  requestId: string;
  msg: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, requestId: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    requestId,
    msg,
    ...meta,
  };

  const line = JSON.stringify(entry);

  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, errOrMeta?: unknown): void;
}

/**
 * Create a logger scoped to a single Express request.
 * Pass `req` and every log line will carry its `x-request-id`.
 */
export function createLogger(req: Request): Logger {
  const id = req.requestId ?? "no-request-id";

  return {
    debug: (msg, meta) => emit("DEBUG", id, msg, meta),
    info:  (msg, meta) => emit("INFO",  id, msg, meta),
    warn:  (msg, meta) => emit("WARN",  id, msg, meta),
    error: (msg, errOrMeta) => {
      if (errOrMeta instanceof Error) {
        emit("ERROR", id, msg, { error: errOrMeta.message, stack: errOrMeta.stack });
      } else if (typeof errOrMeta === "object" && errOrMeta !== null) {
        emit("ERROR", id, msg, errOrMeta as Record<string, unknown>);
      } else {
        emit("ERROR", id, msg);
      }
    },
  };
}

/**
 * A standalone logger for use outside of request context
 * (e.g. startup, workers, migration scripts).
 */
export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("DEBUG", "system", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => emit("INFO",  "system", msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit("WARN",  "system", msg, meta),
  error: (msg: string, errOrMeta?: unknown) => {
    if (errOrMeta instanceof Error) {
      emit("ERROR", "system", msg, { error: errOrMeta.message, stack: errOrMeta.stack });
    } else {
      emit("ERROR", "system", msg);
    }
  },
};