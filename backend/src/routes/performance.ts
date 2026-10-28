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
  { key: "delivery",    label: "Delivery",          icon: "local_shipping", roles: ["delivery"] },
  { key: "employee",    label: "Staff / Employee",  icon: "badge",          roles: ["employee"] },
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
        `SELECT da.driver_username,
                su.id             AS staff_id,
                su.full_name      AS full_name,
                su.username       AS staff_username,
                su.role           AS role,
                su.active         AS active,
                su.telegram_username
         FROM (
                SELECT DISTINCT driver_username
                FROM delivery_assignments
                WHERE claimed_at BETWEEN ? AND ?
         ) da
         LEFT JOIN staff_users su
                ON su.deleted_at IS NULL
               AND (su.telegram_username = da.driver_username
                    OR su.username          = da.driver_username)
         ORDER BY da.driver_username`,
        params
      ) as [any[], any];

      // ── 3. Sales aggregates (call centre + employees) ────────────────────
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
          [from, to]
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
        `SELECT da.driver_username,
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
         FROM delivery_assignments da
         JOIN orders o
              ON o.id = da.order_id
             AND o.deleted_at IS NULL
         LEFT JOIN (
                SELECT order_id, MIN(created_at) AS delivered_at
                FROM order_status_history
                WHERE new_status = 'Delivered'
                GROUP BY order_id
         ) dh ON dh.order_id = o.id
         WHERE da.claimed_at BETWEEN ? AND ?
         GROUP BY da.driver_username`,
        params
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
      const deliveryByUser = new Map(deliveryRows.map((r: any) => [r.driver_username, r]));
      const rejectsByUser  = new Map(rejectionRows.map((r: any) => [r.driver_username, r]));

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
        const handle     = d.driver_username as string;
        const delivery   = deliveryByUser.get(handle);
        const rejects    = rejectsByUser.get(handle);

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
          role:              "delivery",
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

export default router;
