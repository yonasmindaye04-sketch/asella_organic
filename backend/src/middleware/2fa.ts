/**
 * src/middleware/2fa.ts
 * Asella Organic — Two-Factor Authentication Middleware (MySQL)
 *
 * Verifies a TOTP code from the `x-2fa-token` header when 2FA is active.
 * Must be placed AFTER `authenticate` so req.user is populated.
 *
 * Usage:
 *   router.delete("/:id", authenticate, authorise("admin"), require2FA, handler)
 */

import { Request, Response, NextFunction } from "express";
import { verifySync } from "otplib";
import pool from "../config/db.js";

export const require2FA = async (
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> => {
  const token = (req.headers["x-2fa-token"] as string | undefined)?.trim();

  try {
    const [rows] = await pool.query(
      `SELECT two_factor_secret, two_factor_enabled
       FROM staff_users
       WHERE id = ? AND active = true AND deleted_at IS NULL`,
      [req.user!.id]
    ) as [any[], any];

    const staff = rows[0];

    if (!staff) {
      res.status(401).json({ success: false, error: "Staff user not found." });
      return;
    }

    // The account must HAVE 2FA enabled for this route to be usable.
    //
    // This used to challenge only accounts that already had 2FA switched
    // on, so an account with 2FA off produced no challenge at all and
    // simply passed. On a route guarded by require2FA that is not a
    // control, it is a no-op — and on the routes that can mint or
    // promote an administrator it is the whole ballgame.
    //
    // POST /api/staff accepts any role including admin, and
    // PATCH /api/staff/:id can change one, so behind the old behaviour a
    // single request from an account with 2FA off could create a brand
    // new administrator.
    //
    // A caller without 2FA is told where to set it up rather than being
    // waved through. The setup route only needs authentication:
    // POST /api/staff/2fa/setup.
    if (!staff.two_factor_enabled || !staff.two_factor_secret) {
      res.status(403).json({
        success: false,
        error: "2FA is not enabled on your account. Set it up at POST /api/staff/2fa/setup to perform this action.",
      });
      return;
    }

    if (!token) {
      res.status(401).json({ success: false, error: "2FA token required for this action." });
      return;
    }

    const result = verifySync({ token, secret: staff.two_factor_secret });
    if (!result.valid) {
      res.status(401).json({ success: false, error: "Invalid or expired 2FA token." });
      return;
    }

    next();
  } catch (err) {
    console.error("[require2FA]", err);
    res.status(500).json({ success: false, error: "Internal server error during 2FA verification." });
  }
};
