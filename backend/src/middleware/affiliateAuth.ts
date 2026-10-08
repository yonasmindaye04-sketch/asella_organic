/**
 * src/middleware/affiliateAuth.ts
 * Asella Organic — Affiliate Portal Authentication (MySQL)
 *
 * Security model for the affiliate-facing API:
 *
 *   1. The caller must hold a valid staff_users session (reuse `authenticate`).
 *   2. The account must have role 'affiliate'. Admin/manager/etc. get 403 —
 *      the portal is a separate product surface, not a staff superview.
 *   3. The account must be linked to an active, non-deleted affiliate profile.
 *   4. The resolved profile is attached to `req.affiliate` and that is the ONLY
 *      permitted source of scope.
 *
 * The portal routes deliberately expose no `/:id` parameter anywhere. An
 * affiliate cannot request another affiliate's data because there is no code
 * path that accepts an affiliate identifier from the client — `affiliateId` is
 * always taken from `req.affiliate.id`, resolved server-side from the JWT
 * subject. This removes the IDOR class structurally rather than by validating
 * a parameter after the fact.
 */

import { Request, Response, NextFunction } from "express";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../config/db.js";
import { authenticate } from "./auth.js";

export interface AffiliateContext {
  /** affiliate_profiles.id — the authoritative scope for every portal query. */
  id: string;
  /** staff_users.id — who is logged in. */
  userId: string;
  referralCode: string;
  displayName: string;
  email: string | null;
}

declare global {
  namespace Express {
    interface Request {
      affiliate?: AffiliateContext;
    }
  }
}

interface ProfileRow extends RowDataPacket {
  id: string;
  user_id: string | null;
  referral_code: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Requires: valid staff session + role 'affiliate' + linked active profile.
 * Usage: router.use(authenticate, affiliateOnly)
 */
export const affiliateOnly = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  if (req.user.role !== "affiliate") {
    res.status(403).json({
      success: false,
      error: "This area is restricted to affiliate accounts.",
    });
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT ap.id, ap.user_id, ap.referral_code, ap.full_name, ap.email
       FROM   affiliate_profiles ap
       WHERE  ap.user_id = ?
         AND  ap.is_active = TRUE
         AND  ap.deleted_at IS NULL
       LIMIT  1`,
      [req.user.id],
    ) as [ProfileRow[], unknown];

    const profile = rows[0];

    if (!profile) {
      res.status(403).json({
        success: false,
        error: "No active affiliate profile is linked to this account.",
      });
      return;
    }

    req.affiliate = {
      id: profile.id,
      userId: req.user.id,
      referralCode: profile.referral_code,
      displayName: profile.full_name ?? req.user.username,
      email: profile.email,
    };

    next();
  } catch (err) {
    console.error("[affiliateOnly]", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Narrowing helper so handlers can never read `req.affiliate!` unchecked.
 * Throws if the middleware chain was mis-ordered — a programming error, not
 * a user-input condition, so failing loudly is correct.
 */
export function requireAffiliate(req: Request): AffiliateContext {
  if (!req.affiliate) {
    throw new Error("requireAffiliate() called without affiliateOnly middleware");
  }
  return req.affiliate;
}

export { authenticate };
