/**
 * src/routes/performance.ts
 * Asella Organic — Team Performance Aggregations (Admin / Manager)
 *
 * GET /api/performance/teams?from&to
 *
 * One endpoint that rolls every internal team up into a comparable shape so
 * the admin can watch the whole organisation from a single side panel:
 *
 *   call_center — calls received (call_center_daily_reports) + orders placed (created_by_staff_id)
 *   delivery    — orders accepted (delivery_assignments) + rejections
 *   employee    — orders placed (created_by_staff_id)
 *   all         — every member of the three teams above, in one list
 *
 * ── Why the three teams are sourced differently ─────────────────────────────
 *
 * Sales work is attributed by staff id. `orders.created_by_staff_id` is a real
 * foreign key set by whoever submitted the order, so the join is trivial.
 *
 * Delivery work is not. It is attributed by Telegram handle:
 * `delivery_assignments.driver_username` holds the driver's @handle, written
 * by the delivery bot, which has no knowledge of staff_users.id. The matching
 * column is `staff_users.telegram_username`.
 *
 * Two consequences that shaped this file:
 *
 * 1. The delivery team is NOT `staff_users.role = 'delivery'`. That role has
 *    only a couple of rows while eight distinct handles actually accept
 *    deliveries — several of them are admins and employees who also drive.
 *    The roster is therefore built from the drivers who actually appear in
 *    delivery_assignments, with staff rows linked in where they exist. A
 *    driver with no staff record still shows up, flagged as unlinked, because
 *    silently dropping them would hide a driver the admin cannot manage.
 *
 * 2. `delivery_assignments.delivered_at` is never written by any code path, so
 *    it is NULL for every row. The delivery timestamp is taken from
 *    order_status_history instead — the moment the order actually flipped to
 *    Delivered. `orders.updated_at` is not a substitute: it is bumped by later
 *    edits (notes, item changes) and would silently rewrite delivery history.
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
  { key: "call_center", label: "Call Centre",       icon: "headset_mic",    roles: ["call_center"] },
  { key: "delivery",    label: "Delivery",          icon: "local_shipping", roles: ["delivery", "driver"] },
  { key: "employee",    label: "Staff / Substore",  icon: "badge",          roles: ["employee", "store_manager"] },
] as const;

type TeamKey = (typeof TEAMS)[number]["key"] | "all";

// The roles that make up the sales teams, flattened for the roster query.
const SALES_ROLES: string[] = TEAMS.flatMap((t) => [...t.roles]).filter((r) => r !== "delivery");

// ── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id:                string;
  name:              string;
  username:          string;
  role:              string;
  team:              TeamKey;
  active:            boolean;
  telegram_username: string | null;
  /** True when a driver accepts deliveries but has no staff account. */
  unlinked:          boolean;

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
  from: string; to: string; params: unknown[]; dateRange: [string, string];
} {
  if (query.range === "all" || query.from === "all" || (!query.from && !query.to)) {
    return {
      from: "All Time",
      to: "",
      params: ["1970-01-01 00:00:00", "2099-12-31 23:59:59"],
      dateRange: ["1970-01-01", "2099-12-31"],
    };
  }

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const formatLocalYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const to   = query.to   ?? formatLocalYMD(last);
  const from = query.from ?? formatLocalYMD(first);

  return {
    from,
    to,
    // Start of `from` 00:00:00 through end of `to` 23:59:59.
    params: [`${from} 00:00:00`, `${to} 23:59:59`],
    dateRange: [from, to],
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
      const { from, to, params, dateRange } = resolveWindow(req.query as Record<string, string | undefined>);

      // ── 1. Sales roster ──────────────────────────────────────────────────
      // Every non-deleted call centre agent and employee. Left-joined to the
      // aggregates below so a member with no activity still appears — "zero
      // orders" is itself a performance signal.
      const [salesRoster] = await pool.query(
        `SELECT id, full_name, username, role, active, telegram_username
         FROM staff_users
         WHERE role IN (?)
           AND deleted_at IS NULL`,
        [SALES_ROLES]
      ) as [any[], any];

      // ── 2. Driver roster ─────────────────────────────────────────────────
      // Distinct handles that accepted a delivery inside the window, linked
      // to a staff record where possible.
      //
      // The staff link is matched on telegram_username first because that is
      // what the bot writes. The username fallback catches staff whose login
      // name happens to equal their Telegram handle.
      //
      // A driver with no staff record is kept, with unlinked = true, so the
      // owner can see that a working driver has no account to manage.
      const [driverRoster] = await pool.query(
        `SELECT DISTINCT
                COALESCE(da.driver_username, su.telegram_username, su.username) AS driver_username,
                su.id             AS staff_id,
                COALESCE(su.full_name, da.driver_username) AS full_name,
                su.username       AS staff_username,
                COALESCE(su.role, 'delivery') AS role,
                COALESCE(su.active, 1) AS active,
                su.telegram_username
         FROM (
                SELECT DISTINCT driver_username
                FROM delivery_assignments
                WHERE claimed_at BETWEEN ? AND ?
         ) da
         LEFT JOIN staff_users su
                ON su.deleted_at IS NULL
               AND ((su.telegram_username IS NOT NULL AND LOWER(su.telegram_username) = LOWER(da.driver_username))
                    OR su.username = da.driver_username)
         WHERE (su.role IS NULL OR su.role NOT IN ('admin', 'manager'))
           AND LOWER(da.driver_username) NOT IN ('aga_na', 'yona64', 'asella_organic_support')

         UNION

         SELECT DISTINCT
                COALESCE(su.telegram_username, su.username) AS driver_username,
                su.id             AS staff_id,
                su.full_name      AS full_name,
                su.username       AS staff_username,
                su.role           AS role,
                su.active         AS active,
                su.telegram_username
         FROM staff_users su
         WHERE su.role IN ('delivery', 'driver')
           AND su.deleted_at IS NULL`,
        params
      ) as [any[], any];

      // ── 3. Sales aggregates (call centre + employees) ────────────────────
      const [salesRows] = await pool.query(
        `SELECT sub.staff_id,
                COUNT(*)                                                                AS total_orders,
                COALESCE(SUM(sub.status = 'Delivered'), 0)                              AS delivered,
                COALESCE(SUM(sub.status IN ('Cancelled','CANCELLED')), 0)                AS cancelled,
                COALESCE(SUM(sub.status NOT IN ('Delivered','Cancelled','CANCELLED')), 0) AS pending,
                COALESCE(SUM(CASE WHEN sub.status NOT IN ('Cancelled','CANCELLED')
                                  THEN sub.total ELSE 0 END), 0)                        AS revenue
         FROM (
           SELECT DISTINCT su.id AS staff_id, o.id AS order_id, o.status, o.total
           FROM staff_users su
           JOIN orders o ON o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND (
               o.created_by_staff_id = su.id
               OR o.assigned_to LIKE CONCAT('%', su.username, '%')
               OR (su.telegram_username IS NOT NULL AND su.telegram_username != '' AND o.assigned_to LIKE CONCAT('%', su.telegram_username, '%'))
               OR EXISTS (
                 SELECT 1 FROM order_status_history osh
                 WHERE osh.order_id = o.id
                   AND (
                     osh.changed_by = su.username
                     OR (su.telegram_username IS NOT NULL AND su.telegram_username != '' AND LOWER(osh.changed_by) = LOWER(su.telegram_username))
                   )
               )
             )
           WHERE su.role IN (?)
             AND su.deleted_at IS NULL
         ) sub
         GROUP BY sub.staff_id`,
        [params[0], params[1], SALES_ROLES]
      ) as [any[], any];

      // ── 4. Daily call report counts (call centre) ────────────────────────
      // Calls are submitted once per day through the Reporting Channel, not
      // logged one-by-one. If a database has not had the daily-report table
      // applied yet the endpoint still works and reports zero calls.
      let callRows: any[] = [];
      try {
        const [rows] = await pool.query(
          `SELECT staff_id, COALESCE(SUM(calls_received), 0) AS call_count
           FROM call_center_daily_reports
           WHERE report_date BETWEEN ? AND ?
           GROUP BY staff_id`,
          dateRange
        ) as [any[], any];
        callRows = rows;
      } catch {
        log.warn("call_center_daily_reports unavailable — call metrics reported as zero");
      }

      // ── 5. Delivery aggregates ───────────────────────────────────────────
      // Filtered on claimed_at — when the driver took the job — rather than
      // the order's created_at, so the window measures delivery work done in
      // that period and not orders that happened to be placed then.
      const [deliveryRows] = await pool.query(
        `SELECT sub.driver_key,
                COUNT(*)                                                                AS total_assigned,
                COALESCE(SUM(sub.status = 'Delivered'), 0)                              AS delivered,
                COALESCE(SUM(sub.status IN ('Cancelled','CANCELLED')), 0)                AS cancelled,
                COALESCE(SUM(sub.status NOT IN ('Delivered','Cancelled','CANCELLED')), 0) AS pending,
                COALESCE(SUM(CASE WHEN sub.status NOT IN ('Cancelled','CANCELLED')
                                  THEN sub.total ELSE 0 END), 0)                        AS revenue,
                COALESCE(SUM(CASE WHEN sub.status = 'Delivered'
                                   AND sub.delivered_at IS NOT NULL
                                   AND sub.delivery_date IS NOT NULL
                                  THEN 1 ELSE 0 END), 0)                                AS with_promised_date,
                COALESCE(SUM(CASE WHEN sub.status = 'Delivered'
                                   AND sub.delivered_at IS NOT NULL
                                   AND sub.delivery_date IS NOT NULL
                                   AND DATE(sub.delivered_at) <= sub.delivery_date
                                  THEN 1 ELSE 0 END), 0)                                AS on_time
         FROM (
           SELECT
             da.driver_username AS driver_key,
             o.id AS order_id,
             o.status,
             o.total,
             o.delivery_date,
             dh.delivered_at
           FROM delivery_assignments da
           JOIN orders o ON o.id = da.order_id AND o.deleted_at IS NULL
           LEFT JOIN (
             SELECT order_id, MIN(created_at) AS delivered_at
             FROM order_status_history
             WHERE new_status = 'Delivered'
             GROUP BY order_id
           ) dh ON dh.order_id = o.id
           WHERE da.claimed_at BETWEEN ? AND ?

           UNION

           SELECT
             COALESCE(su.telegram_username, su.username) AS driver_key,
             o.id AS order_id,
             o.status,
             o.total,
             o.delivery_date,
             dh.delivered_at
           FROM staff_users su
           JOIN orders o ON o.deleted_at IS NULL
             AND (
               o.created_at BETWEEN ? AND ?
               OR (o.delivery_date IS NOT NULL AND o.delivery_date BETWEEN DATE(?) AND DATE(?))
               OR EXISTS (
                 SELECT 1 FROM order_status_history osh_win
                 WHERE osh_win.order_id = o.id
                   AND osh_win.created_at BETWEEN ? AND ?
               )
             )
             AND (
               o.assigned_to LIKE CONCAT('%', su.username, '%')
               OR (su.telegram_username IS NOT NULL AND su.telegram_username != '' AND o.assigned_to LIKE CONCAT('%', su.telegram_username, '%'))
               OR EXISTS (
                 SELECT 1 FROM order_status_history osh
                 WHERE osh.order_id = o.id
                   AND (
                     osh.changed_by = su.username
                     OR (su.telegram_username IS NOT NULL AND su.telegram_username != '' AND LOWER(osh.changed_by) = LOWER(su.telegram_username))
                   )
                   AND osh.created_at BETWEEN ? AND ?
               )
             )
           LEFT JOIN (
             SELECT order_id, MIN(created_at) AS delivered_at
             FROM order_status_history
             WHERE new_status = 'Delivered'
             GROUP BY order_id
           ) dh ON dh.order_id = o.id
           WHERE su.role IN ('delivery', 'driver')
             AND su.deleted_at IS NULL
         ) sub
         GROUP BY sub.driver_key`,
        [
          params[0], params[1],
          params[0], params[1],
          params[0], params[1],
          params[0], params[1],
          params[0], params[1],
        ]
      ) as [any[], any];

      // ── 6. Delivery rejections ───────────────────────────────────────────
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

      // ── 7. Merge into one row per person ─────────────────────────────────
      const salesById     = new Map(salesRows.map((r: any) => [r.staff_id, r]));
      const callsById     = new Map(callRows.map((r: any) => [r.staff_id, r]));
      const deliveryByUser = new Map(deliveryRows.map((r: any) => [String(r.driver_key).toLowerCase(), r]));
      const rejectsByUser  = new Map(rejectionRows.map((r: any) => [String(r.driver_username).toLowerCase(), r]));
      
      // ── 7a. Sales members ────────────────────────────────────────────────
      const members: Member[] = salesRoster.map((s: any) => {
        const sales = salesById.get(s.id);
        const calls = callsById.get(s.id);

        const callsLogged  = num(calls?.call_count);
        const ordersPlaced = num(sales?.total_orders);
        const delivered    = num(sales?.delivered);
        const cancelled    = num(sales?.cancelled);
        const pending      = num(sales?.pending);
        const revenue      = num(sales?.revenue);

        return {
          id:                s.id,
          name:              s.full_name,
          username:          s.username,
          role:              s.role,
          team:              (TEAMS.find((t) => (t.roles as readonly string[]).includes(s.role))?.key
                              ?? "employee") as TeamKey,
          active:            Boolean(s.active),
          telegram_username: s.telegram_username ?? null,
          unlinked:          false,

          calls_logged:    callsLogged,
          orders_placed:   ordersPlaced,
          orders_assigned: 0,
          delivered,
          cancelled,
          pending,
          rejected:         0,
          revenue,

          delivery_rate:   pct(delivered, ordersPlaced),
          conversion_rate: pct(ordersPlaced, callsLogged),
          acceptance_rate: 0,
          on_time_rate:    0,
        };
      });

      // ── 7b. Delivery members ─────────────────────────────────────────────
      // One row per driver handle. When the handle maps to a staff record the
      // staff identity is used, so the panel shows a real name; otherwise the
      // handle stands in and the row is flagged unlinked.
      for (const d of driverRoster) {
        if (d.role === "admin" || d.role === "manager") continue;
        const handle     = (d.driver_username ?? d.staff_username ?? "") as string;
        if (!handle || ["aga_na", "yona64", "asella_organic_support"].includes(handle.toLowerCase())) continue;
        const delivery   =
          deliveryByUser.get(handle.toLowerCase())
          || (d.staff_username ? deliveryByUser.get(String(d.staff_username).toLowerCase()) : null)
          || (d.telegram_username ? deliveryByUser.get(String(d.telegram_username).toLowerCase()) : null);
        const rejects    =
          rejectsByUser.get(handle.toLowerCase())
          || (d.staff_username ? rejectsByUser.get(String(d.staff_username).toLowerCase()) : null)
          || (d.telegram_username ? rejectsByUser.get(String(d.telegram_username).toLowerCase()) : null);

        const assigned   = num(delivery?.total_assigned);
        const delivered  = num(delivery?.delivered);
        const cancelled  = num(delivery?.cancelled);
        const pending    = num(delivery?.pending);
        const revenue    = num(delivery?.revenue);
        const rejected   = num(rejects?.rejected);

        members.push({
          // A driver with no staff record still needs a stable React key and
          // a distinguishable identity, so the handle is namespaced.
          id:                d.staff_id ?? `driver:${handle}`,
          name:              d.full_name ?? `@${handle}`,
          username:          d.staff_username ?? handle,
          role:              d.role || "delivery",
          team:              "delivery",
          active:            d.active === null || d.active === undefined ? true : Boolean(d.active),
          telegram_username: handle,
          unlinked:          !d.staff_id,

          calls_logged:    0,
          orders_placed:   0,
          orders_assigned: assigned,
          delivered,
          cancelled,
          pending,
          rejected,
          revenue,

          delivery_rate:   pct(delivered, assigned),
          conversion_rate: 0,
          acceptance_rate: pct(assigned, assigned + rejected),
          on_time_rate:    pct(num(delivery?.on_time), num(delivery?.with_promised_date)),
        });
      }

      // ── 7c. Delivery staff with no jobs in the window ────────────────────
      // A driver account that took no deliveries this period is still on the
      // payroll and still needs to be visible — otherwise the team list
      // silently shrinks when someone is off.
      const [allDeliveryStaff] = await pool.query(
        `SELECT id, full_name, username, role, active, telegram_username
         FROM staff_users
         WHERE role = 'delivery'
           AND deleted_at IS NULL`
      ) as [any[], any];

      for (const s of allDeliveryStaff ?? []) {
        // Skip anyone already added — a linked driver who did take jobs this
        // period was added in 7b with their real numbers.
        if (members.some((m) => m.id === s.id)) continue;

        members.push({
          id:                s.id,
          name:              s.full_name,
          username:          s.username,
          role:              s.role,
          team:              "delivery",
          active:            Boolean(s.active),
          telegram_username: s.telegram_username ?? null,
          unlinked:          false,

          calls_logged:    0,
          orders_placed:   0,
          orders_assigned: 0,
          delivered:       0,
          cancelled:       0,
          pending:         0,
          rejected:         0,
          revenue:         0,

          delivery_rate:   0,
          conversion_rate: 0,
          acceptance_rate: 0,
          on_time_rate:    0,
        });
      }

      // ── 8. "All" view: one row per person ─────────────────────────────────
      //
      // A person can appear twice in `members`: once as a sales agent and
      // once as a driver. That is correct for the per-team tabs, where each
      // row answers "what did this team get from this person", but it would
      // double-count them in the combined list. Collapse by staff id and sum
      // the work so a hybrid employee is one person with one total.
      const byPerson = new Map<string, Member>();
      for (const m of members) {
        const existing = byPerson.get(m.id);
        if (!existing) {
          byPerson.set(m.id, { ...m });
          continue;
        }

        existing.calls_logged    += m.calls_logged;
        existing.orders_placed   += m.orders_placed;
        existing.orders_assigned += m.orders_assigned;
        existing.delivered       += m.delivered;
        existing.cancelled       += m.cancelled;
        existing.pending         += m.pending;
        existing.rejected        += m.rejected;
        existing.revenue         += m.revenue;

        // Recompute the rates from the merged totals. Averaging the two
        // rows' percentages would over-weight whichever job has fewer units.
        const workload = existing.orders_placed + existing.orders_assigned;
        existing.delivery_rate   = pct(existing.delivered, workload);
        existing.conversion_rate = pct(existing.orders_placed, existing.calls_logged);
        existing.acceptance_rate = pct(existing.orders_assigned,
                                        existing.orders_assigned + existing.rejected);

        // On-time rate only exists on the delivery side, so keep it rather
        // than blending it with the sales row's structural zero.
        if (m.team === "delivery" && m.on_time_rate > 0) {
          existing.on_time_rate = m.on_time_rate;
        }
      }
      const allMembers = [...byPerson.values()];

      // ── 9. Team summaries ─────────────────────────────────────────────────
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

      // "All" is every person in the three teams, once each. `membersByTeam`
      // keeps the uncollapsed per-team rows below — the collapse above is
      // only for this combined view and its totals.
      const allSummary = summarise("all", "All Teams", "groups", allMembers);

      // ── 10. Response ──────────────────────────────────────────────────────
      const membersByTeam: Record<string, Member[]> = {
        call_center: members.filter((m) => m.team === "call_center"),
        delivery:    members.filter((m) => m.team === "delivery"),
        employee:    members.filter((m) => m.team === "employee"),
        all:         allMembers,
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


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/performance/me — Role-specific non-monetary operational KPIs
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/me",
  authenticate,
  authorise("admin", "manager", "employee", "store_manager", "call_center", "delivery", "driver", "staff"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    try {
      const user = req.user!;
      const role = (user.role || "").toLowerCase();
      const staffId = user.id;
      const { from, to, params, dateRange } = resolveWindow(req.query as Record<string, string | undefined>);

      // Fetch user profile details
      const [uRows] = (await pool.query(
        `SELECT id, full_name, username, role, location, telegram_username
         FROM staff_users WHERE id = ? LIMIT 1`,
        [staffId]
      )) as [any[], any];

      const profile = uRows[0] || {
        id: staffId,
        full_name: (user as any).name || (user as any).username || "Staff Member",
        role,
        username: (user as any).username || "",
        location: (user as any).location || "",
        telegram_username: (user as any).telegram_username || null,
      };

      const telegramUsername = profile.telegram_username?.trim() || "";
      const username = profile.username?.trim() || "";
      const fullName = profile.full_name?.trim() || "";
      const storeLoc = profile.location?.trim() || "";

      let data: Record<string, any> = {
        role,
        range: { from, to },
        user: {
          id: profile.id,
          name: profile.full_name,
          username: profile.username,
          location: profile.location,
          role: profile.role,
        },
      };

      // ── Lifetime Career Metrics (for career badges like Centurion) ────────
      let lifetimeTotal = 0;
      let lifetimeDelivered = 0;
      let lifetimeRegional = 0;

      try {
        const matchConds = [
          "o.created_by_staff_id = ?",
          "o.assigned_to LIKE CONCAT('%', ?, '%')",
          "EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id AND osh.changed_by = ?)"
        ];
        const matchVals: unknown[] = [staffId, username, username];

        if (telegramUsername) {
          matchConds.push("o.assigned_to LIKE CONCAT('%', ?, '%')");
          matchVals.push(telegramUsername);
        }
        if (fullName) {
          matchConds.push("o.assigned_to LIKE CONCAT('%', ?, '%')");
          matchVals.push(fullName);
        }

        const [lifeRows] = (await pool.query(
          `SELECT
             COUNT(*) AS total_orders,
             COALESCE(SUM(status = 'Delivered'), 0) AS delivered,
             COALESCE(SUM(city != 'Addis Ababa' AND city != 'Abroad'), 0) AS regional_orders
           FROM orders o
           WHERE o.deleted_at IS NULL AND (${matchConds.join(" OR ")})`,
          matchVals
        )) as [any[], any];

        lifetimeTotal = Number(lifeRows[0]?.total_orders || 0);
        lifetimeDelivered = Number(lifeRows[0]?.delivered || 0);
        lifetimeRegional = Number(lifeRows[0]?.regional_orders || 0);

        if (role === "admin" || role === "manager") {
          const [[allStats]] = (await pool.query(
            `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Delivered'), 0) AS delivered, COALESCE(SUM(city != 'Addis Ababa' AND city != 'Abroad'), 0) AS regional_orders FROM orders WHERE deleted_at IS NULL`
          )) as [any[], any];
          lifetimeTotal = Math.max(lifetimeTotal, Number(allStats?.total || 0));
          lifetimeDelivered = Math.max(lifetimeDelivered, Number(allStats?.delivered || 0));
          lifetimeRegional = Math.max(lifetimeRegional, Number(allStats?.regional_orders || 0));
        }
      } catch (err) {
        log.warn("Failed to fetch lifetime career stats", { error: String(err) });
      }

      data.lifetime = {
        total_orders: lifetimeTotal,
        delivered: lifetimeDelivered,
        regional_orders: lifetimeRegional,
        completion_rate: lifetimeTotal > 0 ? Number(((lifetimeDelivered / lifetimeTotal) * 100).toFixed(1)) : 100,
      };

      if (role === "delivery" || role === "driver") {
        // ── 1. DRIVER OPERATIONAL KPIS ──────────────────────────────────────
        const driverConds = [
          "(da.driver_username IS NOT NULL AND LOWER(da.driver_username) = LOWER(?))",
          "(o.assigned_to IS NOT NULL AND o.assigned_to LIKE CONCAT('%', ?, '%'))"
        ];
        const driverVals: unknown[] = [username, username];

        if (telegramUsername) {
          driverConds.push("(da.driver_username IS NOT NULL AND LOWER(da.driver_username) = LOWER(?))");
          driverVals.push(telegramUsername);
          driverConds.push("(o.assigned_to IS NOT NULL AND o.assigned_to LIKE CONCAT('%', ?, '%'))");
          driverVals.push(telegramUsername);
        }
        if (fullName) {
          driverConds.push("(o.assigned_to IS NOT NULL AND o.assigned_to LIKE CONCAT('%', ?, '%'))");
          driverVals.push(fullName);
        }

        const whereDriver = `(${driverConds.join(" OR ")})`;

        const [rows] = (await pool.query(
          `SELECT
             COUNT(*) AS total_assigned,
             COALESCE(SUM(o.status = 'Delivered'), 0) AS delivered,
             COALESCE(SUM(o.status IN ('Cancelled', 'CANCELLED')), 0) AS cancelled,
             COALESCE(SUM(o.status NOT IN ('Delivered', 'Cancelled', 'CANCELLED')), 0) AS in_transit,
             COALESCE(SUM(o.status IN ('Issue', 'Returned')), 0) AS issues,
             COALESCE(SUM(CASE WHEN o.status = 'Delivered' AND dh.delivered_at IS NOT NULL AND o.delivery_date IS NOT NULL AND DATE(dh.delivered_at) <= o.delivery_date THEN 1 ELSE 0 END), 0) AS on_time
           FROM orders o
           LEFT JOIN delivery_assignments da ON da.order_id = o.id
           LEFT JOIN (
             SELECT order_id, MIN(created_at) AS delivered_at
             FROM order_status_history
             WHERE new_status = 'Delivered'
             GROUP BY order_id
           ) dh ON dh.order_id = o.id
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND ${whereDriver}`,
          [params[0], params[1], ...driverVals]
        )) as [any[], any];

        const [trendRows] = (await pool.query(
          `SELECT DATE(o.created_at) AS date,
                  COUNT(*) AS assigned,
                  COALESCE(SUM(o.status = 'Delivered'), 0) AS delivered
           FROM orders o
           LEFT JOIN delivery_assignments da ON da.order_id = o.id
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND ${whereDriver}
           GROUP BY DATE(o.created_at)
           ORDER BY date ASC`,
          [params[0], params[1], ...driverVals]
        )) as [any[], any];

        const r = rows[0] || {};
        const totalAssigned = Number(r.total_assigned || 0);
        const delivered = Number(r.delivered || 0);
        const inTransit = Number(r.in_transit || 0);
        const issues = Number(r.issues || 0);
        const cancelled = Number(r.cancelled || 0);
        const onTime = Number(r.on_time || 0);
        const completionRate = totalAssigned > 0 ? Number(((delivered / totalAssigned) * 100).toFixed(1)) : 100;
        const firstAttemptRate = (delivered + issues) > 0 ? Number(((delivered / (delivered + issues)) * 100).toFixed(1)) : 100;
        const onTimeRate = delivered > 0 ? Number(((onTime / delivered) * 100).toFixed(1)) : 100;
        const cancellationRate = totalAssigned > 0 ? Number(((cancelled / totalAssigned) * 100).toFixed(1)) : 0;

        data.kpis = {
          total_assigned: totalAssigned,
          delivered,
          in_transit: inTransit,
          issues,
          cancelled,
          on_time: onTime,
          completion_rate: completionRate,
          first_attempt_rate: firstAttemptRate,
          on_time_rate: onTimeRate,
          cancellation_rate: cancellationRate,
          trend: trendRows.map((t: any) => ({
            date: String(t.date).slice(0, 10),
            assigned: Number(t.assigned || 0),
            delivered: Number(t.delivered || 0),
          })),
        };
      } else if (role === "store_manager") {
        // ── 2. SUBSTORE MANAGER OPERATIONAL KPIS ────────────────────────────
        const storeConds = [
          "o.created_by_staff_id = ?",
          "LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%'",
          "EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id AND (osh.changed_by = ? OR osh.changed_by = ?))"
        ];
        const storeVals: unknown[] = [staffId, username, staffId];
        if (storeLoc) {
          storeConds.push("(o.location LIKE CONCAT('%', ?, '%') OR o.city LIKE CONCAT('%', ?, '%'))");
          storeVals.push(storeLoc, storeLoc);
        }

        const [rows] = (await pool.query(
          `SELECT
             COUNT(*) AS total_handled,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%'), 0) AS total_pickups,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%' AND o.status = 'Delivered'), 0) AS pickups_delivered,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%' AND o.status NOT IN ('Delivered', 'Cancelled', 'CANCELLED')), 0) AS pickups_pending,
             COALESCE(SUM(o.created_by_staff_id = ?), 0) AS self_orders,
             COALESCE(SUM(o.source = 'walk-in' OR o.order_type = 'walk-in'), 0) AS walkin_orders,
             COALESCE(SUM(o.status IN ('Issue', 'Returned')), 0) AS issues,
             COALESCE(SUM(o.status IN ('Cancelled', 'CANCELLED')), 0) AS cancelled
           FROM orders o
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND (${storeConds.join(" OR ")})`,
          [staffId, params[0], params[1], ...storeVals]
        )) as [any[], any];

        const [stockRows] = (await pool.query(
          `SELECT
             COUNT(*) AS low_stock_count,
             COALESCE(SUM(inventory_quantity = 0), 0) AS out_of_stock_count
           FROM products WHERE inventory_quantity <= low_stock_threshold AND active = TRUE`
        )) as [any[], any];

        const [stockReqRows] = (await pool.query(
          `SELECT
             COUNT(*) AS total_requests,
             COALESCE(SUM(status = 'pending'), 0) AS pending_requests,
             COALESCE(SUM(status = 'received'), 0) AS received_requests
           FROM stock_requests
           WHERE created_at BETWEEN ? AND ?
             AND (requested_by = ? OR requested_by = ? OR requested_by = ?)`,
          [params[0], params[1], staffId, username, fullName]
        )) as [any[], any];

        const [trendRows] = (await pool.query(
          `SELECT DATE(o.created_at) AS date,
                  COUNT(*) AS total,
                  COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%'), 0) AS pickups,
                  COALESCE(SUM(o.status = 'Delivered'), 0) AS completed
           FROM orders o
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND (${storeConds.join(" OR ")})
           GROUP BY DATE(o.created_at)
           ORDER BY date ASC`,
          [params[0], params[1], ...storeVals]
        )) as [any[], any];

        const r = rows[0] || {};
        const totalPickups = Number(r.total_pickups || 0);
        const pickupsDelivered = Number(r.pickups_delivered || 0);
        const pickupsPending = Number(r.pickups_pending || 0);
        const walkinOrders = Number(r.walkin_orders || 0);
        const totalHandled = Number(r.total_handled || 0);
        const issues = Number(r.issues || 0);
        const cancelled = Number(r.cancelled || 0);
        const pickupSuccessRate = totalPickups > 0 ? Number(((pickupsDelivered / totalPickups) * 100).toFixed(1)) : 100;
        const cancellationRate = totalHandled > 0 ? Number(((cancelled / totalHandled) * 100).toFixed(1)) : 0;

        data.kpis = {
          total_pickups: totalPickups,
          pickups_delivered: pickupsDelivered,
          pickups_pending: pickupsPending,
          walkin_orders: walkinOrders,
          total_handled: totalHandled,
          issues,
          cancelled,
          pickup_success_rate: pickupSuccessRate,
          cancellation_rate: cancellationRate,
          low_stock_count: Number(stockRows[0]?.low_stock_count || 0),
          out_of_stock_count: Number(stockRows[0]?.out_of_stock_count || 0),
          stock_requests_total: Number(stockReqRows[0]?.total_requests || 0),
          stock_requests_pending: Number(stockReqRows[0]?.pending_requests || 0),
          stock_requests_received: Number(stockReqRows[0]?.received_requests || 0),
          trend: trendRows.map((t: any) => ({
            date: String(t.date).slice(0, 10),
            total: Number(t.total || 0),
            pickups: Number(t.pickups || 0),
            completed: Number(t.completed || 0),
          })),
        };
      } else if (role === "call_center") {
        // ── 3. CALL CENTER AGENT OPERATIONAL KPIS ───────────────────────────
        const [rows] = (await pool.query(
          `SELECT
             COUNT(*) AS orders_booked,
             COALESCE(SUM(o.status = 'Delivered'), 0) AS delivered,
             COALESCE(SUM(o.status NOT IN ('Delivered', 'Cancelled', 'CANCELLED')), 0) AS pending,
             COALESCE(SUM(o.status IN ('Cancelled', 'CANCELLED')), 0) AS cancelled,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) = 'delivery'), 0) AS delivery_orders,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%'), 0) AS pickup_orders,
             COALESCE(SUM(o.city = 'Addis Ababa'), 0) AS addis_orders,
             COALESCE(SUM(o.city != 'Addis Ababa' AND o.city != 'Abroad'), 0) AS regional_orders
           FROM orders o
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND (
               o.created_by_staff_id = ?
               OR (o.source IN ('phone', 'call_center') AND (o.created_by_staff_id = ? OR o.created_by_staff_id IS NULL))
               OR EXISTS (
                 SELECT 1 FROM order_status_history osh
                 WHERE osh.order_id = o.id AND (osh.changed_by = ? OR osh.changed_by = ?)
               )
             )`,
          [params[0], params[1], staffId, staffId, username, staffId]
        )) as [any[], any];

        // Call metrics from daily reports
        const [repRows] = (await pool.query(
          `SELECT
             COUNT(*) AS count,
             COALESCE(SUM(calls_received), 0) AS total_calls_received,
             COALESCE(SUM(calls_ordered), 0) AS total_calls_ordered,
             COALESCE(SUM(calls_rejected), 0) AS total_calls_rejected,
             COALESCE(SUM(is_backdated = 0), 0) AS ontime_reports,
             COALESCE(SUM(is_backdated = 1), 0) AS backdated_reports
           FROM call_center_daily_reports
           WHERE staff_id = ? AND report_date BETWEEN ? AND ?`,
          [staffId, dateRange[0], dateRange[1]]
        )) as [any[], any];

        const [todayRows] = (await pool.query(
          `SELECT id, is_backdated, submitted_at FROM call_center_daily_reports WHERE staff_id = ? AND report_date = CURDATE() LIMIT 1`,
          [staffId]
        )) as [any[], any];

        const [trendRows] = (await pool.query(
          `SELECT DATE(o.created_at) AS date,
                  COUNT(*) AS orders_booked,
                  COALESCE(SUM(o.status = 'Delivered'), 0) AS delivered
           FROM orders o
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND (
               o.created_by_staff_id = ?
               OR (o.source IN ('phone', 'call_center') AND (o.created_by_staff_id = ? OR o.created_by_staff_id IS NULL))
             )
           GROUP BY DATE(o.created_at)
           ORDER BY date ASC`,
          [params[0], params[1], staffId, staffId]
        )) as [any[], any];

        const r = rows[0] || {};
        const rep = repRows[0] || {};
        const ordersBooked = Number(r.orders_booked || 0);
        const delivered = Number(r.delivered || 0);
        const pending = Number(r.pending || 0);
        const cancelled = Number(r.cancelled || 0);
        const deliveryOrders = Number(r.delivery_orders || 0);
        const pickupOrders = Number(r.pickup_orders || 0);
        const successRate = ordersBooked > 0 ? Number(((delivered / ordersBooked) * 100).toFixed(1)) : 100;
        const cancellationRate = ordersBooked > 0 ? Number(((cancelled / ordersBooked) * 100).toFixed(1)) : 0;

        const totalCallsReceived = Number(rep.total_calls_received || 0);
        const totalCallsOrdered = Number(rep.total_calls_ordered || 0);
        const totalCallsRejected = Number(rep.total_calls_rejected || 0);
        const reportsSubmitted = Number(rep.count || 0);
        const callConversionRate = totalCallsReceived > 0 ? Number(((totalCallsOrdered / totalCallsReceived) * 100).toFixed(1)) : 0;
        const callRejectionRate = totalCallsReceived > 0 ? Number(((totalCallsRejected / totalCallsReceived) * 100).toFixed(1)) : 0;
        const avgOrdersPerShift = reportsSubmitted > 0 ? Number((ordersBooked / reportsSubmitted).toFixed(1)) : ordersBooked;

        data.kpis = {
          orders_booked: ordersBooked,
          delivered,
          pending,
          cancelled,
          delivery_orders: deliveryOrders,
          pickup_orders: pickupOrders,
          addis_orders: Number(r.addis_orders || 0),
          regional_orders: Number(r.regional_orders || 0),
          success_rate: successRate,
          cancellation_rate: cancellationRate,
          reports_submitted: reportsSubmitted,
          ontime_reports: Number(rep.ontime_reports || 0),
          backdated_reports: Number(rep.backdated_reports || 0),
          total_calls_received: totalCallsReceived,
          total_calls_ordered: totalCallsOrdered,
          total_calls_rejected: totalCallsRejected,
          call_conversion_rate: callConversionRate,
          call_rejection_rate: callRejectionRate,
          avg_orders_per_shift: avgOrdersPerShift,
          today_report_submitted: Boolean(todayRows[0]),
          trend: trendRows.map((t: any) => ({
            date: String(t.date).slice(0, 10),
            orders_booked: Number(t.orders_booked || 0),
            delivered: Number(t.delivered || 0),
          })),
        };
      } else if (role === "employee" || role === "staff") {
        // ── 4. COUNTER STAFF / EMPLOYEE OPERATIONAL KPIS ────────────────────
        const staffConds = [
          "o.created_by_staff_id = ?",
          "o.assigned_to LIKE CONCAT('%', ?, '%')",
          "EXISTS (SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id AND osh.changed_by = ?)"
        ];
        const staffVals: unknown[] = [staffId, username, username];
        if (telegramUsername) {
          staffConds.push("o.assigned_to LIKE CONCAT('%', ?, '%')");
          staffVals.push(telegramUsername);
        }
        if (fullName) {
          staffConds.push("o.assigned_to LIKE CONCAT('%', ?, '%')");
          staffVals.push(fullName);
        }

        const whereStaff = `(${staffConds.join(" OR ")})`;

        const [rows] = (await pool.query(
          `SELECT
             COUNT(*) AS transactions,
             COALESCE(SUM(o.status = 'Delivered'), 0) AS delivered,
             COALESCE(SUM(o.status NOT IN ('Delivered', 'Cancelled', 'CANCELLED')), 0) AS pending,
             COALESCE(SUM(o.status IN ('Cancelled', 'CANCELLED')), 0) AS cancelled,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) LIKE '%pickup%'), 0) AS pickup_orders,
             COALESCE(SUM(LOWER(COALESCE(o.order_type, '')) = 'delivery'), 0) AS delivery_orders,
             COALESCE(SUM(o.customer_name IS NOT NULL AND o.customer_name != 'Walk-in Customer' AND o.phone IS NOT NULL AND o.phone NOT LIKE '%000 000%'), 0) AS captured_customers
           FROM orders o
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND ${whereStaff}`,
          [params[0], params[1], ...staffVals]
        )) as [any[], any];

        // Items volume handled
        const [itemsRows] = (await pool.query(
          `SELECT COALESCE(SUM(oi.quantity), 0) AS items_handled
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND ${whereStaff}`,
          [params[0], params[1], ...staffVals]
        )) as [any[], any];

        const [trendRows] = (await pool.query(
          `SELECT DATE(o.created_at) AS date,
                  COUNT(*) AS transactions,
                  COALESCE(SUM(o.status = 'Delivered'), 0) AS completed
           FROM orders o
           WHERE o.deleted_at IS NULL
             AND o.created_at BETWEEN ? AND ?
             AND ${whereStaff}
           GROUP BY DATE(o.created_at)
           ORDER BY date ASC`,
          [params[0], params[1], ...staffVals]
        )) as [any[], any];

        const r = rows[0] || {};
        const transactions = Number(r.transactions || 0);
        const delivered = Number(r.delivered || 0);
        const pending = Number(r.pending || 0);
        const cancelled = Number(r.cancelled || 0);
        const capturedCustomers = Number(r.captured_customers || 0);
        const captureRate = transactions > 0 ? Number(((capturedCustomers / transactions) * 100).toFixed(1)) : 100;
        const cancellationRate = transactions > 0 ? Number(((cancelled / transactions) * 100).toFixed(1)) : 0;
        const itemsHandled = Number(itemsRows[0]?.items_handled || 0);
        const avgItemsPerOrder = transactions > 0 ? Number((itemsHandled / transactions).toFixed(1)) : 0;

        data.kpis = {
          transactions,
          delivered,
          pending,
          cancelled,
          pickup_orders: Number(r.pickup_orders || 0),
          delivery_orders: Number(r.delivery_orders || 0),
          captured_customers: capturedCustomers,
          capture_rate: captureRate,
          cancellation_rate: cancellationRate,
          items_handled: itemsHandled,
          avg_items_per_order: avgItemsPerOrder,
          trend: trendRows.map((t: any) => ({
            date: String(t.date).slice(0, 10),
            transactions: Number(t.transactions || 0),
            completed: Number(t.completed || 0),
          })),
        };
      } else {
        // ── 5. MANAGER / ADMIN OPERATIONAL OVERVIEW ─────────────────────────
        const [pipelineRows] = (await pool.query(
          `SELECT
             COUNT(*) AS total_orders,
             COALESCE(SUM(status = 'Pending'), 0) AS pending,
             COALESCE(SUM(status = 'Confirmed'), 0) AS confirmed,
             COALESCE(SUM(status = 'In Transit'), 0) AS in_transit,
             COALESCE(SUM(status = 'Delivered'), 0) AS delivered,
             COALESCE(SUM(status IN ('Cancelled', 'CANCELLED')), 0) AS cancelled,
             COALESCE(SUM(status IN ('Issue', 'Returned')), 0) AS issues,
             COALESCE(SUM(LOWER(COALESCE(order_type, '')) = 'delivery'), 0) AS delivery_orders,
             COALESCE(SUM(LOWER(COALESCE(order_type, '')) LIKE '%pickup%'), 0) AS pickup_orders,
             COALESCE(SUM(source = 'website'), 0) AS channel_web,
             COALESCE(SUM(source = 'telegram' OR source = 'tma'), 0) AS channel_telegram,
             COALESCE(SUM(source = 'phone' OR source = 'call_center'), 0) AS channel_call_center,
             COALESCE(SUM(source = 'walk-in' OR source = 'pos'), 0) AS channel_pos
           FROM orders
           WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?`,
          params
        )) as [any[], any];

        const [bottlenecks] = (await pool.query(
          `SELECT
             COALESCE(SUM(status = 'Pending' AND created_at < NOW() - INTERVAL 2 HOUR), 0) AS stuck_pending,
             COALESCE(SUM(status = 'In Transit' AND created_at < NOW() - INTERVAL 24 HOUR), 0) AS stuck_transit
           FROM orders
           WHERE deleted_at IS NULL`
        )) as [any[], any];

        const [stockAlerts] = (await pool.query(
          `SELECT
             COUNT(*) AS low_stock_count,
             COALESCE(SUM(inventory_quantity = 0), 0) AS out_of_stock_count
           FROM products WHERE inventory_quantity <= low_stock_threshold AND active = TRUE`
        )) as [any[], any];

        const [activeStaff] = (await pool.query(
          `SELECT COUNT(DISTINCT created_by_staff_id) AS active_count
           FROM orders
           WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?`,
          params
        )) as [any[], any];

        const [trendRows] = (await pool.query(
          `SELECT DATE(created_at) AS date,
                  COUNT(*) AS total,
                  COALESCE(SUM(status = 'Delivered'), 0) AS delivered
           FROM orders
           WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ?
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          params
        )) as [any[], any];

        const r = pipelineRows[0] || {};
        const b = bottlenecks[0] || {};
        const totalOrders = Number(r.total_orders || 0);
        const delivered = Number(r.delivered || 0);
        const cancelled = Number(r.cancelled || 0);
        const fulfillmentRate = totalOrders > 0 ? Number(((delivered / totalOrders) * 100).toFixed(1)) : 100;
        const cancellationRate = totalOrders > 0 ? Number(((cancelled / totalOrders) * 100).toFixed(1)) : 0;

        data.kpis = {
          total_orders: totalOrders,
          pending: Number(r.pending || 0),
          confirmed: Number(r.confirmed || 0),
          in_transit: Number(r.in_transit || 0),
          delivered,
          cancelled,
          issues: Number(r.issues || 0),
          delivery_orders: Number(r.delivery_orders || 0),
          pickup_orders: Number(r.pickup_orders || 0),
          channel_web: Number(r.channel_web || 0),
          channel_telegram: Number(r.channel_telegram || 0),
          channel_call_center: Number(r.channel_call_center || 0),
          channel_pos: Number(r.channel_pos || 0),
          fulfillment_rate: fulfillmentRate,
          cancellation_rate: cancellationRate,
          stuck_pending: Number(b.stuck_pending || 0),
          stuck_transit: Number(b.stuck_transit || 0),
          low_stock_count: Number(stockAlerts[0]?.low_stock_count || 0),
          out_of_stock_count: Number(stockAlerts[0]?.out_of_stock_count || 0),
          active_staff_count: Number(activeStaff[0]?.active_count || 0),
          trend: trendRows.map((t: any) => ({
            date: String(t.date).slice(0, 10),
            total: Number(t.total || 0),
            delivered: Number(t.delivered || 0),
          })),
        };
      }

      res.json({ success: true, data });
    } catch (err) {
      log.error("Failed to build personal performance report", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
