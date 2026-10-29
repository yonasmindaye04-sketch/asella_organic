/**
 * src/routes/receipts.ts
 * Authenticated customer proof-of-payment receipt viewer.
 *
 * Rules:
 *   - Allowlist: admin, manager, employee; call_center and store_manager only for orders they created;
 *     every other role (driver, vendor, delivery, affiliate) gets 403.
 *   - Receipt linked to no order: admin and manager only.
 *   - Filename regex: ^receipt-[a-f0-9]{16}-\d+\.(png|jpe?g|webp|pdf)$
 *   - Security Headers: Cache-Control: private, no-store; X-Content-Type-Options: nosniff.
 *   - Files stored strictly in private receipts directory (not under public/).
 */
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

export const PRIVATE_RECEIPTS_DIR = path.resolve(process.cwd(), "private", "receipts");

// Ensure private receipts directory exists
if (!fs.existsSync(PRIVATE_RECEIPTS_DIR)) {
  fs.mkdirSync(PRIVATE_RECEIPTS_DIR, { recursive: true });
}

export const SAFE_FILENAME_REGEX = /^receipt-[a-f0-9]{16}-\d+\.(png|jpe?g|webp|pdf)$/i;

const ALLOWED_STAFF_ROLES = ["admin", "manager", "employee", "call_center", "store_manager"];

export async function handleReceiptDownload(req: Request, res: Response): Promise<void> {
  const log = createLogger(req);
  const { filename } = req.params;

  if (!filename || !SAFE_FILENAME_REGEX.test(filename)) {
    res.status(400).json({ success: false, error: "Invalid receipt filename" });
    return;
  }

  const role = req.user?.role;
  if (!role || !ALLOWED_STAFF_ROLES.includes(role)) {
    res.status(403).json({ success: false, error: "Forbidden: role not authorized to view receipts" });
    return;
  }

  try {
    // Exact-match LIKE lookup with % and _ escaped
    const escapedFilename = filename.replace(/[%_\\]/g, "\\$&");
    const [orders] = await pool.query(
      `SELECT id, created_by_staff_id FROM orders WHERE notes LIKE ? AND deleted_at IS NULL LIMIT 1`,
      [`%${escapedFilename}%`]
    ) as [any[], any];

    const order = orders[0];

    // Receipt linked to no order: admin and manager only
    if (!order) {
      if (role !== "admin" && role !== "manager") {
        res.status(403).json({ success: false, error: "Forbidden: only admin and manager can view unlinked receipts" });
        return;
      }
    } else {
      // call_center and store_manager can only view receipts for orders they created
      if (role === "call_center" || role === "store_manager") {
        if (order.created_by_staff_id !== req.user.id) {
          res.status(403).json({ success: false, error: "Forbidden: cannot view receipt for this order" });
          return;
        }
      }
    }

    // Physical file lookup: strictly in private receipts folder, never under public/
    const filePath = path.resolve(PRIVATE_RECEIPTS_DIR, filename);
    if (!filePath.startsWith(PRIVATE_RECEIPTS_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: "Receipt not found" });
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(filePath);
  } catch (err) {
    log.error("Failed to serve receipt", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

router.get("/:filename", authenticate, handleReceiptDownload);

export default router;
