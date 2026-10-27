/**
 * DeliveryPerformancePage.tsx
 * Admin/manager dashboard for tracking delivery team performance.
 *
 * Features:
 *   - Custom date filtering (from / to) + day / week / month grouping
 *   - Accept vs reject % per driver and team-wide
 *   - Location / city pattern analysis (where deliveries happen)
 *   - Per-driver breakdown table + recent deliveries table
 *   - Chart.js charts (line for time series, doughnut for accept/reject)
 *
 * Backend: GET /api/staff/delivery-performance (admin, manager)
 */

import React, { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { api, staff } from "../services/api";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend, Filler);
ChartJS.defaults.color = "#5c6280";
ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.defaults.font.size = 11;
ChartJS.defaults.plugins.legend.display = false;

const tooltipStyle = {
  backgroundColor: "#1a1d28",
  borderColor: "#272c40",
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
};

const ACCEPT_COLOR = "#16a34a"; // green
const REJECT_COLOR = "#dc2626"; // red
const DELIVERED_COLOR = "#2563eb"; // blue

type DriverRow = {
  driver_username: string;
  driver_staff_id: string | null;
  driver_full_name: string | null;
  accepted: number;
  delivered: number;
  rejected: number;
  accept_rate: number;
  reject_rate: number;
  completion_rate: number;
};

type LocationRow = {
  city: string;
  location: string | null;
  delivered: number;
  pct: number;
};

type RecentDelivery = {
  order_id: string;
  driver_username: string;
  driver_full_name: string | null;
  city: string;
  location: string | null;
  status: string;
  claimed_at: string;
  delivered_at: string | null;
  delivery_date: string | null;
};

type DeliveryPerformanceData = {
  summary: {
    total_assigned: number;
    total_delivered: number;
    total_rejected: number;
    total_pending: number;
    accept_rate: number;
    reject_rate: number;
    completion_rate: number;
    avg_orders_per_day: number;
    avg_orders_per_week: number;
  };
  time_series: Array<{ period: string; accepted: number; delivered: number }>;
  by_driver: DriverRow[];
  by_location: LocationRow[];
  recent_deliveries: RecentDelivery[];
};

