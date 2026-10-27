/**
 * src/routes/performance.ts
 * Asella Organic — Team Performance Aggregations (Admin / Manager)
 *
 * GET /api/performance/teams?from&to
 *
 * One endpoint that rolls every internal team up into a comparable shape so
 * the admin can watch the whole organisation from a single side panel:
 *
 *   call_center — calls logged (call_logs) + orders placed (created_by_staff_id)
 *   delivery    — orders assigned (orders.assigned_to) + rejections
 *   employee    — orders placed (created_by_staff_id)
 *   all         — every member of the three teams above, in one list
 *
 * Two different keys link a person to their work, and that asymmetry is the
 * whole reason this file exists:
 *
 *   - Sales work is attributed by staff id:  orders.created_by_staff_id
 *   - Delivery work is attributed by Telegram handle: orders.assigned_to
 *
 * `assigned_to` is written by the Telegram delivery bot, which has no
 * knowledge of staff_users.id — it stores the driver's @handle (see the
 * delivery_accept handler in routes/telegram.ts). `staff_users.telegram_username`
 * is the matching column, so delivery rows are joined through it. A driver
 * with no telegram_username on their staff row therefore contributes no
 * delivery numbers; the roster still lists them so the admin can see the gap
 * and fix the staff record.
 */

import { Router, Request, Response } from "express";
import pool             from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();

// ── Team definitions ────────────────────────────────────────────────────────
//
// `key` is the stable identifier the frontend switches on. `label` and
// `icon` are display-only and travel with the payload so the panel does not
// have to hardcode a second copy of this table.
const TEAMS = [
  { key: "call_center", label: "Call Centre",     icon: "headset_mic",  roles: ["call_center"] },
  { key: "delivery",    label: "Delivery",        icon: "local_shipping", roles: ["delivery"] },
  { key: "employee",    label: "Staff / Employee", icon: "badge",        roles: ["employee"] },
] as const;

type TeamKey = (typeof TEAMS)[number]["key"] | "all";

// The roles that make up each team, flattened for the roster query.
const TEAM_ROLES: string[] = TEAMS.flatMap((t) => [...t.roles]);

// ── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id:                string;
  name:              string;
  username:          string;
  role:              string;
  team:              TeamKey;
  active:            boolean;
  telegram_username: string | null;

  calls_logged:    number;
  orders_placed:   number;
  orders_assigned: number;
  delivered:       number;
  cancelled:       number;
  pending:         number;
  rejected:        number;
  revenue:         number;

  delivery_rate:   number;
  conversion_rate: number;
  acceptance_rate: number;
  on_time_rate:    number;
}

