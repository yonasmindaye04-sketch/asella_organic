/**
 * src/routes/auth.ts
 * Asella Organic — Authentication Routes (MySQL)
 *
 * Changes from v2:
 *   + Login now ALSO sets HttpOnly cookies (access_token + refresh_token)
 *     in addition to returning tokens in the response body.
 *     → Browser clients get cookie-based security automatically.
 *     → Existing API / mobile clients are unaffected (tokens still in body).
 *   + POST /auth/logout now also clears both cookies.
 *   + GET  /auth/me — returns current user profile from cookie or Bearer token.
 *   + All console.error replaced with structured logger.
 */

import { Router, Request, Response, CookieOptions } from "express";
import bcrypt   from "bcryptjs";
import crypto   from "crypto";
import pool     from "../config/db.js";
import { authenticate, authorise, issueTokens } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/rateLimit.js";
import { validate }       from "../middleware/validate.js";
import {
  LoginSchema, ResetRequestSchema,
  ResetConfirmSchema, CreateStaffSchema,
} from "../schemas/index.js";
import { generateResetToken, verifyResetToken, sanitizeInput } from "../lib/security.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

const DUMMY_HASH   = "$2b$12$invalidhashpadding00000000000000000000000000";
const usedResetTokens = new Set<string>();
setInterval(() => usedResetTokens.clear(), 20 * 60 * 1_000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(s: string): boolean { return UUID_RE.test(s); }

// ── Cookie config ─────────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === "production";

const ACCESS_COOKIE: CookieOptions = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: "strict",
  maxAge:   7 * 24 * 60 * 60 * 1_000,  // 7 days
  path:     "/",
};

const REFRESH_COOKIE: CookieOptions = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: "strict",
  maxAge:   7 * 24 * 60 * 60 * 1_000,  // 7 days
  path:     "/api/auth",          // Scope refresh cookie to auth routes only
};

const CLEAR_OPTS: CookieOptions = { httpOnly: true, secure: IS_PROD, sameSite: "strict", path: "/" };

