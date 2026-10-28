/**
 * TeamPerformancePanel.tsx
 * Asella Organic — Admin / Manager side panel for tracking every team's
 * individual performance.
 *
 * A slide-in drawer on the right edge of the dashboard with one tab per
 * internal team:
 *
 *   Call Centre  — calls logged, orders placed, conversion rate
 *   Delivery     — orders accepted, delivered, rejected, on-time rate
 *   Staff        — orders placed, delivered, cancelled, delivery rate
 *
 * Every row is one person. Clicking a row opens the existing
 * EmployeeDetailModal for a full drill-down.
 *
 * Data comes from GET /api/performance/teams, which returns every team in a
 * single response — switching tabs re-filters locally rather than
 * re-fetching, so the panel never flashes empty between tabs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../services/api";
import EmployeeDetailModal from "./EmployeeDetailModal";
import { CHART } from "./chartTheme";

// ── Types ───────────────────────────────────────────────────────────────────

type TeamKey = "call_center" | "delivery" | "employee" | "all";

interface Member {
  id:                string;
  name:              string;
  username:          string;
  role:              string;
  team:              TeamKey;
  active:            boolean;
  telegram_username: string | null;
  unlinked:          boolean;
  calls_logged:      number;
  orders_placed:     number;
  orders_assigned:   number;
  delivered:         number;
  cancelled:         number;
  pending:           number;
  rejected:          number;
  revenue:           number;
  delivery_rate:     number;
  conversion_rate:   number;
  acceptance_rate:   number;
  on_time_rate:      number;
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

interface PerformancePayload {
  range:   { from: string; to: string };
  teams:   TeamSummary[];
  all:     TeamSummary;
  members: Record<string, Member[]>;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Team accent colours, used for the avatar chip and the modal header. */
const TEAM_COLOR: Record<TeamKey, string> = {
  call_center: CHART.green300,
  delivery:    CHART.gold,
  employee:    CHART.green700,
  all:         CHART.mutedInk,
};

const TABS: Array<{ key: TeamKey; label: string; icon: string }> = [
  { key: "call_center", label: "Call Centre", icon: "headset_mic" },
  { key: "delivery",    label: "Delivery",    icon: "local_shipping" },
  { key: "employee",    label: "Staff",       icon: "badge" },
  { key: "all",         label: "All Teams",   icon: "groups" },
];

/** Sort keys available in the member table. */
type SortKey = "name" | "workload" | "calls" | "delivered" | "cancelled" | "revenue" | "rate";

interface Props {
  open:      boolean;
  onClose:   () => void;
  from?:     string;
  to?:       string;
}

// ── Small presentational helpers ────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, accent,
}: {
  icon: string; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-deep)] border border-[var(--border)]">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: accent ?? "var(--accent)" }}
      >
        <span className="material-symbols-outlined text-white text-[15px]">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--muted)] truncate">{label}</p>
        <p className="text-[15px] font-extrabold text-[var(--fg)] leading-tight">{value}</p>
        {sub && <p className="text-[9.5px] text-[var(--muted)] truncate">{sub}</p>}
      </div>
    </div>
  );
}

