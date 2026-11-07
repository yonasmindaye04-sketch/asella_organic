/**
 * TeamPerformancePanel.tsx
 * Asella Organic — Admin / Manager slide-in panel for tracking every team's
 * individual performance.
 *
 * Provides full visibility into team and employee metrics:
 *   Call Centre  — calls logged, orders placed, conversion rate
 *   Delivery     — orders accepted, delivered, rejected, on-time rate
 *   Staff        — orders placed, delivered, cancelled, delivery rate
 *
 * Redesigned for crisp readability, high contrast, and proper typography scale
 * per rule.md (zero emojis, bold colored uppercase status indicators, full dark/light mode).
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

type SortKey = "name" | "workload" | "calls" | "delivered" | "cancelled" | "revenue" | "rate";

interface Props {
  open:      boolean;
  onClose:   () => void;
  from?:     string;
  to?:       string;
}

// ── High-Contrast Presentational Helpers ─────────────────────────────────────

function KpiTile({
  icon, label, value, sub, accent,
}: {
  icon: string; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs transition hover:border-zinc-300 dark:hover:border-zinc-700">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
        style={{ background: accent ?? "var(--accent)" }}
      >
        <span className="material-symbols-outlined text-white text-xl">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
          {label}
        </p>
        <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight mt-0.5">
          {value}
        </p>
        {sub && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function RateBar({ value, label }: { value: number; label?: string }) {
  const barColor =
    value >= 80 ? "bg-emerald-600 dark:bg-emerald-500" : value >= 50 ? "bg-amber-600 dark:bg-amber-500" : "bg-rose-600 dark:bg-rose-500";
  const textColor =
    value >= 80 ? "text-emerald-700 dark:text-emerald-400" : value >= 50 ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400";

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden min-w-[50px]">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        />
      </div>
      <span className={`text-xs sm:text-sm font-bold font-mono w-14 text-right shrink-0 ${textColor}`}>
        {value.toFixed(1)}%
      </span>
      {label && <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden xl:inline">{label}</span>}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

type RangePreset = "all" | "this_month" | "last_month" | "last_90";

export default function TeamPerformancePanel({ open, onClose, from: initialFrom, to: initialTo }: Props) {
  const [data, setData]       = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<TeamKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("workload");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Member | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>(initialFrom && initialTo ? "this_month" : "all");

  const formatLocalYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const computedRange = useMemo(() => {
    if (rangePreset === "all") return { from: "", to: "", label: "All Time (Complete History)" };
    const now = new Date();
    if (rangePreset === "this_month") {
      const first = formatLocalYMD(new Date(now.getFullYear(), now.getMonth(), 1));
      const last  = formatLocalYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from: first, to: last, label: "Current Month" };
    }
    if (rangePreset === "last_month") {
      const first = formatLocalYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const last  = formatLocalYMD(new Date(now.getFullYear(), now.getMonth(), 0));
      return { from: first, to: last, label: "Previous Month" };
    }
    const first = formatLocalYMD(new Date(now.getTime() - 90 * 86400000));
    const last  = formatLocalYMD(now);
    return { from: first, to: last, label: "Last 90 Days" };
  }, [rangePreset]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/performance/teams";
      if (computedRange.from && computedRange.to) {
        url += `?from=${computedRange.from}&to=${computedRange.to}`;
      } else {
        url += "?range=all";
      }
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
  }, [computedRange.from, computedRange.to]);

  useEffect(() => {
    if (open) void fetchData();
  }, [open, fetchData]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // ── Derived Data ─────────────────────────────────────────────────────────
  const summary: TeamSummary | null = useMemo(() => {
    if (!data) return null;
    return tab === "all" ? data.all : data.teams.find((t) => t.key === tab) ?? null;
  }, [data, tab]);

  const members = useMemo(() => data?.members?.[tab] ?? [], [data, tab]);

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
    <th className={`px-4 py-3 text-left ${className}`}>
      {sort ? (
        <button
          onClick={() => toggleSort(sort)}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer font-heading"
        >
          <span>{label}</span>
          <span className={`material-symbols-outlined text-sm ${sortKey === sort ? "opacity-100 text-zinc-900 dark:text-zinc-100" : "opacity-35"}`}>
            {sortKey === sort && sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
          </span>
        </button>
      ) : (
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">
          {label}
        </span>
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
      style={{ background: "rgba(10,30,10,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-0 h-full w-full max-w-none flex flex-col bg-zinc-50 dark:bg-[#09090b] shadow-2xl transition-transform duration-300 ease-out text-zinc-900 dark:text-zinc-100 font-sans ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Team performance"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
              style={{ background: accent }}
            >
              <span className="material-symbols-outlined text-2xl">monitoring</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold font-heading text-zinc-900 dark:text-zinc-50 tracking-tight truncate">
                Team Performance
              </h2>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 font-medium">
                {computedRange.label}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Range Presets */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
              {(
                [
                  { key: "all", label: "All Time" },
                  { key: "this_month", label: "This Month" },
                  { key: "last_month", label: "Last Month" },
                  { key: "last_90", label: "90 Days" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setRangePreset(preset.key)}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-bold font-heading rounded-lg transition cursor-pointer ${
                    rangePreset === preset.key
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/80 dark:border-zinc-700/80"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
              title="Close panel"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 px-4 sm:px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
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
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold font-heading transition-all whitespace-nowrap cursor-pointer border ${
                  isActive
                    ? "bg-[#1b4d24] text-white border-[#1b4d24] shadow-xs"
                    : "text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="material-symbols-outlined text-xl">{t.icon}</span>
                <span>{t.label}</span>
                {count !== undefined && (
                  <span
                    className={`min-w-[24px] px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
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
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-500 dark:text-zinc-400">
              <span className="material-symbols-outlined text-3xl animate-spin text-[#1b4d24] dark:text-emerald-400">sync</span>
              <span className="text-sm font-semibold">Loading team performance…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-zinc-600 dark:text-zinc-400 px-6 text-center">
              <span className="material-symbols-outlined text-4xl text-rose-600">error_outline</span>
              <p className="text-base font-semibold">{error}</p>
              <button
                onClick={() => void fetchData()}
                className="mt-2 px-4 py-2 rounded-xl bg-[#1b4d24] text-white text-xs sm:text-sm font-bold font-heading transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-6">

              {/* Team Summary Section */}
              {summary && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">{summary.icon}</span>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                        {summary.label} Summary
                      </h3>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-300 font-heading">
                      {summary.active_headcount} active / {summary.headcount} total team members
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
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
                        <KpiTile icon="check_circle" label="Delivered" value={summary.metrics.delivered.toLocaleString()} sub={`${summary.metrics.delivery_rate}% completion`} accent={CHART.green500} />
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

              {/* Individual Performance Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">person_search</span>
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                      Individual Team Performance
                    </h3>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-300 font-heading">
                    {sorted.length} member{sorted.length === 1 ? "" : "s"}
                  </span>
                </div>

                {sorted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-2 text-zinc-500 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="material-symbols-outlined text-4xl opacity-40">group_off</span>
                    <p className="text-sm font-semibold">No team members found in this period.</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm sm:text-base min-w-[720px]">
                        <thead className="bg-zinc-100/80 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
                          <tr>
                            <SortHeader label="Member" sort="name" />
                            {tab === "all" && (
                              <th className="px-4 py-3 text-left">
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Team</span>
                              </th>
                            )}
                            {isCallTab && <SortHeader label="Calls" sort="calls" className="text-right" />}
                            {isDeliveryTab && <SortHeader label="Assigned" sort="workload" className="text-right" />}
                            {!isCallTab && !isDeliveryTab && <SortHeader label="Workload" sort="workload" className="text-right" />}
                            <SortHeader label="Delivered" sort="delivered" className="text-right" />
                            <SortHeader label="Cancelled" sort="cancelled" className="text-right" />
                            <SortHeader label={isDeliveryTab ? "Accept Rate" : "Completion"} sort="rate" className="px-4 py-3 text-left w-[170px]" />
                            <SortHeader label="Revenue" sort="revenue" className="text-right" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {sorted.map((m) => {
                            const canDrill = !m.id.startsWith("driver:");
                            const teamColor = TEAM_COLOR[m.team] ?? TEAM_COLOR.employee;
                            return (
                              <tr
                                key={m.id}
                                onClick={() => { if (canDrill) setSelected(m); }}
                                className={`transition-colors ${
                                  canDrill ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : ""
                                }`}
                              >
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold uppercase text-xs shrink-0 shadow-2xs"
                                      style={{ background: teamColor }}
                                    >
                                      {m.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 font-heading truncate max-w-[200px] flex items-center gap-1.5">
                                        <span>{m.name}</span>
                                        {!m.active && (
                                          <span className="text-xs text-rose-600 dark:text-rose-400 font-black font-heading uppercase">
                                            INACTIVE
                                          </span>
                                        )}
                                        {m.unlinked && (
                                          <span
                                            className="text-xs text-amber-600 dark:text-amber-400 font-black font-heading uppercase"
                                            title="Driver has no staff dashboard account"
                                          >
                                            NO ACCOUNT
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                        @{m.telegram_username ?? m.username}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                {tab === "all" && (
                                  <td className="px-4 py-3.5">
                                    <span
                                      className="inline-flex items-center gap-1 text-xs font-bold font-heading uppercase"
                                      style={{ color: teamColor }}
                                    >
                                      {m.team === "call_center" ? "Call Centre"
                                        : m.team === "delivery" ? "Delivery" : m.role === "store_manager" ? "Substore" : "Staff"}
                                    </span>
                                  </td>
                                )}

                                {isCallTab && (
                                  <td className="px-4 py-3.5 text-right font-bold font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                    {m.calls_logged.toLocaleString()}
                                  </td>
                                )}
                                {isDeliveryTab && (
                                  <td className="px-4 py-3.5 text-right font-bold font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                    {m.orders_assigned.toLocaleString()}
                                  </td>
                                )}
                                {!isCallTab && !isDeliveryTab && (
                                  <td className="px-4 py-3.5 text-right font-bold font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                    {workloadOf(m).toLocaleString()}
                                  </td>
                                )}

                                <td className="px-4 py-3.5 text-right font-bold font-mono text-sm sm:text-base text-emerald-600 dark:text-emerald-400">
                                  {m.delivered.toLocaleString()}
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold font-mono text-sm sm:text-base text-rose-600 dark:text-rose-400">
                                  {m.cancelled.toLocaleString()}
                                </td>
                                <td className="px-4 py-3.5">
                                  <RateBar value={rateOf(m)} />
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
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

                {/* Rejection Detail */}
                {isDeliveryTab && summary && summary.metrics.rejected > 0 && (
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 font-medium pt-1">
                    <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400">info</span>
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
          from={computedRange.from || undefined}
          to={computedRange.to || undefined}
          onClose={() => setSelected(null)}
        />
      )}
    </div>,
    document.body
  );
}
