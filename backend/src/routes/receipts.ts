/**
 * src/routes/receipts.ts
 * Authenticated customer proof-of-payment receipt viewer.
 *
 * Rules:
 *   - Unauthenticated: 401 Unauthorized
 *   - Delivery drivers: 403 Forbidden (drivers have no business seeing customer receipts)
 *   - Affiliates: 403 Forbidden
 *   - Call center & Store manager: 403 Forbidden unless order.created_by_staff_id === req.user.id
 *   - Admin, Manager, Employee: 200 OK (authorized staff)
 */
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

export const PRIVATE_RECEIPTS_DIR = path.join(process.cwd(), "private", "receipts");
export const PUBLIC_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Ensure private receipts directory exists
if (!fs.existsSync(PRIVATE_RECEIPTS_DIR)) {
  fs.mkdirSync(PRIVATE_RECEIPTS_DIR, { recursive: true });
}

const SAFE_FILENAME_REGEX = /^receipt-[a-zA-Z0-9_\-]+\.(jpg|jpeg|png|webp|gif|pdf)$/i;

export async function handleReceiptDownload(req: Request, res: Response): Promise<void> {
  const log = createLogger(req);
  const { filename } = req.params;

  if (!filename || !SAFE_FILENAME_REGEX.test(filename)) {
    res.status(400).json({ success: false, error: "Invalid receipt filename" });
    return;
  }

  // Delivery drivers and affiliates are NOT allowed to open receipts
  if (req.user?.role === "delivery" || req.user?.role === "affiliate") {
    res.status(403).json({ success: false, error: "Forbidden: role not authorized to view receipts" });
    return;
  }

  try {
    // Check order association and ownership
    const [orders] = await pool.query(
      `SELECT id, created_by_staff_id FROM orders WHERE notes LIKE ? AND deleted_at IS NULL LIMIT 1`,
      [`%${filename}%`]
    ) as [any[], any];

    const order = orders[0];

    // call_center and store_manager can only view receipts for orders they created
    if (req.user?.role === "call_center" || req.user?.role === "store_manager") {
      if (!order || order.created_by_staff_id !== req.user.id) {
        res.status(403).json({ success: false, error: "Forbidden: cannot view receipt for this order" });
        return;
      }
    }

    // Physical file lookup: check private folder first, fall back to legacy public uploads
    let filePath = path.join(PRIVATE_RECEIPTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      const legacyPath = path.join(PUBLIC_UPLOADS_DIR, filename);
      if (fs.existsSync(legacyPath)) {
        filePath = legacyPath;
      } else {
        res.status(404).json({ success: false, error: "Receipt not found" });
        return;
      }
    }

    res.sendFile(filePath);
  } catch (err) {
    log.error("Failed to serve receipt", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

router.get("/:filename", authenticate, handleReceiptDownload);

export default router;
