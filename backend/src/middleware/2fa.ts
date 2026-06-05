/**
 * src/middleware/2fa.ts
 * Asella Organic — Two-Factor Authentication Middleware (MySQL)
 *
 * Verifies a TOTP code from the `x-2fa-token` header.
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
  const token = req.headers["x-2fa-token"] as string | undefined;

  if (!token) {
    res.status(401).json({ success: false, error: "2FA token required for this action." });
    return;
  }

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

    if (!staff.two_factor_enabled || !staff.two_factor_secret) {
      res.status(403).json({
        success: false,
        error: "2FA is not enabled on your account. Set it up first via POST /api/staff/2fa/setup.",
      });
      return;
    }

    const result = verifySync({ token, secret: staff.two_factor_secret });
    const isValid = result.valid;

    if (!isValid) {
      res.status(401).json({ success: false, error: "Invalid or expired 2FA token." });
      return;
    }

    next();
  } catch (err) {
    console.error("[require2FA]", err);
    res.status(500).json({ success: false, error: "Internal server error during 2FA verification." });
  }
};