/**
 * EmployeeDetailModal.tsx
 * Full analytics modal for a single employee.
 * Matches the Asella Organic dashboard design system:
 *   - material-symbols-outlined icons
 *   - CSS variables (--fg, --muted, --border, --bg-deep, --accent, etc.)
 *   - .card class and border-radius tokens
 *   - Chart.js for line / bar charts (already registered in ChartsRow)
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

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, BarElement, Tooltip, Filler);

// ── Source colour map (matches ChartsRow) ─────────────────────────────────────
const SOURCE_MAP: Record<string, { label: string; color: string; icon: string }> = {
  website:   { label: "Website",        color: "#f0a030", icon: "language" },
  telegram:  { label: "Telegram",       color: "#38bdf8", icon: "send" },
  instagram: { label: "Instagram",      color: "#a78bfa", icon: "photo_camera" },
  tiktok:    { label: "TikTok",         color: "#34d399", icon: "music_video" },
  franchise: { label: "Bulk / Franchise", color: "#fb7185", icon: "inventory" },
  sales:     { label: "Walk-in / Phone", color: "#81c784", icon: "phone_in_talk" },
  phone:     { label: "Phone",          color: "#81c784", icon: "phone_in_talk" },
};
const FALLBACK_SOURCE = { label: "Other", color: "#6b8f6e", icon: "help_outline" };

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  delivered:  { bg: "bg-[#f0fdf4] text-[#166534]", text: "Delivered" },
  pending:    { bg: "bg-[#fffbeb] text-[#92400e]", text: "Pending" },
  "in transit": { bg: "bg-[#eff6ff] text-[#1d4ed8]", text: "In Transit" },
  cancelled:  { bg: "bg-[#fef2f2] text-[#991b1b]", text: "Cancelled" },
  packed:     { bg: "bg-[#f5f3ff] text-[#5b21b6]", text: "Packed" },
};

const CHART_TOOLTIP = {
  backgroundColor: "#fff",
  borderColor: "var(--border)",
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  titleColor: "var(--fg)",
  bodyColor: "var(--muted)",
};

// ── Types ────────────────────────────────────────────────────────────────────
interface PerformanceData {
  staff: { id: string; full_name: string; role: string; email?: string; phone?: string; created_at: string };
  summary: {
    total_orders: number; delivered: number; cancelled: number; pending: number;
    revenue: number; avg_order_value: number; delivery_rate: number;
    cancellation_rate: number; orders_per_day: number;
  };
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

// ── KPI chip ─────────────────────────────────────────────────────────────────
function KpiChip({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-deep)] border border-[var(--border)]">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: accent ?? "var(--accent)", opacity: 0.9 }}
      >
        <span className="material-symbols-outlined text-white text-[16px]">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">{label}</p>
        <p className="text-[15px] font-extrabold text-[var(--fg)] leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-[var(--muted)]">{sub}</p>}
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
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
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
      x: { grid: { display: false }, border: { display: false }, ticks: { color: "var(--muted)", maxTicksLimit: 8 } },
      y: { beginAtZero: true, grid: { color: "rgba(100,140,100,0.08)" }, border: { display: false }, ticks: { color: "var(--muted)", callback: (v: any) => `${(v / 1000).toFixed(0)}k` } },
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
      backgroundColor: allHours.map(h => (hourMap[h] ?? 0) > 0 ? staffColor + "cc" : "rgba(100,140,100,0.1)"),
      borderRadius: 4,
      borderSkipped: false,
    }],
  };
  const peakOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...CHART_TOOLTIP } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: "var(--muted)", maxTicksLimit: 12 } },
      y: { beginAtZero: true, grid: { color: "rgba(100,140,100,0.08)" }, border: { display: false }, ticks: { color: "var(--muted)", precision: 0 } },
    },
  };

  const maxChannelRevenue = Math.max(...(data?.by_channel.map(c => Number(c.revenue)) ?? [1]), 1);
  const maxCityRevenue    = Math.max(...(data?.by_city.map(c => Number(c.revenue)) ?? [1]), 1);

  if (typeof document === "undefined") return null;
  console.log("Rendering EmployeeDetailModal via React Portal to document.body");

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(10,30,10,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-6xl h-[88vh] flex flex-col rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)] z-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold uppercase text-sm shrink-0"
            style={{ background: staffColor }}
          >
            {staffName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-extrabold text-[var(--fg)] truncate">{staffName}</h2>
            <p className="text-[11px] text-[var(--muted)] capitalize">{staffRole}</p>
          </div>
          {from && to && (
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--muted)] bg-[var(--bg-deep)] border border-[var(--border)] rounded-full px-3 py-1">
              <span className="material-symbols-outlined text-[13px]">calendar_month</span>
              {from} → {to}
            </span>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-deep)] transition-colors shrink-0"
            title="Close modal"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────────── */}
        <div
          className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-6 overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >

          {loading && (
            <div className="flex items-center justify-center h-64 gap-3 text-[var(--muted)]">
              <span className="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
              <span className="text-sm">Loading analytics…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-[var(--muted)]">
              <span className="material-symbols-outlined text-[32px] text-[var(--rose)]">error_outline</span>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {data && s && (
            <>
              {/* ── KPI Grid ─────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <KpiChip icon="payments"        label="Revenue"        value={fmtEtb(s.revenue)}          accent="var(--emerald)" />
                <KpiChip icon="shopping_bag"    label="Orders"         value={fmt(s.total_orders)}        sub={`${s.delivered} delivered`} accent="var(--sky)" />
                <KpiChip icon="check_circle"    label="Delivery Rate"  value={`${s.delivery_rate}%`}      sub={`${s.delivered} of ${s.total_orders}`} accent="var(--accent)" />
                <KpiChip icon="cancel"          label="Cancel Rate"    value={`${s.cancellation_rate}%`}  sub={`${s.cancelled} cancelled`} accent="var(--rose)" />
                <KpiChip icon="bar_chart"       label="Avg Order"      value={fmtEtb(s.avg_order_value)}  accent="var(--amber)" />
                <KpiChip icon="today"           label="Orders / Day"   value={`${s.orders_per_day}`}      accent="#6b8f6e" />
              </div>

              {/* ── Revenue over time ─────────────────────────────── */}
              {data.revenue_over_time.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">trending_up</span>
                    <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Revenue Over Time</h3>
                  </div>
                  <div className="card p-4" style={{ height: 180 }}>
                    <Line data={revenueChartData} options={revenueChartOptions} />
                  </div>
                </section>
              )}

              {/* ── Channel + City (side by side on md+) ─────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Sales by channel */}
                {data.by_channel.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">hub</span>
                      <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Sales by Channel</h3>
                    </div>
                    <div className="card p-4 space-y-3">
                      {data.by_channel.map(ch => {
                        const info = SOURCE_MAP[ch.source?.toLowerCase()] ?? FALLBACK_SOURCE;
                        const pct  = Math.max((Number(ch.revenue) / maxChannelRevenue) * 100, 2);
                        return (
                          <div key={ch.source} className="flex items-center gap-2.5">
                            <div
                              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                              style={{ background: `${info.color}22`, color: info.color }}
                            >
                              <span className="material-symbols-outlined text-[13px]">{info.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-[var(--fg)] truncate">{info.label}</span>
                                <span className="text-[10px] text-[var(--muted)] shrink-0 ml-2">{ch.orders} · ETB {Number(ch.revenue).toLocaleString()}</span>
                              </div>
                              <div className="h-[3px] rounded-full bg-[var(--bg-deep)] overflow-hidden">
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
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">location_on</span>
                      <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Sales by City</h3>
                    </div>
                    <div className="card p-4 space-y-3">
                      {data.by_city.map(c => {
                        const pct = Math.max((Number(c.revenue) / maxCityRevenue) * 100, 2);
                        return (
                          <div key={c.city} className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md bg-[var(--bg-deep)] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[13px] text-[var(--muted)]">apartment</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-[var(--fg)] truncate">{c.city || "Unknown"}</span>
                                <span className="text-[10px] text-[var(--muted)] shrink-0 ml-2">{c.orders} · ETB {Number(c.revenue).toLocaleString()}</span>
                              </div>
                              <div className="h-[3px] rounded-full bg-[var(--bg-deep)] overflow-hidden">
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
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">inventory_2</span>
                    <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Top Products Sold</h3>
                  </div>
                  <div className="card overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[600px]">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-deep)]">
                          <th className="text-left px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">#</th>
                          <th className="text-left px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Product</th>
                          <th className="text-left px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] hidden sm:table-cell">Size</th>
                          <th className="text-right px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Qty</th>
                          <th className="text-right px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Revenue</th>
                          <th className="text-right px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] hidden sm:table-cell">Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.top_products.map((p, i) => (
                          <tr key={`${p.item_name}-${p.package_size}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-deep)] transition-colors">
                            <td className="px-4 py-2.5 text-[var(--muted)] font-bold">{i + 1}</td>
                            <td className="px-4 py-2.5 font-semibold text-[var(--fg)]">{p.item_name}</td>
                            <td className="px-4 py-2.5 text-[var(--muted)] hidden sm:table-cell">{p.package_size}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-[var(--fg)]">{Number(p.qty).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right font-bold" style={{ color: staffColor }}>ETB {Number(p.revenue).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-[var(--muted)] hidden sm:table-cell">{p.order_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Peak Hours ────────────────────────────────────── */}
              {data.peak_hours.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">schedule</span>
                    <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Peak Selling Hours</h3>
                  </div>
                  <div className="card p-4" style={{ height: 140 }}>
                    <Bar data={peakData} options={peakOptions} />
                  </div>
                </section>
              )}

              {/* ── Recent Orders ─────────────────────────────────── */}
              {data.recent_orders.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[17px] text-[var(--muted)]">receipt_long</span>
                    <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Recent Orders</h3>
                  </div>
                  <div className="card overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[700px]">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-deep)]">
                          <th className="text-left px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Order ID</th>
                          <th className="text-left px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] hidden sm:table-cell">Customer</th>
                          <th className="text-left px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] hidden md:table-cell">Channel</th>
                          <th className="text-right px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Total</th>
                          <th className="text-right px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)]">Status</th>
                          <th className="text-right px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] hidden sm:table-cell">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_orders.map(o => {
                          const statusKey = o.status?.toLowerCase() ?? "";
                          const st = STATUS_STYLE[statusKey] ?? { bg: "bg-[var(--bg-deep)] text-[var(--muted)]", text: o.status };
                          const src = SOURCE_MAP[o.source?.toLowerCase()] ?? FALLBACK_SOURCE;
                          return (
                            <tr key={o.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-deep)] transition-colors">
                              <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--fg)] font-semibold">{o.id}</td>
                              <td className="px-4 py-2.5 text-[var(--fg)] hidden sm:table-cell truncate max-w-[140px]">{o.customer_name}</td>
                              <td className="px-4 py-2.5 hidden md:table-cell">
                                <span className="flex items-center gap-1" style={{ color: src.color }}>
                                  <span className="material-symbols-outlined text-[12px]">{src.icon}</span>
                                  <span className="text-[11px]">{src.label}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-[var(--fg)]">ETB {Number(o.total).toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg}`}>{st.text}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-[var(--muted)] hidden sm:table-cell whitespace-nowrap">
                                {new Date(o.created_at).toLocaleDateString("en-GB")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