function RateBar({ value, label }: { value: number; label?: string }) {
  const color =
    value >= 80 ? "var(--emerald)" : value >= 50 ? "var(--amber)" : "var(--rose)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[4px] rounded-full bg-[var(--bg-deep)] overflow-hidden min-w-[36px]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-bold text-[var(--fg)] w-10 text-right">
        {value.toFixed(1)}%
      </span>
      {label && <span className="text-[9.5px] text-[var(--muted)] hidden xl:inline">{label}</span>}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export default function TeamPerformancePanel({ open, onClose, from, to }: Props) {
  const [data, setData]       = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<TeamKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("workload");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Member | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/performance/teams";
      if (from && to) url += `?from=${from}&to=${to}`;
      const res = await api.get<PerformancePayload>(url);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error ?? "Failed to load performance data");
      }
    } catch {
      setError("Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Only fetch when the panel is actually open — it is a drawer, not a
  // permanent part of the dashboard, and this query is not cheap.
  useEffect(() => {
    if (open) void fetchData();
  }, [open, fetchData]);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const summary: TeamSummary | null = useMemo(() => {
    if (!data) return null;
    return tab === "all" ? data.all : data.teams.find((t) => t.key === tab) ?? null;
  }, [data, tab]);

  const members = useMemo(() => data?.members?.[tab] ?? [], [data, tab]);

  /**
   * "Workload" is the one comparable number across all three teams: how much
   * the person was actually responsible for. It is sales orders plus delivery
   * jobs, so a hybrid employee's row matches the rate displayed beside it.
   * For a pure salesperson the second term is zero; for a pure driver the
   * first is.
   */
  const workloadOf = (m: Member): number => m.orders_placed + m.orders_assigned;

  const rateOf = (m: Member): number =>
    m.team === "delivery"
      ? (m.orders_assigned > 0 ? m.delivery_rate : m.acceptance_rate)
      : m.delivery_rate;

  const sorted = useMemo(() => {
    const rows = [...members];
    const dir = sortDir === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      switch (sortKey) {
        case "name":      return a.name.localeCompare(b.name) * dir;
        case "workload":  return (workloadOf(a) - workloadOf(b)) * dir;
        case "calls":     return (a.calls_logged - b.calls_logged) * dir;
        case "delivered": return (a.delivered - b.delivered) * dir;
        case "cancelled": return (a.cancelled - b.cancelled) * dir;
        case "revenue":   return (a.revenue - b.revenue) * dir;
        case "rate":      return (rateOf(a) - rateOf(b)) * dir;
        default:          return 0;
      }
    });
    return rows;
  }, [members, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ label, sort, className = "" }: {
    label: string; sort?: SortKey; className?: string;
  }) => (
    <th className={`px-3 py-2 text-left ${className}`}>
      {sort ? (
        <button
          onClick={() => toggleSort(sort)}
          className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          {label}
          <span className={`material-symbols-outlined text-[11px] ${sortKey === sort ? "opacity-100" : "opacity-25"}`}>
            {sortKey === sort && sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
          </span>
        </button>
      ) : (
        <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      )}
    </th>
  );

  if (typeof document === "undefined") return null;

  const isDeliveryTab = tab === "delivery";
  const isCallTab     = tab === "call_center";
  const accent        = TEAM_COLOR[tab];

  return createPortal(
    <div
      className={`fixed inset-0 z-[9998] transition-opacity duration-300 ${
        open ? "opacity-100 visible" : "opacity-0 pointer-events-none invisible"
      }`}
      style={{ background: "rgba(10,30,10,0.45)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-0 h-full w-full max-w-none flex flex-col bg-[var(--bg-card)] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Team performance"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-[var(--border)] shrink-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: accent }}
          >
            <span className="material-symbols-outlined text-[19px]">monitoring</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-extrabold text-[var(--fg)] truncate">Team Performance</h2>
            <p className="text-[10.5px] text-[var(--muted)]">
              {from && to ? `${from} → ${to}` : "Current month"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-deep)] transition-colors shrink-0"
            title="Close panel"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 px-4 sm:px-6 py-3 border-b border-[var(--border)] shrink-0">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            const count =
              t.key === "all"
                ? data?.all.headcount
                : data?.teams.find((x) => x.key === t.key)?.headcount;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-extrabold leading-none transition-all whitespace-nowrap border ${
                  isActive
                    ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent)]/30"
                    : "text-[var(--fg-secondary)] border-transparent hover:text-[var(--fg)] hover:bg-[var(--bg-deep)]"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
                {t.label}
                {count !== undefined && (
                  <span
                    className={`min-w-[24px] px-1.5 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums border ${
                      isActive
                        ? "bg-[var(--bg-card)] text-[var(--accent)] border-[var(--accent)]/25"
                        : "bg-[var(--bg-deep)] text-[var(--fg)] border-[var(--border)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--muted)]">
              <span className="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
              <span className="text-sm">Loading team performance…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-[var(--muted)] px-6 text-center">
              <span className="material-symbols-outlined text-[32px] text-[var(--rose)]">error_outline</span>
              <p className="text-sm">{error}</p>
              <button
                onClick={() => void fetchData()}
                className="mt-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-bold text-[var(--fg)] hover:bg-[var(--bg-deep)] transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-5">

              {/* Team summary */}
              {summary && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">{summary.icon}</span>
                    <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                      {summary.label} Summary
                    </h3>
                    <span className="ml-auto text-[10px] font-bold text-[var(--muted)]">
                      {summary.active_headcount} active / {summary.headcount} total
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
                    {isCallTab && (
                      <>
                        <KpiTile icon="add_call" label="Calls Logged" value={summary.metrics.calls_logged.toLocaleString()} accent={CHART.green300} />
                        <KpiTile icon="shopping_cart" label="Orders Placed" value={summary.metrics.orders_placed.toLocaleString()} accent={CHART.green700} />
                        <KpiTile icon="percent" label="Conversion" value={`${summary.metrics.conversion_rate}%`} sub="calls → orders" accent={CHART.gold} />
                      </>
                    )}
                    {isDeliveryTab && (
                      <>
                        <KpiTile icon="local_shipping" label="Assigned" value={summary.metrics.orders_assigned.toLocaleString()} accent={CHART.gold} />
                        <KpiTile icon="check_circle" label="Delivered" value={summary.metrics.delivered.toLocaleString()} sub={`${summary.metrics.delivery_rate}% completion`} accent={CHART.green700} />
                        <KpiTile icon="how_to_reg" label="Accept Rate" value={`${summary.metrics.acceptance_rate}%`} sub={`${summary.metrics.rejected} rejected`} accent={CHART.green300} />
                      </>
                    )}
                    {!isCallTab && !isDeliveryTab && (
                      <>
                        <KpiTile icon="groups" label="Headcount" value={String(summary.headcount)} sub={`${summary.active_headcount} active`} accent={CHART.mutedInk} />
                        <KpiTile
                          icon="shopping_cart"
                          label={tab === "all" ? "Workload" : "Orders"}
                          value={(tab === "all"
                            ? summary.metrics.orders_placed + summary.metrics.orders_assigned
                            : summary.metrics.orders_placed
                          ).toLocaleString()}
                          sub={tab === "all" ? "sales + delivery jobs" : undefined}
                          accent={CHART.green700}
                        />
                        <KpiTile icon="check_circle" label="Delivered" value={summary.metrics.delivered.toLocaleString()} sub={`${summary.metrics.delivery_rate}% rate`} accent={CHART.green500} />
                      </>
                    )}

                    <KpiTile icon="payments" label="Revenue" value={`ETB ${summary.metrics.revenue.toLocaleString()}`} accent={CHART.green700} />
                    <KpiTile icon="cancel" label="Cancelled" value={summary.metrics.cancelled.toLocaleString()} accent={CHART.red} />
                    <KpiTile
                      icon="hourglass_top"
                      label="In Progress"
                      value={summary.metrics.pending.toLocaleString()}
                      accent={CHART.gold}
                    />
                  </div>
                </>
              )}

              {/* Member table */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">person_search</span>
                  <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                    Individual Performance
                  </h3>
                  <span className="ml-auto text-[10px] text-[var(--muted)]">
                    {sorted.length} member{sorted.length === 1 ? "" : "s"}
                  </span>
                </div>

                {sorted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-2 text-[var(--muted)] card">
                    <span className="material-symbols-outlined text-[32px] opacity-30">group_off</span>
                    <p className="text-sm">No team members in this period.</p>
                  </div>
                ) : (
                  <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px] min-w-[640px]">
                        <thead className="bg-[var(--bg-deep)]">
                          <tr>
                            <SortHeader label="Member" sort="name" />
                            {tab === "all" && (
                              <th className="px-3 py-2 text-left">
                                <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Team</span>
                              </th>
                            )}
                            {isCallTab && <SortHeader label="Calls" sort="calls" className="text-right" />}
                            {isDeliveryTab && <SortHeader label="Assigned" sort="workload" className="text-right" />}
                            {!isCallTab && !isDeliveryTab && <SortHeader label="Workload" sort="workload" className="text-right" />}
                            <SortHeader label="Delivered" sort="delivered" className="text-right" />
                            <SortHeader label="Cancelled" sort="cancelled" className="text-right" />
                            <SortHeader label={isDeliveryTab ? "Accept" : "Rate"} sort="rate" className="px-3 py-2 text-left w-[140px]" />
                            <SortHeader label="Revenue" sort="revenue" className="text-right" />
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((m) => {
                            const canDrill = !m.id.startsWith("driver:");
                            const teamColor = TEAM_COLOR[m.team] ?? TEAM_COLOR.employee;
                            return (
                              <tr
                                key={m.id}
                                onClick={() => { if (canDrill) setSelected(m); }}
                                className={`border-b border-[var(--border)] last:border-0 transition-colors ${
                                  canDrill ? "hover:bg-[var(--bg-deep)] cursor-pointer" : ""
                                }`}
                              >
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold uppercase text-[10px] shrink-0"
                                      style={{ background: teamColor }}
                                    >
                                      {m.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-[var(--fg)] truncate max-w-[170px] flex items-center gap-1">
                                        {m.name}
                                        {!m.active && (
                                          <span className="text-[9px] text-rose-600 dark:text-rose-400 font-bold">
                                            inactive
                                          </span>
                                        )}
                                        {m.unlinked && (
                                          <span
                                            className="text-[9px] bg-[var(--amber)] text-white px-1.5 py-px rounded-full font-bold"
                                            title="This driver has no staff account — no dashboard login"
                                          >
                                            no account
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-[10px] text-[var(--muted)] truncate">
                                        @{m.telegram_username ?? m.username}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                {tab === "all" && (
                                  <td className="px-3 py-2.5">
                                    <span
                                      className="inline-flex items-center gap-1 text-[9.5px] font-bold"
                                      style={{ color: teamColor }}
                                    >
                                      {m.team === "call_center" ? "Call Centre"
                                        : m.team === "delivery" ? "Delivery" : "Staff"}
                                    </span>
                                  </td>
                                )}

                                {isCallTab && (
                                  <td className="px-3 py-2.5 text-right font-bold" style={{ color: CHART.green700 }}>
                                    {m.calls_logged.toLocaleString()}
                                  </td>
                                )}
                                {isDeliveryTab && (
                                  <td className="px-3 py-2.5 text-right font-bold" style={{ color: CHART.gold }}>
                                    {m.orders_assigned.toLocaleString()}
                                  </td>
                                )}
                                {!isCallTab && !isDeliveryTab && (
                                  <td className="px-3 py-2.5 text-right font-semibold text-[var(--fg)]">
                                    {workloadOf(m).toLocaleString()}
                                  </td>
                                )}

                                <td className="px-3 py-2.5 text-right font-semibold text-[var(--emerald)]">
                                  {m.delivered.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[var(--rose)] font-semibold">
                                  {m.cancelled.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5">
                                  <RateBar value={rateOf(m)} />
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-[var(--fg)] whitespace-nowrap">
                                  ETB {Number(m.revenue).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Rejection detail for the delivery tab */}
                {isDeliveryTab && summary && summary.metrics.rejected > 0 && (
                  <p className="text-[10.5px] text-[var(--muted)] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]">info</span>
                    {summary.metrics.rejected} delivery job(s) were declined in this period.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Drill-down modal */}
      {selected && (
        <EmployeeDetailModal
          staffId={selected.id}
          staffName={selected.name}
          staffRole={selected.team === "delivery" ? "delivery" : selected.role}
          staffColor={TEAM_COLOR[selected.team] ?? TEAM_COLOR.employee}
          from={from}
          to={to}
          onClose={() => setSelected(null)}
        />
      )}
    </div>,
    document.body
  );
}
