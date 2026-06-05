/**
 * backend/src/middleware/requestId.ts
 * Asella Organic — Request ID Correlation Middleware
 *
 * Attaches a unique UUID to every incoming request as `x-request-id`.
 * - If the caller already sends an `x-request-id` header (e.g. a frontend
 *   or upstream proxy), that value is reused so the ID is consistent
 *   end-to-end across services.
 * - The ID is stored on `req.requestId` for use in route handlers and
 *   propagated back in the response header so clients can correlate logs.
 *
 * Usage in app.ts:
 *   import { requestId } from "./middleware/requestId.js";
 *   app.use(requestId);
 *
 * Usage in a route:
 *   console.log(`[${req.requestId}] Processing order ${orderId}`);
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// Extend the Express Request type so TypeScript knows about req.requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  // Accept the caller's ID only if it looks like a valid UUID or short token
  const id =
    typeof incoming === "string" && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : crypto.randomUUID();

  req.requestId = id;

  // Echo it back so clients can match their request to server logs
  res.setHeader("x-request-id", id);

  next();
}