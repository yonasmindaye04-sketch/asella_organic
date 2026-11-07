/**
 * backend/src/routes/messages.ts
 * Asella Organic — Internal Team Messaging, Channels, Mentions & Direct (Personal) Messaging System
 *
 * Allows Admins, Managers, Delivery Drivers, Call Center, Substore Managers,
 * and Tech Support to:
 * 1. Communicate in team workspace channels
 * 2. Mention colleagues with @username
 * 3. Send 1-on-1 Direct (Personal) Messages to coworkers and admins
 * 4. Upload & share media attachments (images, documents, receipts, files)
 * 5. Track unread badges and broadcast alerts in real time
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";

import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CreateInternalMessageSchema, AddChannelMemberSchema, CreateChannelSchema } from "../schemas/index.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

// Ensure upload directory exists for message media
const MESSAGES_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "messages");
if (!fs.existsSync(MESSAGES_UPLOADS_DIR)) {
  fs.mkdirSync(MESSAGES_UPLOADS_DIR, { recursive: true });
}

// 15 MB limit for chat media (photos, receipts, PDFs, documents)
const messageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

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
    adminOnlyPost: false,
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
// POST /api/messages/upload — Upload media attachment for internal messaging
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/upload",
  authenticate,
  (req: Request, res: Response, next) => {
    messageUpload.single("media")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ success: false, error: "File size exceeds the 15 MB limit." });
          return;
        }
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ success: false, error: "Failed to upload file." });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No media file uploaded." });
      return;
    }

    try {
      const fileType = await fileTypeFromBuffer(req.file.buffer);
      const ext = fileType
        ? fileType.ext.toLowerCase()
        : path.extname(req.file.originalname).replace(/^\./, "").toLowerCase();
      const mime = fileType ? fileType.mime.toLowerCase() : req.file.mimetype.toLowerCase();

      // Allowed formats: images (jpg, png, webp, gif), documents (pdf, doc, docx, xls, xlsx, txt), audio
      const allowedExtensions = [
        "jpg", "jpeg", "png", "webp", "gif",
        "pdf", "doc", "docx", "xls", "xlsx", "txt",
        "mp3", "wav", "m4a", "ogg"
      ];

      if (!allowedExtensions.includes(ext)) {
        res.status(400).json({
          success: false,
          error: `Unsupported file format (.${ext}). Allowed: JPG, PNG, WebP, GIF, PDF, DOCX, XLSX, TXT, Audio.`,
        });
        return;
      }

      const uniqueSuffix = crypto.randomBytes(8).toString("hex") + "-" + Date.now();
      const safeFilename = `msg-${uniqueSuffix}.${ext}`;
      const fullPath = path.join(MESSAGES_UPLOADS_DIR, safeFilename);

      await fs.promises.writeFile(fullPath, req.file.buffer);

      const fileUrl = `/uploads/messages/${safeFilename}`;

      res.status(200).json({
        success: true,
        data: {
          url: fileUrl,
          filename: req.file.originalname,
          mimeType: mime,
          size: req.file.size,
        },
      });
    } catch (err: any) {
      const log = createLogger(req);
      log.error("Failed to upload internal message attachment", err);
      res.status(500).json({ success: false, error: "Internal server error uploading file." });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/conversations — List 1-on-1 Direct Message conversations
// ─────────────────────────────────────────────────────────────────────────────
router.get("/conversations", authenticate, async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.user!.id;
  try {
    // 1. Fetch all active coworkers and admins (excluding current user)
    const [staffList] = await pool.query(
      `SELECT id, username, full_name, role, telegram_username
       FROM staff_users
       WHERE active = 1 AND deleted_at IS NULL AND id != ?
       ORDER BY full_name ASC`,
      [currentUserId]
    ) as [any[], any];

    // 2. Fetch unread direct counts per sender for current user
    const [unreadRows] = await pool.query(
      `SELECT sender_id, COUNT(*) as unread_count
       FROM internal_messages
       WHERE is_direct = 1 AND recipient_id = ? AND is_read = 0
       GROUP BY sender_id`,
      [currentUserId]
    ) as [any[], any];

    const unreadMap = new Map<string, number>();
    for (const r of unreadRows || []) {
      unreadMap.set(r.sender_id, Number(r.unread_count || 0));
    }

    // 3. Fetch latest direct message per coworker
    const [latestRows] = await pool.query(
      `SELECT m.id, m.sender_id, m.recipient_id, m.content, m.media_url, m.media_type, m.media_name, m.created_at, m.sender_name
       FROM internal_messages m
       INNER JOIN (
         SELECT 
           CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as other_user_id,
           MAX(created_at) as max_created
         FROM internal_messages
         WHERE is_direct = 1 AND (sender_id = ? OR recipient_id = ?)
         GROUP BY other_user_id
       ) latest ON (
         (m.sender_id = ? AND m.recipient_id = latest.other_user_id) OR
         (m.sender_id = latest.other_user_id AND m.recipient_id = ?)
       ) AND m.created_at = latest.max_created`,
      [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
    ) as [any[], any];

    const latestMap = new Map<string, any>();
    for (const msg of latestRows || []) {
      const otherId = msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
      if (!latestMap.has(otherId)) {
        latestMap.set(otherId, {
          id: msg.id,
          content: msg.content || (msg.media_url ? "[Media]" : ""),
          media_url: msg.media_url,
          media_type: msg.media_type,
          media_name: msg.media_name,
          sender_id: msg.sender_id,
          sender_name: msg.sender_name,
          created_at: msg.created_at,
        });
      }
    }

    const conversations = (staffList || []).map((st: any) => {
      const lastMsg = latestMap.get(st.id) || null;
      const unreadCount = unreadMap.get(st.id) || 0;
      return {
        id: st.id,
        username: st.username,
        full_name: st.full_name,
        role: st.role,
        telegram_username: st.telegram_username,
        unreadCount,
        lastMessage: lastMsg,
      };
    });

    // Sort: conversations with messages first (most recent message first), then others alphabetically
    conversations.sort((a: any, b: any) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

    res.json({
      success: true,
      data: conversations,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch direct conversations", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/direct/:userId — Fetch 1-on-1 Direct Messages with a coworker
// ─────────────────────────────────────────────────────────────────────────────
router.get("/direct/:userId", authenticate, async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.user!.id;
  const targetUserId = String(req.params.userId || "");
  const { limit = "100", before } = req.query as Record<string, string | undefined>;
  const LIMIT = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));

  try {
    // 1. Verify target coworker exists
    const [targetUserRows] = await pool.query(
      `SELECT id, username, full_name, role, telegram_username
       FROM staff_users
       WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [targetUserId]
    ) as [any[], any];

    if (!targetUserRows || targetUserRows.length === 0) {
      res.status(404).json({ success: false, error: "User not found." });
      return;
    }

    const targetUser = targetUserRows[0];

    // 2. Fetch direct messages between currentUserId and targetUserId
    const conditions = [
      "is_direct = 1",
      "((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))",
    ];
    const params: any[] = [currentUserId, targetUserId, targetUserId, currentUserId];

    if (before) {
      conditions.push("created_at < ?");
      params.push(before);
    }

    params.push(LIMIT);

    const [rows] = await pool.query(
      `SELECT id, channel, sender_id, sender_name, sender_role, recipient_id, is_direct, is_read,
              content, media_url, media_type, media_name, media_size, priority, is_announcement, mentions,
              created_at, updated_at
       FROM internal_messages
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT ?`,
      params
    ) as [any[], any];

    // 3. Mark unread messages sent by targetUserId to currentUserId as read
    await pool.query(
      `UPDATE internal_messages
       SET is_read = 1
       WHERE is_direct = 1 AND recipient_id = ? AND sender_id = ? AND is_read = 0`,
      [currentUserId, targetUserId]
    );

    res.json({
      success: true,
      data: rows || [],
      user: targetUser,
      total: (rows || []).length,
    });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to fetch direct messages", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages/direct/:userId/read — Mark direct messages as read
// ─────────────────────────────────────────────────────────────────────────────
router.post("/direct/:userId/read", authenticate, async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.user!.id;
  const targetUserId = String(req.params.userId || "");

  try {
    await pool.query(
      `UPDATE internal_messages
       SET is_read = 1
       WHERE is_direct = 1 AND recipient_id = ? AND sender_id = ? AND is_read = 0`,
      [currentUserId, targetUserId]
    );

    res.json({ success: true, message: "Direct messages marked as read." });
  } catch (err: any) {
    const log = createLogger(req);
    log.error("Failed to mark direct messages as read", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/channels — List available channels and message stats
// ─────────────────────────────────────────────────────────────────────────────
router.get("/channels", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const allChannels = await getAllChannels();

    const [counts] = await pool.query(
      `SELECT channel, COUNT(*) as count, MAX(created_at) as last_activity
       FROM internal_messages
       WHERE is_direct = 0
       GROUP BY channel`
    ) as [any[], any];

    const statsMap = new Map<string, { count: number; last_activity: string | null }>();
    for (const row of counts || []) {
      statsMap.set(row.channel, {
        count: Number(row.count ?? 0),
        last_activity: row.last_activity ?? null,
      });
    }

    const channelsWithStats = allChannels.map((ch) => ({
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
// GET /api/messages/unread — Get unread counts across channels and direct messages
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

    // 1. Direct unreads for current user
    const [directUnreadRows] = await pool.query(
      `SELECT sender_id, COUNT(*) as count
       FROM internal_messages
       WHERE is_direct = 1 AND recipient_id = ? AND is_read = 0
       GROUP BY sender_id`,
      [currentUserId]
    ) as [any[], any];

    const directUnreadsByUser: Record<string, number> = {};
    let totalDirectUnreads = 0;
    for (const r of directUnreadRows || []) {
      const c = Number(r.count ?? 0);
      directUnreadsByUser[r.sender_id] = c;
      totalDirectUnreads += c;
    }

    // 2. Fetch all channels
    const allChannels = await getAllChannels();

    // 3. Fetch channel messages from others and direct messages to me
    const [allRecent] = await pool.query(
      `SELECT id, channel, sender_id, sender_name, sender_role, recipient_id, is_direct,
              content, media_url, media_type, priority, is_announcement, mentions, created_at
       FROM internal_messages
       WHERE (is_direct = 0 AND sender_id != ?) OR (is_direct = 1 AND recipient_id = ?)
       ORDER BY created_at DESC
       LIMIT 500`,
      [currentUserId, currentUserId]
    ) as [any[], any];

    const channelUnreads: Record<string, number> = {};
    for (const ch of allChannels) {
      channelUnreads[ch.id] = 0;
    }

    let totalChannelUnread = 0;
    let mentionCount = 0;
    let urgentCount = 0;
    let announcementCount = 0;

    for (const msg of allRecent || []) {
      if (Boolean(msg.is_direct)) {
        // Direct messages are counted via directUnreadsByUser
        continue;
      }

      const ch = msg.channel;
      const lastRead = parsedChannelReads[ch] || since;
      const msgTime = new Date(msg.created_at).getTime();
      const isUnread = !lastRead || msgTime > new Date(lastRead).getTime();

      if (isUnread) {
        channelUnreads[ch] = (channelUnreads[ch] || 0) + 1;
        totalChannelUnread++;

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
        unread: totalChannelUnread + totalDirectUnreads,
        channel_unreads: channelUnreads,
        direct_unreads: totalDirectUnreads,
        direct_unreads_by_user: directUnreadsByUser,
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

  const allChannels = await getAllChannels();
  const validIds = new Set(allChannels.map((c) => c.id));

  if (filter !== "mentions" && !validIds.has(channel)) {
    res.status(400).json({ success: false, error: `Invalid channel. Valid options: ${[...validIds].join(", ")}` });
    return;
  }

  try {
    const conditions: string[] = ["is_direct = 0"];
    const params: any[] = [];

    if (filter === "mentions") {
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
      `SELECT id, channel, sender_id, sender_name, sender_role, recipient_id, is_direct, is_read,
              content, media_url, media_type, media_name, media_size, priority, is_announcement, mentions,
              created_at, updated_at
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
// POST /api/messages — Send message (Channel message OR Direct Personal Message)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  validate(CreateInternalMessageSchema),
  async (req: Request, res: Response): Promise<void> => {
    const {
      channel = "general",
      recipient_id,
      content = "",
      media_url = null,
      media_type = null,
      media_name = null,
      media_size = null,
      priority = "normal",
      is_announcement = false,
    } = req.body as {
      channel?: string;
      recipient_id?: string;
      content?: string;
      media_url?: string | null;
      media_type?: string | null;
      media_name?: string | null;
      media_size?: number | null;
      priority?: string;
      is_announcement?: boolean;
    };

    const user = req.user!;
    const userRole = (user.role || "").toLowerCase();
    const isAdminOrManagerOrTech = userRole === "admin" || userRole === "manager" || userRole === "tech_support";

    const isDirect = Boolean(recipient_id);

    // 1. Validation
    if (isDirect) {
      if (recipient_id === user.id) {
        res.status(400).json({ success: false, error: "You cannot direct message yourself." });
        return;
      }

      const [recipients] = await pool.query(
        "SELECT id, username, full_name, role FROM staff_users WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1",
        [recipient_id]
      ) as [any[], any];

      if (!recipients || recipients.length === 0) {
        res.status(404).json({ success: false, error: "Recipient coworker not found or inactive." });
        return;
      }
    } else {
      const allChannels = await getAllChannels();
      const validIds = new Set(allChannels.map((c) => c.id));
      if (!channel || !validIds.has(channel)) {
        res.status(400).json({ success: false, error: "Valid channel is required." });
        return;
      }

      const targetChan = allChannels.find((c) => c.id === channel);
      if (targetChan?.adminOnlyPost && !isAdminOrManagerOrTech) {
        res.status(403).json({ success: false, error: "Only administrators can post in this channel." });
        return;
      }

      const hasAccess = await canAccessChannel(user.id, userRole, channel);
      if (!hasAccess) {
        res.status(403).json({ success: false, error: "Access denied. You are not a member of this channel." });
        return;
      }
    }

    const trimmedContent = (content || "").trim();
    if (!trimmedContent && !media_url) {
      res.status(400).json({ success: false, error: "Message content or media attachment is required." });
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
    const safeIsAnnouncement = Boolean(!isDirect && (is_announcement || channel === "announcements") && isAdminOrManagerOrTech);

    const messageId = crypto.randomUUID();
    const senderName = user.username || "Staff";
    const targetChannel = isDirect ? "direct" : channel;

    try {
      await pool.query(
        `INSERT INTO internal_messages (
           id, channel, sender_id, sender_name, sender_role, recipient_id, is_direct, is_read,
           content, media_url, media_type, media_name, media_size,
           priority, is_announcement, mentions, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          messageId,
          targetChannel,
          user.id,
          senderName,
          userRole,
          isDirect ? recipient_id : null,
          isDirect ? 1 : 0,
          trimmedContent,
          media_url || null,
          media_type || null,
          media_name || null,
          media_size ? Number(media_size) : null,
          safePriority,
          safeIsAnnouncement ? 1 : 0,
          JSON.stringify(uniqueMentions),
        ]
      );

      const [inserted] = await pool.query(
        `SELECT id, channel, sender_id, sender_name, sender_role, recipient_id, is_direct, is_read,
                content, media_url, media_type, media_name, media_size,
                priority, is_announcement, mentions, created_at, updated_at
         FROM internal_messages
         WHERE id = ? LIMIT 1`,
        [messageId]
      ) as [any[], any];

      const messageData = inserted[0] || {
        id: messageId,
        channel: targetChannel,
        sender_id: user.id,
        sender_name: senderName,
        sender_role: userRole,
        recipient_id: isDirect ? recipient_id : null,
        is_direct: isDirect ? 1 : 0,
        is_read: 0,
        content: trimmedContent,
        media_url: media_url || null,
        media_type: media_type || null,
        media_name: media_name || null,
        media_size: media_size ? Number(media_size) : null,
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
  }
);

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
      `SELECT id, sender_id, recipient_id, is_direct FROM internal_messages WHERE id = ? LIMIT 1`,
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