interface TeamSummary {
  key:              TeamKey;
  label:            string;
  icon:             string;
  headcount:        number;
  active_headcount: number;
  metrics: {
    calls_logged:    number;
    orders_placed:   number;
    orders_assigned: number;
    delivered:       number;
    cancelled:       number;
    pending:         number;
    rejected:        number;
    revenue:         number;
    delivery_rate:   number;
    conversion_rate: number;
    acceptance_rate: number;
    on_time_rate:    number;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

/**
 * Builds the ?from/?to window.
 *
 * Both bounds are inclusive and cover whole days. The default window is the
 * current calendar month, which matches what the dashboard's TimeRangeSelector
 * opens on.
 */
function resolveWindow(query: Record<string, string | undefined>): {
  from: string; to: string; params: unknown[];
} {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const isoDay = (d: Date): string => {
    // toISOString().split("T")[0] is `string | undefined` under noUncheckedIndexedAccess.
    const day = d.toISOString().split("T")[0];
    return day ?? d.toISOString().slice(0, 10);
  };

  const to   = query.to   ?? isoDay(last);
  const from = query.from ?? isoDay(first);

  return {
    from,
    to,
    // Start of `from` 00:00:00 through end of `to` 23:59:59.
    params: [`${from} 00:00:00`, `${to} 23:59:59`],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/performance/teams
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/teams",
  authenticate,
  // Roles only. This is the owner's view of every employee, including
  // revenue and cancellation rates — the same class of data as the financial
  // reports, so it is gated the same way.
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const { from, to, params } = resolveWindow(req.query as Record<string, string | undefined>);

      // ── 1. Roster ────────────────────────────────────────────────────────
      // Every non-deleted member of the three tracked teams. Left-joined to
      // the aggregates below so a member with no activity still appears —
      // "zero orders" is itself a performance signal.
      const [rosterRows] = await pool.query(
        `SELECT id, full_name, username, role, active, telegram_username
         FROM staff_users
         WHERE role IN (?)
           AND deleted_at IS NULL`,
        [TEAM_ROLES]
      ) as [any[], any];

      // ── 2. Sales aggregates (call centre + employees) ────────────────────
      const [salesRows] = await pool.query(
        `SELECT o.created_by_staff_id AS staff_id,
                COUNT(*)                                                        AS total_orders,
                COALESCE(SUM(o.status = 'Delivered'), 0)                        AS delivered,
                COALESCE(SUM(o.status IN ('Cancelled','CANCELLED')), 0)          AS cancelled,
                COALESCE(SUM(o.status NOT IN ('Delivered','Cancelled','CANCELLED')), 0) AS pending,
                COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED')
                                  THEN o.total ELSE 0 END), 0)                  AS revenue
         FROM orders o
         WHERE o.created_by_staff_id IS NOT NULL
           AND o.deleted_at IS NULL
           AND o.created_at BETWEEN ? AND ?
         GROUP BY o.created_by_staff_id`,
        params
      ) as [any[], any];

      // ── 3. Call log counts (call centre) ─────────────────────────────────
      // The call_logs table arrived with the call_center role. If a database
      // has not had 034_call_center.sql applied yet this table is absent, and
      // the query would take the whole endpoint down with it. A missing table
      // means "no calls logged", which is the correct answer for a database
      // that has never had the feature.
      let callRows: any[] = [];
      try {
        const [rows] = await pool.query(
          `SELECT staff_id, COUNT(*) AS call_count
           FROM call_logs
           WHERE logged_at BETWEEN ? AND ?
           GROUP BY staff_id`,
          params
        ) as [any[], any];
        callRows = rows;
      } catch {
        log.warn("call_logs unavailable — call metrics reported as zero");
      }

      // ── 4. Delivery aggregates ───────────────────────────────────────────
      // Joined through telegram_username because assigned_to holds the
      // driver's Telegram handle, not their staff id.
      //
      // `dh` is the delivery timestamp taken from the status history — the
      // moment the order actually flipped to Delivered. orders.updated_at is
      // not usable here: it is bumped by later edits (notes, item changes),
      // so it would silently rewrite history and wreck the on-time rate.
      const [deliveryRows] = await pool.query(
        `SELECT su.id AS staff_id,
                COUNT(o.id)                                                    AS total_assigned,
                COALESCE(SUM(o.status = 'Delivered'), 0)                       AS delivered,
                COALESCE(SUM(o.status IN ('Cancelled','CANCELLED')), 0)         AS cancelled,
                COALESCE(SUM(o.status NOT IN ('Delivered','Cancelled','CANCELLED')), 0) AS pending,
                COALESCE(SUM(CASE WHEN o.status NOT IN ('Cancelled','CANCELLED')
                                  THEN o.total ELSE 0 END), 0)                 AS revenue,
                COALESCE(SUM(CASE WHEN o.status = 'Delivered'
                                   AND dh.delivered_at IS NOT NULL
                                   AND o.delivery_date IS NOT NULL
                                  THEN 1 ELSE 0 END), 0)                       AS with_promised_date,
                COALESCE(SUM(CASE WHEN o.status = 'Delivered'
                                   AND dh.delivered_at IS NOT NULL
                                   AND o.delivery_date IS NOT NULL
                                   AND DATE(dh.delivered_at) <= o.delivery_date
                                  THEN 1 ELSE 0 END), 0)                       AS on_time
         FROM staff_users su
         LEFT JOIN orders o
                ON o.assigned_to = su.telegram_username
               AND o.deleted_at IS NULL
               AND o.created_at BETWEEN ? AND ?
         LEFT JOIN (
                SELECT order_id, MIN(created_at) AS delivered_at
                FROM order_status_history
                WHERE new_status = 'Delivered'
                GROUP BY order_id
         ) dh ON dh.order_id = o.id
         WHERE su.role = 'delivery'
           AND su.deleted_at IS NULL
           AND su.telegram_username IS NOT NULL
         GROUP BY su.id`,
        params
      ) as [any[], any];

      // ── 5. Delivery rejections ───────────────────────────────────────────
      let rejectionRows: any[] = [];
      try {
        const [rows] = await pool.query(
          `SELECT driver_username, COUNT(*) AS rejected
           FROM delivery_rejections
           WHERE rejected_at BETWEEN ? AND ?
           GROUP BY driver_username`,
          params
        ) as [any[], any];
        rejectionRows = rows;
      } catch {
        log.warn("delivery_rejections unavailable — rejection metrics reported as zero");
      }

      // ── 6. Merge into one row per person ─────────────────────────────────
      const salesById    = new Map(salesRows.map((r: any) => [r.staff_id, r]));
      const callsById    = new Map(callRows.map((r: any) => [r.staff_id, r]));
      const deliveryById = new Map(deliveryRows.map((r: any) => [r.staff_id, r]));
      const rejectsByUser = new Map(rejectionRows.map((r: any) => [r.driver_username, r]));

      const members: Member[] = rosterRows.map((s: any) => {
        const sales    = salesById.get(s.id);
        const calls    = callsById.get(s.id);
        const delivery = deliveryById.get(s.id);
        const rejects  = s.telegram_username ? rejectsByUser.get(s.telegram_username) : undefined;

        const callsLogged    = num(calls?.call_count);
        const ordersPlaced   = num(sales?.total_orders);
        const ordersAssigned = num(delivery?.total_assigned);
        const delivered      = num(delivery?.delivered) + num(sales?.delivered);
        const cancelled      = num(delivery?.cancelled) + num(sales?.cancelled);
        const pending        = num(delivery?.pending) + num(sales?.pending);
        const revenue        = num(delivery?.revenue) + num(sales?.revenue);
        const rejected       = num(rejects?.rejected);

        // The denominator differs by team: a driver is measured on what they
        // were handed, everyone else on what they sold.
        const workload = s.role === "delivery" ? ordersAssigned : ordersPlaced;

        return {
          id:                s.id,
          name:              s.full_name,
          username:          s.username,
          role:              s.role,
          team:              (TEAMS.find((t) => (t.roles as readonly string[]).includes(s.role))?.key
                              ?? "employee") as TeamKey,
          active:            Boolean(s.active),
          telegram_username: s.telegram_username ?? null,

          calls_logged:    callsLogged,
          orders_placed:   ordersPlaced,
          orders_assigned: ordersAssigned,
          delivered,
          cancelled,
          pending,
          rejected,
          revenue,

          delivery_rate:   pct(delivered, workload),
          conversion_rate: pct(ordersPlaced, callsLogged),
          acceptance_rate: pct(ordersAssigned, ordersAssigned + rejected),
          on_time_rate:    pct(num(delivery?.on_time), num(delivery?.with_promised_date)),
        };
      });

      // ── 7. Team summaries ─────────────────────────────────────────────────
      //
      // Rates are recomputed from the team's totals, never averaged from the
      // per-member rates. Averaging percentages weights a driver with one
      // order the same as one with fifty, which is how a leaderboard ends up
      // disagreeing with the row it is summarising.
      const summarise = (key: TeamKey, label: string, icon: string, rows: Member[]): TeamSummary => {
        const sum = (pick: (m: Member) => number) => rows.reduce((acc, m) => acc + pick(m), 0);

        const callsLogged    = sum((m) => m.calls_logged);
        const ordersPlaced   = sum((m) => m.orders_placed);
        const ordersAssigned = sum((m) => m.orders_assigned);
        const delivered      = sum((m) => m.delivered);
        const cancelled      = sum((m) => m.cancelled);
        const pending        = sum((m) => m.pending);
        const rejected       = sum((m) => m.rejected);
        const revenue        = sum((m) => m.revenue);

        // A team's workload is everything it was responsible for: what it sold
        // plus what it was handed to deliver.
        const workload = ordersPlaced + ordersAssigned;

        return {
          key,
          label,
          icon,
          headcount:        rows.length,
          active_headcount: rows.filter((m) => m.active).length,
          metrics: {
            calls_logged:    callsLogged,
            orders_placed:   ordersPlaced,
            orders_assigned: ordersAssigned,
            delivered,
            cancelled,
            pending,
            rejected,
            revenue,
            delivery_rate:   pct(delivered, workload),
            conversion_rate: pct(ordersPlaced, callsLogged),
            acceptance_rate: pct(ordersAssigned, ordersAssigned + rejected),
            on_time_rate:    rows.length
              ? Number((rows.reduce((a, m) => a + m.on_time_rate, 0) / rows.length).toFixed(1))
              : 0,
          },
        };
      };

      const teams: TeamSummary[] = TEAMS.map((t) =>
        summarise(t.key, t.label, t.icon, members.filter((m) => m.team === t.key))
      );

      // "All" is every member of the three teams in a single list. Members are
      // not duplicated across teams, so summing the three summaries here would
      // count the same person once per team they appear in — the roster is
      // partitioned by role, so each person belongs to exactly one.
      const allSummary = summarise(
        "all",
        "All Teams",
        "groups",
        members
      );

      // ── 8. Response ───────────────────────────────────────────────────────
      const membersByTeam: Record<string, Member[]> = {
        call_center: members.filter((m) => m.team === "call_center"),
        delivery:    members.filter((m) => m.team === "delivery"),
        employee:    members.filter((m) => m.team === "employee"),
        all:         members,
      };

      log.info("Team performance loaded", { from, to, members: members.length });
      res.json({
        success: true,
        data: {
          range: { from, to },
          teams,
          all: allSummary,
          members: membersByTeam,
        },
      });
    } catch (err) {
      log.error("Failed to build team performance report", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
