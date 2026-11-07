/**
 * EmployeeDetailModal.tsx
 * Full analytics modal for a single employee.
 * Matches the Asella Organic dashboard design system:
 *   - material-symbols-outlined icons
 *   - Outfit (font-heading), DM Sans/Inter (font-sans), font-mono for metrics
 *   - High contrast, legible typography scale for light and dark modes
 *   - Zero emojis per rule.md
 *   - Status indicators in bold colored uppercase text per rule.md
 *   - Chart.js for line / bar charts
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  BarElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { api } from "../../services/api";
import { CHART, CHART_AXIS, CHART_TOOLTIP } from "./chartTheme";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, BarElement, Tooltip, Filler);

// ── Source colour map ────────────────────────────────────────────────────────
const SOURCE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  website:   { label: "Website",          color: CHART.gold,     icon: "language" },
  telegram:  { label: "Telegram",         color: CHART.green700, icon: "send" },
  instagram: { label: "Instagram",        color: CHART.green300, icon: "photo_camera" },
  tiktok:    { label: "TikTok",           color: CHART.green500, icon: "music_video" },
  franchise: { label: "Bulk / Franchise", color: CHART.goldLight, icon: "inventory" },
  sales:     { label: "Walk-in / Phone",  color: CHART.mutedInk, icon: "phone_in_talk" },
  phone:     { label: "Phone",            color: CHART.mutedInk, icon: "phone_in_talk" },
};
const FALLBACK_SOURCE = { label: "Other", color: CHART.inkSoft, icon: "help_outline" };

// ── Status indicators per rule.md (bold colored text in CAPITAL LETTERS) ─────
const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  delivered:    { color: "text-emerald-600 dark:text-emerald-400", label: "DELIVERED" },
  pending:      { color: "text-amber-600 dark:text-amber-400",     label: "PENDING" },
  "in transit": { color: "text-blue-600 dark:text-blue-400",       label: "IN TRANSIT" },
  cancelled:    { color: "text-rose-600 dark:text-rose-400",       label: "CANCELLED" },
  packed:       { color: "text-violet-600 dark:text-violet-400",   label: "PACKED" },
};

// ── Types ────────────────────────────────────────────────────────────────────
interface PerformanceData {
  staff: { id: string; full_name: string; role: string; email?: string; phone?: string; created_at: string };
  summary: {
    total_orders: number; delivered: number; cancelled: number; pending: number;
    revenue: number; avg_order_value: number; delivery_rate: number;
    cancellation_rate: number; orders_per_day: number;
  };
  delivery?: {
    total_assigned: number; delivered: number; cancelled: number; pending: number;
    revenue: number; rejected: number; delivery_rate: number;
    acceptance_rate: number; on_time_rate: number;
  } | null;
  revenue_over_time: { date: string; orders: number; revenue: number }[];
  by_channel:  { source: string; orders: number; revenue: number }[];
  top_products: { item_name: string; package_size: string; qty: number; revenue: number; order_count: number }[];
  by_city:     { city: string; orders: number; revenue: number }[];
  peak_hours:  { hour: number; orders: number }[];
  recent_orders: { id: string; customer_name: string; city: string; source: string; total: number; status: string; created_at: string }[];
}

interface Props {
  staffId: string;
  staffName: string;
  staffRole: string;
  staffColor: string;
  from?: string;
  to?: string;
  onClose: () => void;
}

// ── KPI Chip ─────────────────────────────────────────────────────────────────
function KpiChip({ icon, label, value, sub, accent }: {
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
        <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight mt-0.5 truncate">
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

// ── Main modal ───────────────────────────────────────────────────────────────
export default function EmployeeDetailModal({ staffId, staffName, staffRole, staffColor, from, to, onClose }: Props) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Lock background body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch data
  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        setError(null);
        let url = `/api/staff/${staffId}/performance`;
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await api.get<any>(url);
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError("Failed to load performance data");
        }
      } catch {
        setError("Failed to load performance data");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [staffId, from, to]);

  const s = data?.summary;
  const fmt = (n: number) => n.toLocaleString();
  const fmtEtb = (n: number) => `ETB ${n.toLocaleString()}`;

  // Revenue line chart data
  const revenueChartData = {
    labels: data?.revenue_over_time.map(r =>
      new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    ) ?? [],
    datasets: [{
      label: "Revenue",
      data: data?.revenue_over_time.map(r => Number(r.revenue)) ?? [],
      borderColor: staffColor,
      backgroundColor: `${staffColor}18`,
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2.5,
    }],
  };
  const revenueChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...CHART_TOOLTIP, callbacks: { label: (ctx: any) => ` ETB ${(ctx.parsed.y || 0).toLocaleString()}` } },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: CHART_AXIS.tick, font: { size: 11, weight: "600" }, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        grid: { color: CHART_AXIS.grid },
        border: { display: false },
        ticks: {
          color: CHART_AXIS.tick,
          font: { size: 11, weight: "600" },
          callback: (v: any) => `${(v / 1000).toFixed(0)}k`,
        },
      },
    },
  };

  // Peak hours bar chart
  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const hourMap = Object.fromEntries((data?.peak_hours ?? []).map(h => [h.hour, h.orders]));
  const peakData = {
    labels: allHours.map(h => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`),
    datasets: [{
      label: "Orders",
      data: allHours.map(h => hourMap[h] ?? 0),
      backgroundColor: allHours.map(h => (hourMap[h] ?? 0) > 0 ? staffColor + "cc" : CHART.green100),
      borderRadius: 4,
      borderSkipped: false,
    }],
  };
  const peakOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...CHART_TOOLTIP } },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: CHART_AXIS.tick, font: { size: 10, weight: "600" }, maxTicksLimit: 12 },
      },
      y: {
        beginAtZero: true,
        grid: { color: CHART_AXIS.grid },
        border: { display: false },
        ticks: { color: CHART_AXIS.tick, font: { size: 11, weight: "600" }, precision: 0 },
      },
    },
  };

  const maxChannelRevenue = Math.max(...(data?.by_channel.map(c => Number(c.revenue)) ?? [1]), 1);
  const maxCityRevenue    = Math.max(...(data?.by_city.map(c => Number(c.revenue)) ?? [1]), 1);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(10,30,10,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden font-sans text-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-900 z-10 shadow-2xs">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold uppercase text-base shrink-0 shadow-xs"
            style={{ background: staffColor }}
          >
            {staffName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold font-heading text-zinc-900 dark:text-zinc-50 truncate tracking-tight">
              {staffName}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-300 font-heading capitalize">
              {staffRole}
            </p>
          </div>
          {from && to && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5">
              <span className="material-symbols-outlined text-base">calendar_month</span>
              <span>{from} → {to}</span>
            </span>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
            title="Close modal"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────────── */}
        <div
          className="overflow-y-auto flex-1 min-h-0 px-4 sm:px-6 py-5 space-y-6 overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >

          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-500 dark:text-zinc-400">
              <span className="material-symbols-outlined text-3xl animate-spin text-[#1b4d24] dark:text-emerald-400">sync</span>
              <span className="text-sm font-semibold">Loading employee analytics…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-zinc-600 dark:text-zinc-400 text-center">
              <span className="material-symbols-outlined text-4xl text-rose-600">error_outline</span>
              <p className="text-base font-semibold">{error}</p>
            </div>
          )}

          {data && s && (
            <>
              {/* ── KPI Grids ─────────────────────────────────────── */}
              {data.delivery && (
                <section className="space-y-3">
                  {s.total_orders > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">local_shipping</span>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                        Delivery Performance
                      </h3>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KpiChip icon="local_shipping" label="Assigned"        value={fmt(data.delivery.total_assigned)} sub="jobs accepted" accent={CHART.gold} />
                    <KpiChip icon="check_circle"   label="Delivered"       value={fmt(data.delivery.delivered)}    sub={`${data.delivery.delivery_rate}% completion`} accent={CHART.green700} />
                    <KpiChip icon="how_to_reg"     label="Accept Rate"     value={`${data.delivery.acceptance_rate}%`} sub={`${data.delivery.rejected} rejected`} accent={CHART.green300} />
                    <KpiChip icon="timer"          label="On-Time Rate"    value={`${data.delivery.on_time_rate}%`} sub="vs promised date" accent={CHART.mutedInk} />
                    <KpiChip icon="cancel"         label="Cancelled"       value={fmt(data.delivery.cancelled)}    accent={CHART.red} />
                    <KpiChip icon="payments"       label="Delivered Value" value={fmtEtb(data.delivery.revenue)}   accent={CHART.green700} />
                  </div>
                </section>
              )}

              {(!data.delivery || s.total_orders > 0) && (
                <section className="space-y-3">
                  {data.delivery && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">shopping_bag</span>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                        Sales Performance
                      </h3>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KpiChip icon="payments"        label="Revenue"        value={fmtEtb(s.revenue)}          accent={CHART.green700} />
                    <KpiChip icon="shopping_bag"    label="Orders"         value={fmt(s.total_orders)}        sub={`${s.delivered} delivered`} accent={CHART.mutedInk} />
                    <KpiChip icon="check_circle"    label="Delivery Rate"  value={`${s.delivery_rate}%`}      sub={`${s.delivered} of ${s.total_orders}`} accent={CHART.green500} />
                    <KpiChip icon="cancel"          label="Cancel Rate"    value={`${s.cancellation_rate}%`}  sub={`${s.cancelled} cancelled`} accent={CHART.red} />
                    <KpiChip icon="bar_chart"       label="Avg Order"      value={fmtEtb(s.avg_order_value)}  accent={CHART.gold} />
                    <KpiChip icon="today"           label="Orders / Day"   value={`${s.orders_per_day}`}      accent={CHART.inkSoft} />
                  </div>
                </section>
              )}

              {/* ── Revenue over time ─────────────────────────────── */}
              {data.revenue_over_time.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">trending_up</span>
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                      Revenue Over Time
                    </h3>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 shadow-2xs" style={{ height: 210 }}>
                    <Line data={revenueChartData} options={revenueChartOptions} />
                  </div>
                </section>
              )}

              {/* ── Channel + City (side by side on md+) ─────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Sales by channel */}
                {data.by_channel.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">hub</span>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                        Sales by Channel
                      </h3>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                      {data.by_channel.map(ch => {
                        const info = SOURCE_MAP[ch.source?.toLowerCase()] ?? FALLBACK_SOURCE;
                        const pct  = Math.max((Number(ch.revenue) / maxChannelRevenue) * 100, 2);
                        return (
                          <div key={ch.source} className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: `${info.color}22`, color: info.color }}
                            >
                              <span className="material-symbols-outlined text-base">{info.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 font-heading truncate">
                                  {info.label}
                                </span>
                                <span className="text-xs sm:text-sm font-bold font-mono text-zinc-700 dark:text-zinc-300 shrink-0 ml-2">
                                  {ch.orders} orders · ETB {Number(ch.revenue).toLocaleString()}
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${pct}%`, background: info.color }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Sales by city */}
                {data.by_city.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">location_on</span>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                        Sales by City
                      </h3>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                      {data.by_city.map(c => {
                        const pct = Math.max((Number(c.revenue) / maxCityRevenue) * 100, 2);
                        return (
                          <div key={c.city} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-base text-zinc-600 dark:text-zinc-300">apartment</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 font-heading truncate">
                                  {c.city || "Unknown"}
                                </span>
                                <span className="text-xs sm:text-sm font-bold font-mono text-zinc-700 dark:text-zinc-300 shrink-0 ml-2">
                                  {c.orders} orders · ETB {Number(c.revenue).toLocaleString()}
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${pct}%`, background: staffColor }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              {/* ── Top Products ──────────────────────────────────── */}
              {data.top_products.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">inventory_2</span>
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                      Top Products Sold
                    </h3>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm sm:text-base min-w-[620px]">
                        <thead className="bg-zinc-100/80 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">#</th>
                            <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Product</th>
                            <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading hidden sm:table-cell">Size</th>
                            <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Qty</th>
                            <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Revenue</th>
                            <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading hidden sm:table-cell">Orders</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {data.top_products.map((p, i) => (
                            <tr key={`${p.item_name}-${p.package_size}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                              <td className="px-4 py-3 text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400">{i + 1}</td>
                              <td className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100 font-heading">{p.item_name}</td>
                              <td className="px-4 py-3 text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-300 hidden sm:table-cell">{p.package_size}</td>
                              <td className="px-4 py-3 text-right font-bold font-mono text-zinc-900 dark:text-zinc-100">{Number(p.qty).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-bold font-mono" style={{ color: staffColor }}>ETB {Number(p.revenue).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-semibold font-mono text-zinc-600 dark:text-zinc-300 hidden sm:table-cell">{p.order_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Peak Hours ────────────────────────────────────── */}
              {data.peak_hours.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">schedule</span>
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                      Peak Selling Hours
                    </h3>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 shadow-2xs" style={{ height: 160 }}>
                    <Bar data={peakData} options={peakOptions} />
                  </div>
                </section>
              )}

              {/* ── Recent Orders ─────────────────────────────────── */}
              {data.recent_orders.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">receipt_long</span>
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-heading">
                      Recent Orders
                    </h3>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm sm:text-base min-w-[700px]">
                        <thead className="bg-zinc-100/80 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Order ID</th>
                            <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading hidden sm:table-cell">Customer</th>
                            <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading hidden md:table-cell">Channel</th>
                            <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Total</th>
                            <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading">Status</th>
                            <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading hidden sm:table-cell">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {data.recent_orders.map(o => {
                            const statusKey = o.status?.toLowerCase() ?? "";
                            const st = STATUS_STYLE[statusKey] ?? { color: "text-zinc-600 dark:text-zinc-400", label: (o.status || "").toUpperCase() };
                            const src = SOURCE_MAP[o.source?.toLowerCase()] ?? FALLBACK_SOURCE;
                            return (
                              <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-4 py-3 font-mono text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">{o.id}</td>
                                <td className="px-4 py-3 font-bold font-heading text-zinc-900 dark:text-zinc-100 hidden sm:table-cell truncate max-w-[160px]">{o.customer_name}</td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                  <span className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold font-heading" style={{ color: src.color }}>
                                    <span className="material-symbols-outlined text-sm">{src.icon}</span>
                                    <span>{src.label}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-bold font-mono text-zinc-900 dark:text-zinc-100">ETB {Number(o.total).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`text-xs font-black font-heading tracking-wider uppercase ${st.color}`}>{st.label}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-xs sm:text-sm font-mono text-zinc-500 dark:text-zinc-400 hidden sm:table-cell whitespace-nowrap">
                                  {new Date(o.created_at).toLocaleDateString("en-GB")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
