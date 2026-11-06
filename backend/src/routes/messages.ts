/**
 * backend/src/routes/messages.ts
 * Asella Organic — Internal Team Messaging & Delivery Dispatch Channel
 *
 * Allows Admins, Managers, Delivery Drivers, Call Center, Substore Managers,
 * and Tech Support to communicate, broadcast alerts, coordinate deliveries,
 * and resolve customer issues in real time.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

export interface InternalChannel {
  id: string;
  name: string;
  description: string;
  icon: string;
  badgeColor: string;
  adminOnlyPost?: boolean;
}

export const CHANNELS: InternalChannel[] = [
  {
    id: "deliveries",
    name: "Delivery & Dispatch",
    description: "Dispatch coordination, priority route notes, customer address updates, and driver reports.",
    icon: "local_shipping",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  {
    id: "announcements",
    name: "Company Announcements",
    description: "Official workplace broadcasts and management alerts across all branches.",
    icon: "campaign",
    badgeColor: "bg-amber-100 text-amber-900 border-amber-300",
    adminOnlyPost: true,
  },
  {
    id: "general",
    name: "All-Staff Team",
    description: "Company-wide general communication, daily shift notes, and employee collaboration.",
    icon: "forum",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-300",
  },
  {
    id: "call_center",
    name: "Call Center Desk",
    description: "Order modifications, customer inquiries, and phone order handovers.",
    icon: "headset_mic",
    badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-300",
  },
  {
    id: "operations",
    name: "Store & Inventory",
    description: "Substore fulfillment, restock coordination, and counter inventory queries.",
    icon: "inventory_2",
    badgeColor: "bg-teal-100 text-teal-800 border-teal-300",
  },
  {
    id: "tech_support",
    name: "Tech Support Desk",
    description: "Technical assistance, bug reports, and system permissions help.",
    icon: "terminal",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-300",
  },
];

const VALID_CHANNEL_IDS = new Set(CHANNELS.map((c) => c.id));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/channels — List available channels and message stats
// ─────────────────────────────────────────────────────────────────────────────
router.get("/channels", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const [counts] = await pool.query(
      `SELECT channel, COUNT(*) as count, MAX(created_at) as last_activity
       FROM internal_messages
       GROUP BY channel`
    ) as [any[], any];

    const statsMap = new Map<string, { count: number; last_activity: string | null }>();
    for (const row of counts || []) {
      statsMap.set(row.channel, {
        count: Number(row.count ?? 0),
        last_activity: row.last_activity ?? null,
      });
    }

    const channelsWithStats = CHANNELS.map((ch) => ({
      ...ch,
      messageCount: statsMap.get(ch.id)?.count ?? 0,
      lastActivity: statsMap.get(ch.id)?.last_activity ?? null,
    }));

    res.json({
      success: true,
      data: channelsWithStats,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch messaging channels", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages — Fetch message stream for a channel
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { channel = "deliveries", limit = "50", before, search } = req.query as Record<string, string | undefined>;
  const LIMIT = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  if (!VALID_CHANNEL_IDS.has(channel)) {
    res.status(400).json({ success: false, error: `Invalid channel. Valid options: ${[...VALID_CHANNEL_IDS].join(", ")}` });
    return;
  }

  try {
    const conditions: string[] = ["channel = ?"];
    const params: any[] = [channel];

    if (before) {
      conditions.push("created_at < ?");
      params.push(before);
    }

    if (search && search.trim()) {
      conditions.push("(content LIKE ? OR sender_name LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    params.push(LIMIT);

    const [rows] = await pool.query(
      `SELECT id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, created_at, updated_at
       FROM internal_messages
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT ?`,
      params
    ) as [any[], any];

    res.json({
      success: true,
      data: rows || [],
      total: rows?.length || 0,
      channel,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch internal messages", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages — Send a new message to a channel
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { channel, content, priority = "normal", is_announcement = false } = req.body as {
    channel?: string;
    content?: string;
    priority?: string;
    is_announcement?: boolean;
  };

  const user = req.user!;
  const userRole = (user.role || "").toLowerCase();
  const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

  if (!channel || !VALID_CHANNEL_IDS.has(channel)) {
    res.status(400).json({ success: false, error: "Valid channel is required." });
    return;
  }

  const trimmedContent = (content || "").trim();
  if (!trimmedContent || trimmedContent.length === 0) {
    res.status(400).json({ success: false, error: "Message content cannot be empty." });
    return;
  }

  if (trimmedContent.length > 2000) {
    res.status(400).json({ success: false, error: "Message content cannot exceed 2000 characters." });
    return;
  }

  // Announcements channel & announcements flag restriction
  if ((channel === "announcements" || is_announcement) && !isAdminOrManagerOrTech) {
    res.status(403).json({
      success: false,
      error: "Only Admins, Managers, and Tech Support can post announcements.",
    });
    return;
  }

  const validPriorities = ["normal", "urgent", "announcement"];
  const safePriority = validPriorities.includes(priority) ? priority : "normal";
  const safeIsAnnouncement = Boolean(is_announcement || channel === "announcements");

  const messageId = crypto.randomUUID();
  const senderName = user.username || "Staff";

  try {
    await pool.query(
      `INSERT INTO internal_messages (
         id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        messageId,
        channel,
        user.id,
        senderName,
        userRole,
        trimmedContent,
        safePriority,
        safeIsAnnouncement ? 1 : 0,
      ]
    );

    const [inserted] = await pool.query(
      `SELECT id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, created_at, updated_at
       FROM internal_messages
       WHERE id = ? LIMIT 1`,
      [messageId]
    ) as [any[], any];

    const messageData = inserted[0] || {
      id: messageId,
      channel,
      sender_id: user.id,
      sender_name: senderName,
      sender_role: userRole,
      content: trimmedContent,
      priority: safePriority,
      is_announcement: safeIsAnnouncement ? 1 : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    res.status(201).json({
      success: true,
      data: messageData,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to post internal message", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/messages/:id — Delete a message
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;
  const userRole = (user.role || "").toLowerCase();
  const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

  try {
    const [rows] = await pool.query(
      `SELECT id, sender_id FROM internal_messages WHERE id = ? LIMIT 1`,
      [id]
    ) as [any[], any];

    if (!rows || rows.length === 0) {
      res.status(404).json({ success: false, error: "Message not found." });
      return;
    }

    const message = rows[0];
    if (message.sender_id !== user.id && !isAdminOrManagerOrTech) {
      res.status(403).json({ success: false, error: "You can only delete your own messages." });
      return;
    }

    await pool.query(`DELETE FROM internal_messages WHERE id = ?`, [id]);

    res.json({ success: true, message: "Message deleted successfully." });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to delete message", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
