/**
 * src/routes/staff.ts
 * Asella Organic — Staff Management + 2FA Routes (MySQL)
 *
 * GET    /api/staff              List staff (paginated, filterable)
 * GET    /api/staff/:id          Single staff member
 * POST   /api/staff              Create staff (admin)
 * PATCH  /api/staff/:id          Update staff (admin)
 * DELETE /api/staff/:id          Soft-delete (admin + 2FA)
 * PATCH  /api/staff/:id/password Reset password (admin + 2FA)
 *
 * POST   /api/staff/2fa/setup    Generate TOTP secret + QR code (caller)
 * POST   /api/staff/2fa/verify   Confirm code → enable 2FA (caller)
 * DELETE /api/staff/2fa/disable  Disable 2FA (caller, requires valid token)
 */

import { Router, Request, Response } from "express";
import bcrypt         from "bcryptjs";
import crypto         from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode         from "qrcode";
import pool           from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { require2FA }  from "../middleware/2fa.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

const BCRYPT_ROUNDS = 12;
const UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID   = (s: string) => UUID_RE.test(s);

const VALID_ROLES = ["admin", "manager", "employee", "affiliate", "delivery", "vendor"] as const;
type StaffRole    = typeof VALID_ROLES[number];
const isValidRole = (r: unknown): r is StaffRole => VALID_ROLES.includes(r as StaffRole);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/staff  — paginated list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { role, search, page = "1", limit = "50" } = req.query as Record<string, string>;
      const pageNum  = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const offset   = (pageNum - 1) * limitNum;

      const conditions: string[] = ["deleted_at IS NULL"];
      const params:     unknown[] = [];

      if (role && isValidRole(role)) {
        conditions.push("role = ?");
        params.push(role);
      }
      if (search) {
        conditions.push("(full_name LIKE ? OR username LIKE ? OR email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM staff_users ${where}`,
        params
      ) as [any[], any];
      const total = parseInt(countRows[0]?.total ?? "0", 10);

      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, email, phone, active,
                two_factor_enabled, created_at, updated_at
         FROM staff_users ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      ) as [any[], any];

      log.info("Staff listed", { page: pageNum, limit: limitNum, total });
      res.json({
        success: true,
        data:    rows,
        meta:    { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      log.error("Failed to list staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/staff/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!staffId || !isValidUUID(staffId)) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, email, phone, active,
                two_factor_enabled, created_at, updated_at
         FROM staff_users
          WHERE id = ? AND deleted_at IS NULL`,
        [staffId]
      ) as [any[], any];

      if (!rows[0]) {
        res.status(404).json({ success: false, error: "Staff member not found" });
        return;
      }
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      log.error("Failed to fetch staff member", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/staff  — create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  authorise("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { username, password, full_name, role, email, phone } = req.body as {
        username?: string; password?: string; full_name?: string;
        role?: string; email?: string; phone?: string;
      };

      if (!username || !password || !full_name || !role) {
        res.status(400).json({ success: false, error: "username, password, full_name, and role are required." });
        return;
      }
      if (!isValidRole(role)) {
        res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ success: false, error: "Password must be at least 8 characters." });
        return;
      }

      const [existing] = await pool.query(
        `SELECT id FROM staff_users WHERE username = ? AND deleted_at IS NULL`,
        [username.toLowerCase()]
      ) as [any[], any];
      if (existing.length > 0) {
        res.status(409).json({ success: false, error: "Username already exists." });
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const newId        = crypto.randomUUID();

      await pool.query(
        `INSERT INTO staff_users (id, username, password_hash, full_name, role, email, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId, username.toLowerCase(), passwordHash, full_name, role, email ?? null, phone ?? null]
      );

      await pool.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, new_values)
         VALUES ('staff_users', ?, ?, 'STAFF_CREATED', ?)`,
        [newId, req.user!.id, JSON.stringify({ username, full_name, role })]
      ).catch(() => {});

      log.info("Staff created", { newId, username, role });
      res.status(201).json({ success: true, data: { id: newId, username, full_name, role } });
    } catch (err) {
      log.error("Failed to create staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/staff/:id  — update
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  authenticate,
  authorise("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!staffId || !isValidUUID(staffId)) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }

      const { full_name, role, email, phone, active } = req.body as {
        full_name?: string; role?: string; email?: string; phone?: string; active?: boolean;
      };

      if (role && !isValidRole(role)) {
        res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
        return;
      }

      const updates: string[] = [];
      const values:  unknown[] = [];

      for (const [field, val] of Object.entries({ full_name, role, email, phone, active })) {
        if (val !== undefined) { updates.push(`${field} = ?`); values.push(val); }
      }
      if (updates.length === 0) {
        res.status(400).json({ success: false, error: "No valid fields to update." });
        return;
      }

      values.push(staffId);
      const [result] = await pool.query(
        `UPDATE staff_users SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = ? AND deleted_at IS NULL`,
        values
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }

      log.info("Staff updated", { staffId: req.params.id });
      res.json({ success: true, data: { message: "Staff updated." } });
    } catch (err) {
      log.error("Failed to update staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/staff/:id  — soft-delete (admin + 2FA)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  authorise("admin"),
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!staffId || !isValidUUID(staffId)) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }
      if (staffId === req.user!.id) {
        res.status(400).json({ success: false, error: "Cannot deactivate your own account." });
        return;
      }

      const [result] = await pool.query(
        `UPDATE staff_users SET active = false, deleted_at = NOW(), updated_at = NOW()
         WHERE id = ? AND deleted_at IS NULL`,
        [staffId]
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }

      // Revoke all active sessions for deleted user
      await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [staffId]).catch(() => {});

      await pool.query(
        `INSERT INTO audit_log (table_name, record_id, actor, action, old_values)
         VALUES ('staff_users', ?, ?, 'DELETE', ?)`,
        [staffId, req.user!.id, JSON.stringify({ deleted: staffId })]
      ).catch(() => {});

      log.info("Staff soft-deleted", { staffId });
      res.json({ success: true, data: { message: "Staff deactivated." } });
    } catch (err) {
      log.error("Failed to delete staff", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/staff/:id/password  — reset another user's password (admin + 2FA)
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  "/:id/password",
  authenticate,
  authorise("admin"),
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!staffId || !isValidUUID(staffId)) {
        res.status(400).json({ success: false, error: "Invalid staff ID" });
        return;
      }

      const { new_password } = req.body as { new_password?: string };
      if (!new_password || new_password.length < 8) {
        res.status(400).json({ success: false, error: "new_password must be at least 8 characters." });
        return;
      }

      const [existing] = await pool.query(
        `SELECT id FROM staff_users WHERE id = ? AND deleted_at IS NULL`, [req.params.id]
      ) as [any[], any];
      if (!existing[0]) {
        res.status(404).json({ success: false, error: "Staff member not found." });
        return;
      }

      const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
      await pool.query(
        `UPDATE staff_users SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
        [passwordHash, req.params.id]
      );

      // Revoke all sessions after password change
      await pool.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [req.params.id]).catch(() => {});

      log.info("Staff password reset", { staffId: req.params.id, by: req.user!.id });
      res.json({ success: true, data: { message: "Password updated. All sessions revoked." } });
    } catch (err) {
      log.error("Failed to reset password", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/staff/2fa/setup  — generate TOTP secret + QR code for caller
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/2fa/setup",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const [rows] = await pool.query(
        `SELECT username, two_factor_enabled FROM staff_users WHERE id = ? AND active = true`,
        [req.user!.id]
      ) as [any[], any];

      if (!rows[0]) {
        res.status(404).json({ success: false, error: "User not found." });
        return;
      }
      if (rows[0].two_factor_enabled) {
        res.status(409).json({ success: false, error: "2FA is already enabled. Disable it first to reset." });
        return;
      }

      const secret      = generateSecret();
      const otpauthUrl  = generateURI({ secret, issuer: "Asella Organic", label: rows[0].username });
      const qrCodeData  = await qrcode.toDataURL(otpauthUrl);

      // Store secret (not yet enabled — enabled only after /2fa/verify)
      await pool.query(
        `UPDATE staff_users SET two_factor_secret = ?, updated_at = NOW() WHERE id = ?`,
        [secret, req.user!.id]
      );

      log.info("2FA setup initiated", { userId: req.user!.id });
      res.json({
        success: true,
        data: {
          message:          "Scan the QR code with your authenticator app, then call POST /api/staff/2fa/verify.",
          qr_code:          qrCodeData,
          manual_entry_key: secret,
        },
      });
    } catch (err) {
      log.error("2FA setup failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/staff/2fa/verify  — confirm TOTP code and enable 2FA
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/2fa/verify",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { token } = req.body as { token?: string };
      if (!token) {
        res.status(400).json({ success: false, error: "token is required." });
        return;
      }

      const [rows] = await pool.query(
        `SELECT two_factor_secret, two_factor_enabled FROM staff_users WHERE id = ?`,
        [req.user!.id]
      ) as [any[], any];

      const staff = rows[0];
      if (!staff?.two_factor_secret) {
        res.status(400).json({ success: false, error: "No 2FA setup found. Call POST /api/staff/2fa/setup first." });
        return;
      }
      if (staff.two_factor_enabled) {
        res.status(409).json({ success: false, error: "2FA is already enabled." });
        return;
      }

      const result = verifySync({ token, secret: staff.two_factor_secret });
      const isValid = result.valid;
      if (!isValid) {
        res.status(401).json({ success: false, error: "Invalid TOTP code. Please try again." });
        return;
      }

      await pool.query(
        `UPDATE staff_users SET two_factor_enabled = true, updated_at = NOW() WHERE id = ?`,
        [req.user!.id]
      );

      log.info("2FA enabled", { userId: req.user!.id });
      res.json({ success: true, data: { message: "2FA has been enabled for your account." } });
    } catch (err) {
      log.error("2FA verify failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/staff/2fa/disable  — disable 2FA (requires current valid token)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/2fa/disable",
  authenticate,
  require2FA,
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      await pool.query(
        `UPDATE staff_users
         SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW()
         WHERE id = ?`,
        [req.user!.id]
      );
      log.info("2FA disabled", { userId: req.user!.id });
      res.json({ success: true, data: { message: "2FA has been disabled." } });
    } catch (err) {
      log.error("2FA disable failed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