// ── Audit helper ──────────────────────────────────────────────────────────────
async function audit(
  actor:  string,
  action: "LOGIN" | "LOGOUT" | "RESET_REQUEST" | "RESET_CONFIRM" | "STAFF_CREATED",
  note:   string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (table_name, record_id, actor, action, old_values, new_values)
       VALUES ('staff_users', NULL, ?, ?, NULL, ?)`,
      [actor, action, JSON.stringify({ note })]
    );
  } catch { /* never block request */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post("/login", loginRateLimit, validate(LoginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const { username, password } = req.body as { username: string; password: string };

    const [rows] = await pool.query(
      `SELECT id, full_name, username, password_hash, role
       FROM staff_users WHERE (email = ? OR username = ?) AND active = true`,
      [username, username]
    ) as [any[], any];

    const user  = rows[0];
    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : (await bcrypt.compare(password, DUMMY_HASH), false);

    await audit(username, "LOGIN", `success=${valid}`);

    if (!valid || !user) {
      log.warn("Failed login attempt", { username });
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }
    if (user.role === "affiliate") {
      res.status(403).json({ success: false, error: "Affiliates cannot log in." });
      return;
    }

    const { accessToken, refreshToken } = issueTokens({
      id: user.id, username: user.username, role: user.role as any,
    });

    // Store hashed refresh token in DB
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
    const tokenId   = crypto.randomUUID();

    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [tokenId, user.id, tokenHash, expiresAt]
    );

    // ── Set HttpOnly cookies (browser clients) ────────────────────────────
    res.cookie("access_token",  accessToken,  ACCESS_COOKIE);
    res.cookie("refresh_token", refreshToken, REFRESH_COOKIE);

    log.info("Staff login", { userId: user.id, role: user.role });

    // Tokens also in body — existing API/mobile clients unchanged
    res.json({
      success: true,
      data: {
        token:        accessToken,
        refreshToken,
        user: { id: user.id, name: user.full_name, role: user.role },
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// Accepts refresh token from cookie OR request body (backwards compatible).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);

  // Prefer cookie, fall back to body (API clients)
  const refreshToken: string | undefined =
    req.cookies?.refresh_token ?? (req.body as any)?.refreshToken;

  if (!refreshToken) {
    res.status(400).json({ success: false, error: "Refresh token required" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

  const [rows] = await pool.query(
    `SELECT t.id AS token_id, t.user_id, t.expires_at,
            u.username, u.full_name, u.role, u.active
     FROM refresh_tokens t
     JOIN staff_users u ON t.user_id = u.id
     WHERE t.token_hash = ?`,
    [tokenHash]
  ) as [any[], any];

  const record = rows[0];

  if (!record) {
    res.status(401).json({ success: false, error: "Invalid refresh token" });
    return;
  }
  if (new Date() > new Date(record.expires_at)) {
    await pool.query(`DELETE FROM refresh_tokens WHERE id = ?`, [record.token_id]);
    res.status(401).json({ success: false, error: "Refresh token expired" });
    return;
  }
  if (!record.active) {
    res.status(401).json({ success: false, error: "Account deactivated" });
    return;
  }

  const newTokens = issueTokens({
    id: record.user_id, username: record.username, role: record.role as any,
  });

  const newHash      = crypto.createHash("sha256").update(newTokens.refreshToken).digest("hex");
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);

  await pool.query(
    `UPDATE refresh_tokens SET token_hash = ?, expires_at = ? WHERE id = ?`,
    [newHash, newExpiresAt, record.token_id]
  );

  // Reissue cookies
  res.cookie("access_token",  newTokens.accessToken,  ACCESS_COOKIE);
  res.cookie("refresh_token", newTokens.refreshToken, REFRESH_COOKIE);

  log.info("Token refreshed", { userId: record.user_id });

  res.json({
    success: true,
    data: {
      token:        newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      user: { id: record.user_id, name: record.full_name, role: record.role },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post("/logout", authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log  = createLogger(req);
    const user = req.user!;

    // Blocklist the access token JTI
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1_000);
    await pool.query(
      `INSERT INTO session_blocklist (jti, expires_at) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
      [user.jti, expiresAt]
    );

    // Revoke refresh token — check cookie first, then body
    const incomingRefresh: string | undefined =
      req.cookies?.refresh_token ?? (req.body as any)?.refreshToken;

    if (incomingRefresh) {
      const tokenHash = crypto.createHash("sha256").update(incomingRefresh).digest("hex");
      await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = ?`, [tokenHash]);
    }

    // Clear cookies for browser clients
    res.clearCookie("access_token",  CLEAR_OPTS);
    res.clearCookie("refresh_token", { ...CLEAR_OPTS, path: "/api/auth" });

    await audit(user.id, "LOGOUT", `jti=${user.jti}`);
    log.info("Staff logout", { userId: user.id });

    res.json({ success: true, data: { message: "Logged out successfully." } });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// Returns the current authenticated user profile.
// Works from cookie or Bearer token — useful for React app load rehydration.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/me", authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, email, phone, active,
                two_factor_enabled, created_at
         FROM staff_users
         WHERE id = ? AND active = true AND deleted_at IS NULL`,
        [req.user!.id]
      ) as [any[], any];

      if (!rows[0]) {
        res.status(401).json({ success: false, error: "User not found." });
        return;
      }

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      log.error("Failed to fetch current user", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password  (request)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reset-password", loginRateLimit, validate(ResetRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log      = createLogger(req);
    const username = sanitizeInput((req.body as { username: string }).username);
    const MSG      = { success: true, data: { message: "If the account exists, a Telegram message will be sent." } };

    const [rows] = await pool.query(
      `SELECT id, phone FROM staff_users WHERE username = ? AND active = true`, [username]
    ) as [any[], any];
    const user = rows[0];
    if (!user?.phone) { res.json(MSG); return; }

    const normalizedUsername = username.toLowerCase().replace("@", "");
    const [tRows] = await pool.query(
      `SELECT chat_id FROM telegram_users WHERE username = ?`, [normalizedUsername]
    ) as [any[], any];
    if (!tRows[0]?.chat_id) { res.json(MSG); return; }

    const token = generateResetToken(user.id);
    try {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          chat_id:    tRows[0].chat_id,
          text:       `Your Asella reset code: \`${token}\``,
          parse_mode: "Markdown",
        }),
      });
    } catch (err) {
      log.error("Telegram reset send failed", err);
    }

    await audit(username, "RESET_REQUEST", "reset token issued");
    res.json(MSG);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/reset-password  (confirm)