const PERIOD_OPTIONS: Array<{ value: "day" | "week" | "month"; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const DeliveryPerformancePage: React.FC = () => {
  const [data, setData] = useState<DeliveryPerformanceData | null>(null);
  const [drivers, setDrivers] = useState<Array<{ id: string; username: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ──
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: firstDay.toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
    };
  });
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [driverFilter, setDriverFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // ── Fetch delivery performance ──
  useEffect(() => {
    let cancelled = false;
    const fetchPerformance = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (dateRange.from) qs.set("from", dateRange.from);
        if (dateRange.to) qs.set("to", dateRange.to);
        qs.set("period", period);
        if (driverFilter) qs.set("driver", driverFilter);
        if (cityFilter) qs.set("city", cityFilter);
        if (locationFilter) qs.set("location", locationFilter);

        const res = await api.get<DeliveryPerformanceData>(
          `/api/staff/delivery-performance?${qs.toString()}`
        );
        if (!cancelled) {
          if (res.success && res.data) setData(res.data);
          else setError("Failed to load delivery performance.");
        }
      } catch {
        if (!cancelled) setError("Failed to load delivery performance.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPerformance();
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to, period, driverFilter, cityFilter, locationFilter]);

  // ── Fetch delivery drivers for the dropdown ──
  useEffect(() => {
    let cancelled = false;
    const fetchDrivers = async () => {
      try {
        const res = await staff.list({ role: "delivery", limit: 100 });
        if (!cancelled && res.success && res.data) {
          setDrivers(
            res.data.map((d: any) => ({
              id: d.id,
              username: d.username,
              full_name: d.full_name,
            }))
          );
        }
      } catch {
        // Ignore — dropdown is a nicety, not required.
      }
    };
    fetchDrivers();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto py-10">
          <div className="flex items-center justify-center h-64 gap-3 text-[var(--muted)]">
            <span className="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
            <span className="text-sm">Loading delivery performance…</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto py-10">
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-[var(--muted)]">
            <span className="material-symbols-outlined text-[32px]">error_outline</span>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const s = data!.summary;

  // ── Time series chart data (accepted vs delivered) ──
  const timeSeriesLabels = data!.time_series.map(t => t.period);
  const timeSeriesData = {
    labels: timeSeriesLabels,
    datasets: [
      {
        label: "Accepted",
        data: data!.time_series.map(t => t.accepted),
        borderColor: DELIVERED_COLOR,
        backgroundColor: `${DELIVERED_COLOR}18`,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      },
      {
        label: "Delivered",
        data: data!.time_series.map(t => t.delivered),
        borderColor: ACCEPT_COLOR,
        backgroundColor: `${ACCEPT_COLOR}18`,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      },
    ],
  };

  const timeSeriesOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      tooltip: { ...tooltipStyle, callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}` } },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: "var(--muted)" } },
      y: { beginAtZero: true, grid: { color: "rgba(30,34,51,0.5)" }, border: { display: false }, ticks: { color: "var(--muted)", precision: 0 } },
    },
  };

  // ── Accept vs Reject donut ──
  const donutData = {
    labels: ["Accepted", "Rejected"],
    datasets: [
      {
        data: [s.total_assigned, s.total_rejected],
        backgroundColor: [ACCEPT_COLOR, REJECT_COLOR],
        borderColor: "#13161f",
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const donutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    plugins: {
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          label: (ctx: any) => {
            const total = s.total_assigned + s.total_rejected;
            const pct = total > 0 ? ((ctx.parsed as number) / total) * 100 : 0;
            return `${ctx.label}: ${ctx.parsed} (${pct.toFixed(1)}%)`;
          },
        },
      },
    },
  };

  const totalWithReject = s.total_assigned + s.total_rejected;
  const acceptRatePct = totalWithReject > 0 ? ((s.total_assigned / totalWithReject) * 100).toFixed(1) : "0";
  const rejectRatePct = totalWithReject > 0 ? ((s.total_rejected / totalWithReject) * 100).toFixed(1) : "0";

  // ── Helpers ──
  const fmt = (n: number) => n.toLocaleString();
  const driverDisplayName = (d: DriverRow) =>
    d.driver_full_name || d.driver_username;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-6 px-4">
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Delivery Performance</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Track delivery team delivery volume, accept / reject rates, and location patterns.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Date range */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border shadow-sm">
              <label className="text-xs text-slate-500 font-medium">From</label>
              <input
                type="date"
                className="text-sm outline-none text-gray-700 bg-transparent w-full"
                value={dateRange.from}
                onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                className="text-sm outline-none text-gray-700 bg-transparent w-full"
                value={dateRange.to}
                onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              />
              {(dateRange.from || dateRange.to) && (
                <button
                  onClick={() => {
                    const now = new Date();
                    setDateRange({
                      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
                      to: now.toISOString().split("T")[0],
                    });
                  }}
                  className="text-xs text-gray-400 hover:text-gray-700 ml-1"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Period toggle */}
            <div className="flex gap-0.5 bg-[var(--bg-deep)] rounded-lg p-0.5 border border-[var(--border)]">
              {PERIOD_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setPeriod(o.value)}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    period === o.value ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-700"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* Driver filter */}
            <div className="flex items-center gap-2">
              <select
                value={driverFilter}
                onChange={e => setDriverFilter(e.target.value)}
                className="text-sm bg-transparent text-slate-700 outline-none rounded border border-slate-200 px-2 py-1.5"
              >
                <option value="">All drivers</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.username}>
                    {d.full_name || d.username}
                  </option>
                ))}
              </select>
            </div>

            {/* City filter */}
            <input
              type="text"
              placeholder="Filter by city…"
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="text-sm bg-transparent text-slate-700 outline-none rounded border border-slate-200 px-2 py-1.5 w-32"
            />
            {/* Location filter */}
            <input
              type="text"
              placeholder="Filter by location…"
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="text-sm bg-transparent text-slate-700 outline-none rounded border border-slate-200 px-2 py-1.5 w-32"
            />
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Assigned</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{fmt(s.total_assigned)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Delivered</p>
            <p className="text-2xl font-black text-[#16a34a] mt-1">{fmt(s.total_delivered)}</p>
            <p className="text-[10px] text-slate-500 mt-1">{s.completion_rate}% completion</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Rejected</p>
            <p className="text-2xl font-black text-[#dc2626] mt-1">{fmt(s.total_rejected)}</p>
            <p className="text-[10px] text-slate-500 mt-1">{rejectRatePct}% reject rate</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Avg / Day</p>
            <p className="text-2xl font-black text-slate-800 mt-1">{s.avg_orders_per_day}</p>
            <p className="text-[10px] text-slate-500 mt-1">{s.avg_orders_per_week} / week</p>
          </div>
        </div>

        {/* ── Accept / Reject rate strip ── */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Accept Rate</p>
            <div className="flex items-end gap-1 mt-1">
              <span className="text-3xl font-black text-[#16a34a]">{acceptRatePct}%</span>
              <span className="text-sm text-slate-500 pb-1">of {fmt(totalWithReject)} decisions</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Reject Rate</p>
            <div className="flex items-end gap-1 mt-1">
              <span className="text-3xl font-black text-[#dc2626]">{rejectRatePct}%</span>
              <span className="text-sm text-slate-500 pb-1">orders drivers declined</span>
            </div>
          </div>
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Time series */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-[320px] flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[17px] text-slate-400">trending_up</span>
              <h3 className="text-sm font-bold text-slate-800">Orders Over Time</h3>
            </div>
            <div className="flex-1 min-h-0">
              {timeSeriesLabels.length > 0 ? (
                <Line data={timeSeriesData} options={timeSeriesOptions} />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>
              )}
            </div>
          </div>

          {/* Accept vs Reject donut */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-[320px] flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[17px] text-slate-400">pie_chart</span>
              <h3 className="text-sm font-bold text-slate-800">Accept vs Reject</h3>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              {totalWithReject > 0 ? (
                <Doughnut data={donutData} options={donutOptions} />
              ) : (
                <div className="text-slate-400 text-sm">No accept/reject data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Per-driver table ── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[17px] text-slate-400">person_pin</span>
              <h3 className="text-sm font-bold text-slate-800">Per-Driver Breakdown</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Driver</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Accepted</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Delivered</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Rejected</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Accept %</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Reject %</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Completion %</th>
                </tr>
              </thead>
              <tbody>
                {data!.by_driver.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No delivery data for this period.</td>
                  </tr>
                ) : (
                  data!.by_driver.map(d => (
                    <tr key={d.driver_username} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{driverDisplayName(d)}</td>
                      <td className="text-right px-4 py-3 font-medium text-slate-800">{fmt(d.accepted)}</td>
                      <td className="text-right px-4 py-3 font-medium text-[#16a34a]">{fmt(d.delivered)}</td>
                      <td className="text-right px-4 py-3 font-medium text-[#dc2626]">{fmt(d.rejected)}</td>
                      <td className="text-right px-4 py-3 font-semibold text-[#16a34a]">{d.accept_rate}%</td>
                      <td className="text-right px-4 py-3 font-semibold text-[#dc2626]">{d.reject_rate}%</td>
                      <td className="text-right px-4 py-3 font-semibold text-slate-800">{d.completion_rate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Location pattern table ── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[17px] text-slate-400">location_on</span>
              <h3 className="text-sm font-bold text-slate-800">Delivery Location Patterns</h3>
            </div>
            <p className="text-xs text-slate-400 ml-auto">Where delivered orders go — reveals delivery coverage patterns.</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">City</th>
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Location</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Delivered</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">% of Deliveries</th>
                </tr>
              </thead>
              <tbody>
                {data!.by_location.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">No location data.</td>
                  </tr>
                ) : (
                  data!.by_location.slice(0, 15).map(l => (
                    <tr key={`${l.city}||${l.location}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{l.city}</td>
                      <td className="px-4 py-3 text-slate-600">{l.location || "—"}</td>
                      <td className="text-right px-4 py-3 font-medium text-slate-800">{fmt(l.delivered)}</td>
                      <td className="text-right px-4 py-3 font-semibold text-slate-800">{l.pct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Recent deliveries ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[17px] text-slate-400">receipt_long</span>
              <h3 className="text-sm font-bold text-slate-800">Recent Deliveries</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Order ID</th>
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hidden sm:table-cell">Driver</th>
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hidden md:table-cell">City</th>
                  <th className="text-left px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Location</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="text-right px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hidden sm:table-cell">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {data!.recent_deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">No recent deliveries.</td>
                  </tr>
                ) : (
                  data!.recent_deliveries.map(o => {
                    const statusKey = o.status?.toLowerCase() ?? "";
                    const st: { bg: string; text: string } =
                      statusKey === "delivered" ? { bg: "bg-[#f0fdf4] text-[#166534]", text: "Delivered" }
                      : statusKey === "cancelled" ? { bg: "bg-[#fef2f2] text-[#991b1b]", text: "Cancelled" }
                      : statusKey === "in transit" ? { bg: "bg-[#eff6ff] text-[#1d4ed8]", text: "In Transit" }
                      : { bg: "bg-[var(--bg-deep)] text-[var(--muted)]", text: o.status };
                    return (
                      <tr key={o.order_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-800 font-semibold">{o.order_id}</td>
                        <td className="text-left px-4 py-3 text-slate-600 hidden sm:table-cell truncate max-w-[120px]">{o.driver_full_name || o.driver_username}</td>
                        <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{o.city}</td>
                        <td className="px-4 py-3 text-slate-600 hidden lg:table-cell truncate max-w-[120px]">{o.location || "—"}</td>
                        <td className="text-right px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg}`}>{st.text}</span>
                        </td>
                        <td className="text-right px-4 py-3 text-slate-400 hidden sm:table-cell whitespace-nowrap">
                          {new Date(o.claimed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default DeliveryPerformancePage;
