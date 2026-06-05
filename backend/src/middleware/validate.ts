/**
 * src/middleware/validate.ts
 * Asella Organic — Zod Validation + XSS Sanitization Middleware
 *
 * Usage:
 * import { validate } from "../middleware/validate";
 * import { CreateOrderSchema } from "../schemas";
 *
 * router.post("/orders", authenticate, validate(CreateOrderSchema), handler);
 *
 * What it does:
 * 1. Runs sanitizeObject() on req.body to strip XSS before validation
 * 2. Parses against the Zod schema
 * 3. Replaces req.body with the typed, validated result
 * 4. Returns 422 with field-level errors on failure
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { sanitizeObject } from "../lib/security.js";

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 1. Sanitize all string fields (XSS guard)
    const sanitized =
      typeof req.body === "object" && req.body !== null
        ? sanitizeObject(req.body as Record<string, unknown>)
        : req.body;

    // 2. Parse with Zod
    const result = schema.safeParse(sanitized);

    if (!result.success) {
      res.status(422).json({
        success: false,
        error: "Validation failed",
        details: (result.error as ZodError).flatten().fieldErrors,
      });
      return;
    }

    // 3. Replace body with validated + typed data
    req.body = result.data;
    next();
  };
}