// ─────────────────────────────────────────────────────────────────────────────
router.put("/reset-password", validate(ResetConfirmSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const { token, new_password } = req.body as { token: string; new_password: string };

    if (usedResetTokens.has(token)) {
      res.status(400).json({ success: false, error: "Token already used" });
      return;
    }

    let userId: string;
    try { userId = verifyResetToken(token); }
    catch (err: unknown) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Invalid token" });
      return;
    }

    usedResetTokens.add(token);
    const hash = await bcrypt.hash(new_password, 12);
    const [result] = await pool.query(
      `UPDATE staff_users SET password_hash = ?, updated_at = NOW()
       WHERE id = ? AND active = true`,
      [hash, userId]
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Revoke all refresh tokens after password change
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]).catch(() => {});

    await audit(userId, "RESET_CONFIRM", "password changed via token");
    log.info("Password reset confirmed", { userId });
    res.json({ success: true, data: { message: "Password updated successfully." } });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/change-password", authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const user = req.user!;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password || new_password.length < 8) {
      res.status(400).json({ success: false, error: "Invalid input. New password must be at least 8 characters." });
      return;
    }

    const [rows] = await pool.query(
      `SELECT password_hash FROM staff_users WHERE id = ? AND active = true AND deleted_at IS NULL`,
      [user.id]
    ) as [any[], any];

    const dbUser = rows[0];
    if (!dbUser) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const valid = await bcrypt.compare(current_password, dbUser.password_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: "Incorrect current password" });
      return;
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query(
      `UPDATE staff_users SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
      [hash, user.id]
    );

    // Optional: Revoke refresh tokens, so other devices are logged out
    await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [user.id]).catch(() => {});

    await audit(user.id, "RESET_CONFIRM", "password changed by user");
    log.info("User changed their password", { userId: user.id });
    res.json({ success: true, data: { message: "Password changed successfully." } });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Staff sub-routes (kept in auth.ts for backward-compat — also available in staff.ts)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/staff", authenticate, authorise("admin"), validate(CreateStaffSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { username, password, full_name, role, email, phone } = req.body as {
      username: string; password: string; full_name: string;
      role: string; email?: string; phone?: string;
    };

    const [existing] = await pool.query(
      `SELECT id FROM staff_users WHERE username = ?`, [username]
    ) as [any[], any];
    if (existing.length > 0) {
      res.status(409).json({ success: false, error: "Username already exists" });
      return;
    }

    const hash  = await bcrypt.hash(password, 12);
    const newId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO staff_users (id, username, password_hash, full_name, role, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, username, hash, full_name, role, email ?? null, phone ?? null]
    );

    await audit(req.user!.id, "STAFF_CREATED", `created ${username} role=${role}`);
    res.status(201).json({ success: true, data: { id: newId, username, full_name, role } });
  }
);

router.get("/staff", authenticate, authorise("admin", "manager"),
  async (_req: Request, res: Response): Promise<void> => {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, role, email, phone, active, created_at
       FROM staff_users WHERE deleted_at IS NULL ORDER BY role, full_name`
    ) as [any[], any];
    res.json({ success: true, data: rows });
  }
);

router.patch("/staff/:id", authenticate, authorise("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!staffId || !isValidUUID(staffId)) {
      res.status(400).json({ success: false, error: "Invalid staff ID" });
      return;
    }
    const { full_name, email, phone, role, active } = req.body as {
      full_name?: string; email?: string; phone?: string; role?: string; active?: boolean;
    };
    const updates: string[] = [];
    const values:  unknown[] = [];

    for (const [field, val] of Object.entries({ full_name, email, phone, role, active })) {
      if (val !== undefined) { updates.push(`${field} = ?`); values.push(val); }
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: "No valid fields to update" });
      return;
    }

    values.push(staffId);
    const [result] = await pool.query(
      `UPDATE staff_users SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      values
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: "Staff not found" });
      return;
    }
    res.json({ success: true, data: { message: "Staff updated." } });
  }
);

router.delete("/staff/:id", authenticate, authorise("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!staffId || !isValidUUID(staffId)) {
      res.status(400).json({ success: false, error: "Invalid staff ID" });
      return;
    }
    if (staffId === req.user!.id) {
      res.status(400).json({ success: false, error: "Cannot deactivate your own account" });
      return;
    }
    const [result] = await pool.query(
      `UPDATE staff_users SET active = false, deleted_at = NOW(), updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [staffId]
    ) as [any, any];

    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: "Staff not found" });
      return;
    }
    res.json({ success: true, data: { message: "Staff deactivated." } });
  }
);

export default router;
