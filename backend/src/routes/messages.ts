/**
 * backend/src/routes/messages.ts
 * Asella Organic — Internal Team Messaging & Mention System
 *
 * Allows Admins, Managers, Delivery Drivers, Call Center, Substore Managers,
 * and Tech Support to communicate, mention colleagues with @username,
 * broadcast alerts, and resolve customer issues in real time.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CreateInternalMessageSchema, AddChannelMemberSchema, CreateChannelSchema } from "../schemas/index.js";
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
    adminOnlyPost: false, // Accessible to all users for team-wide announcements
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

async function getAllChannels(): Promise<InternalChannel[]> {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, icon, admin_only_post, is_default, created_by, created_at
       FROM internal_channels
       ORDER BY is_default DESC, created_at ASC`
    ) as [any[], any];
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description || "",
        icon: r.icon || "forum",
        badgeColor: "bg-blue-100 text-blue-800 border-blue-300",
        adminOnlyPost: Boolean(r.admin_only_post),
      }));
    }
  } catch {
    /* fallback to hardcoded default channels */
  }
  return CHANNELS;
}

async function canAccessChannel(userId: string, role: string, channelId: string): Promise<boolean> {
  const r = (role || "").toLowerCase();
  if (r === "admin" || r === "manager" || r === "tech_support") return true;
  try {
    const [rows] = await pool.query(
      "SELECT 1 FROM internal_channel_members WHERE channel = ? AND user_id = ? LIMIT 1",
      [channelId, userId]
    ) as [any[], any];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}


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
// POST /api/messages/channels — Create a new channel (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/channels",
  authenticate,
  validate(CreateChannelSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const userRole = (user.role || "").toLowerCase();
    const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

    if (!isAdminOrManagerOrTech) {
      res.status(403).json({ success: false, error: "Only administrators can create channels." });
      return;
    }

    const { name, description = "", icon = "forum", admin_only_post = false, initial_role } = req.body as {
      name: string;
      description?: string;
      icon?: string;
      admin_only_post?: boolean;
      initial_role?: string;
    };

    let slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

    if (!slug) {
      slug = `chan_${Date.now().toString(36)}`;
    }

    try {
      const existing = await getAllChannels();
      if (existing.some((c) => c.id === slug)) {
        slug = `${slug}_${Math.floor(100 + Math.random() * 900)}`;
      }

      await pool.query(
        `INSERT INTO internal_channels (id, name, description, icon, admin_only_post, is_default, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, NOW())`,
        [slug, name.trim(), description.trim(), icon.trim(), admin_only_post ? 1 : 0, user.id]
      );

      // Add creator to channel
      await pool.query(
        `INSERT INTO internal_channel_members (channel, user_id, added_by, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE created_at = NOW()`,
        [slug, user.id, user.id]
      );

      let addedMembersCount = 1;
      if (initial_role) {
        let staffQuery = "SELECT id FROM staff_users WHERE active = 1 AND deleted_at IS NULL";
        const queryParams: any[] = [];
        if (initial_role !== "all") {
          if (initial_role === "delivery" || initial_role === "driver") {
            staffQuery += " AND (role = 'delivery' OR role = 'driver')";
          } else {
            staffQuery += " AND role = ?";
            queryParams.push(initial_role);
          }
        }
        const [staffRows] = await pool.query(staffQuery, queryParams) as [any[], any];
        for (const st of staffRows || []) {
          await pool.query(
            `INSERT INTO internal_channel_members (channel, user_id, added_by, created_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE created_at = NOW()`,
            [slug, st.id, user.id]
          );
        }
        addedMembersCount += (staffRows || []).length;
      }

      res.status(201).json({
        success: true,
        data: {
          id: slug,
          name: name.trim(),
          description: description.trim(),
          icon: icon.trim(),
          adminOnlyPost: admin_only_post,
          isDefault: false,
          memberCount: addedMembersCount,
          canManage: true,
        },
        message: "Channel created successfully.",
      });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to create channel", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/messages/channels/:channelId — Delete a custom channel (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/channels/:channelId", authenticate, async (req: Request, res: Response): Promise<void> => {
  const channelId = String(req.params.channelId || "");
  const user = req.user!;
  const userRole = (user.role || "").toLowerCase();
  const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

  if (!isAdminOrManagerOrTech) {
    res.status(403).json({ success: false, error: "Only administrators can delete channels." });
    return;
  }

  const PROTECTED_CHANNELS = new Set(["general", "announcements"]);
  if (PROTECTED_CHANNELS.has(channelId)) {
    res.status(400).json({ success: false, error: "Default system channels cannot be deleted." });
    return;
  }

  try {
    await pool.query("DELETE FROM internal_channels WHERE id = ?", [channelId]);
    await pool.query("DELETE FROM internal_channel_members WHERE channel = ?", [channelId]);
    await pool.query("DELETE FROM internal_messages WHERE channel = ?", [channelId]);

    res.json({ success: true, message: "Channel deleted successfully." });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to delete channel", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/users — List active staff members for @mention autocomplete
// ─────────────────────────────────────────────────────────────────────────────
router.get("/users", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, role, active, telegram_username
       FROM staff_users
       WHERE active = 1 AND deleted_at IS NULL
       ORDER BY full_name ASC`
    ) as [any[], any];

    res.json({
      success: true,
      data: rows || [],
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch users for mentions", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/channels/:channelId/members — List members in channel
// ─────────────────────────────────────────────────────────────────────────────
router.get("/channels/:channelId/members", authenticate, async (req: Request, res: Response): Promise<void> => {
  const channelId = String(req.params.channelId || "");
  const user = req.user!;
  const userRole = (user.role || "").toLowerCase();

  const hasAccess = await canAccessChannel(user.id, userRole, channelId);
  if (!hasAccess) {
    res.status(403).json({ success: false, error: "Access denied. You are not a member of this channel." });
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.telegram_username, m.created_at as joined_at, m.added_by
       FROM internal_channel_members m
       JOIN staff_users u ON m.user_id = u.id
       WHERE m.channel = ? AND u.deleted_at IS NULL
       ORDER BY u.full_name ASC`,
      [channelId]
    ) as [any[], any];

    res.json({
      success: true,
      data: rows || [],
      channelId,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch channel members", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages/channels/:channelId/members — Add employee to channel (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/channels/:channelId/members",
  authenticate,
  validate(AddChannelMemberSchema),
  async (req: Request, res: Response): Promise<void> => {
    const channelId = String(req.params.channelId || "");
    const { user_id, role } = req.body as { user_id?: string; role?: string };
    const user = req.user!;
    const userRole = (user.role || "").toLowerCase();
    const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

    if (!isAdminOrManagerOrTech) {
      res.status(403).json({ success: false, error: "Only administrators can grant channel access to employees." });
      return;
    }

    try {
      if (role) {
        let staffQuery = "SELECT id FROM staff_users WHERE active = 1 AND deleted_at IS NULL";
        const queryParams: any[] = [];
        if (role !== "all") {
          if (role === "delivery" || role === "driver") {
            staffQuery += " AND (role = 'delivery' OR role = 'driver')";
          } else {
            staffQuery += " AND role = ?";
            queryParams.push(role);
          }
        }
        const [staffList] = await pool.query(staffQuery, queryParams) as [any[], any];
        for (const st of staffList || []) {
          await pool.query(
            `INSERT INTO internal_channel_members (channel, user_id, added_by, created_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE created_at = NOW()`,
            [channelId, st.id, user.id]
          );
        }
        res.status(201).json({
          success: true,
          count: (staffList || []).length,
          message: `Successfully added ${(staffList || []).length} team members with role '${role}' to channel.`,
        });
        return;
      }

      if (user_id) {
        await pool.query(
          `INSERT INTO internal_channel_members (channel, user_id, added_by, created_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE created_at = NOW()`,
          [channelId, user_id, user.id]
        );

        res.status(201).json({
          success: true,
          count: 1,
          message: "Employee successfully added to channel.",
        });
        return;
      }

      res.status(400).json({ success: false, error: "Either user_id or role is required." });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to add employee to channel", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/messages/channels/:channelId/members/:userId — Remove employee from channel
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/channels/:channelId/members/:userId",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const channelId = String(req.params.channelId || "");
    const userId = String(req.params.userId || "");
    const user = req.user!;
    const userRole = (user.role || "").toLowerCase();
    const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

    if (!isAdminOrManagerOrTech) {
      res.status(403).json({ success: false, error: "Only administrators can remove employees from channels." });
      return;
    }

    try {
      await pool.query(
        "DELETE FROM internal_channel_members WHERE channel = ? AND user_id = ?",
        [channelId, userId]
      );

      res.json({
        success: true,
        message: "Employee removed from channel successfully.",
      });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to remove employee from channel", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/unread — Get unread message counts across channels
// ─────────────────────────────────────────────────────────────────────────────
router.get("/unread", authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const currentUserId = user.id;
  const currentUsername = user.username || "";
  const { since, channel_reads } = req.query as { since?: string; channel_reads?: string };

  try {
    let parsedChannelReads: Record<string, string> = {};
    if (channel_reads) {
      try {
        parsedChannelReads = JSON.parse(channel_reads);
      } catch {
        parsedChannelReads = {};
      }
    }

    // 1. Get channel message counts and latest message per channel
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

    // 2. Fetch all messages from others to calculate unread counts per channel
    const [allRecent] = await pool.query(
      `SELECT id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, mentions, created_at
       FROM internal_messages
       WHERE sender_id != ?
       ORDER BY created_at DESC
       LIMIT 500`,
      [currentUserId]
    ) as [any[], any];

    const channelUnreads: Record<string, number> = {};
    for (const ch of CHANNELS) {
      channelUnreads[ch.id] = 0;
    }

    let totalUnread = 0;
    let mentionCount = 0;
    let urgentCount = 0;
    let announcementCount = 0;

    for (const msg of allRecent || []) {
      const ch = msg.channel;
      const lastRead = parsedChannelReads[ch] || since;
      const msgTime = new Date(msg.created_at).getTime();
      const isUnread = !lastRead || msgTime > new Date(lastRead).getTime();

      if (isUnread) {
        channelUnreads[ch] = (channelUnreads[ch] || 0) + 1;
        totalUnread++;

        let mentions: string[] = [];
        if (Array.isArray(msg.mentions)) {
          mentions = msg.mentions;
        } else if (typeof msg.mentions === "string") {
          try {
            mentions = JSON.parse(msg.mentions);
          } catch {
            mentions = [];
          }
        }

        if (
          (currentUsername && msg.content?.toLowerCase().includes(`@${currentUsername.toLowerCase()}`)) ||
          mentions.some((m: string) => m.toLowerCase() === currentUsername.toLowerCase())
        ) {
          mentionCount++;
        }

        if (msg.priority === "urgent") {
          urgentCount++;
        }

        if (msg.is_announcement || msg.priority === "announcement") {
          announcementCount++;
        }
      }
    }

    const latest = allRecent && allRecent.length > 0 ? allRecent[0] : null;

    res.json({
      success: true,
      data: {
        unread: totalUnread,
        channel_unreads: channelUnreads,
        mentions: mentionCount,
        urgent: urgentCount,
        announcements: announcementCount,
        latest,
      },
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch unread messages count", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages — Fetch message stream for a channel (or filter by mentions)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { channel = "deliveries", limit = "50", before, search, filter } = req.query as Record<string, string | undefined>;
  const LIMIT = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const currentUsername = req.user?.username || "";

  if (filter !== "mentions" && !VALID_CHANNEL_IDS.has(channel)) {
    res.status(400).json({ success: false, error: `Invalid channel. Valid options: ${[...VALID_CHANNEL_IDS].join(", ")}` });
    return;
  }

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter === "mentions") {
      // Find messages where the current user is mentioned across all channels
      conditions.push("(content LIKE ? OR JSON_CONTAINS(mentions, ?))");
      params.push(`%@${currentUsername}%`, JSON.stringify(currentUsername));
    } else {
      conditions.push("channel = ?");
      params.push(channel);
    }

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
      `SELECT id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, mentions, created_at, updated_at
       FROM internal_messages
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT ?`,
      params
    ) as [any[], any];

    const parsedRows = (rows || []).map((m: any) => {
      let parsedMentions: string[] = [];
      if (typeof m.mentions === "string") {
        try {
          parsedMentions = JSON.parse(m.mentions);
        } catch {
          parsedMentions = [];
        }
      } else if (Array.isArray(m.mentions)) {
        parsedMentions = m.mentions;
      }
      return {
        ...m,
        mentions: parsedMentions,
      };
    });

    res.json({
      success: true,
      data: parsedRows,
      total: parsedRows.length,
      channel,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch internal messages", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages — Send a new message to a channel with @mentions
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", authenticate, validate(CreateInternalMessageSchema), async (req: Request, res: Response): Promise<void> => {
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

  // Parse @username mentions from message body
  const mentionMatches = (trimmedContent.match(/@([a-zA-Z0-9_.-]+)/g) || []).map((m) =>
    m.slice(1).toLowerCase()
  );
  const uniqueMentions = [...new Set(mentionMatches)];

  const validPriorities = ["normal", "urgent", "announcement"];
  const safePriority = validPriorities.includes(priority) ? priority : "normal";
  const safeIsAnnouncement = Boolean((is_announcement || channel === "announcements") && isAdminOrManagerOrTech);

  const messageId = crypto.randomUUID();
  const senderName = user.username || "Staff";

  try {
    await pool.query(
      `INSERT INTO internal_messages (
         id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, mentions, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        messageId,
        channel,
        user.id,
        senderName,
        userRole,
        trimmedContent,
        safePriority,
        safeIsAnnouncement ? 1 : 0,
        JSON.stringify(uniqueMentions),
      ]
    );

    const [inserted] = await pool.query(
      `SELECT id, channel, sender_id, sender_name, sender_role, content, priority, is_announcement, mentions, created_at, updated_at
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
      mentions: uniqueMentions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (typeof messageData.mentions === "string") {
      try {
        messageData.mentions = JSON.parse(messageData.mentions);
      } catch {
        messageData.mentions = uniqueMentions;
      }
    }

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
