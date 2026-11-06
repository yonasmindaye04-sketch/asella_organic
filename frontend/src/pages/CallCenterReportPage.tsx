/**
 * frontend/src/pages/CallCenterReportPage.tsx
 * Call Center Agent — Reporting Channel
 *
 * One daily report per agent:
 *   • the agent enters calls received, orders placed and rejected calls
 *   • delivery / pickup, location and sales totals are filled automatically
 *     from the orders the authenticated agent actually created that day
 *
 * Backend:
 *   GET  /api/callcenter/me/daily-report?date=YYYY-MM-DD
 *   POST /api/callcenter/me/daily-report
 *   GET  /api/callcenter/me/report  (period analytics)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { api } from '../services/api';
import { TimeRangeSelector, getRangeDates } from '../components/dashboard/TimeRangeSelector';
import type { TimeRange } from '../components/dashboard/TimeRangeSelector';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { CHART, CHART_AXIS, CHART_TOOLTIP } from '../components/dashboard/chartTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
ChartJS.defaults.color = CHART_AXIS.tick;
ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.defaults.font.size = 11;
ChartJS.defaults.plugins.legend.display = false;

type DayStats = {
  system_orders: number;
  delivery_orders: number;
  pickup_orders: number;
  other_type_orders: number;
  addis_orders: number;
  other_region_orders: number;
  abroad_orders: number;
  total_sales: number;
};

type ExistingReport = DayStats & {
  id: string;
  calls_received: number;
  calls_ordered: number;
  calls_rejected: number;
  notes: string | null;
  is_backdated: boolean;
  submitted_on: string | null;
  submitted_at: string | null;
};

type DailyEntry = {
  report_date: string;
  today: string;
  is_backdated: boolean;
  stats: DayStats;
  existing_report: ExistingReport | null;
};

type DailyRow = {
  date: string;
  orders: number;
  delivery_orders: number;
  pickup_orders: number;
  other_type_orders: number;
  addis_orders: number;
  other_region_orders: number;
  abroad_orders: number;
  total_sales: number;
  calls_received: number;
  calls_ordered: number;
  calls_rejected: number;
  report_submitted: boolean;
  is_backdated: boolean;
  submitted_at?: string | null;
};

type HeatmapCell = {
  day_of_week: number;
  hour_of_day: number;
  count: number;
};

type ReportData = {
  date_range: { from: string; to: string };
  summary: {
    total_orders: number;
    delivery_orders: number;
    pickup_orders: number;
    other_type_orders: number;
    addis_orders: number;
    other_region_orders: number;
    abroad_orders: number;
    total_sales: number;
    avg_orders_per_day: number;
    calls_received: number;
    calls_ordered: number;
    calls_rejected: number;
    reports_submitted: number;
    calls_logged: number;
  };
  daily: DailyRow[];
  heatmap?: HeatmapCell[];
};

const StatCard: React.FC<{
  label: string;
  value: string;
  icon: string;
  color?: string;
  hint?: string;
}> = ({ label, value, icon, color = 'text-emerald-700', hint }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
    <div className={`${color}`}>
      <span className="material-symbols-outlined text-[32px]">{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-bold text-gray-800 truncate">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  </div>
);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const localToday = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};


const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

const fmtLongDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const CallCenterReportPage: React.FC = () => {
  // ── Period analytics ───────────────────────────────────────────────────────
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<TimeRange>('month');
  const [dateRange, setDateRange] = useState(() => getRangeDates('month'));

  // ── Daily report form ──────────────────────────────────────────────────────
  const [reportDate, setReportDate] = useState(localToday);
  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [entryLoading, setEntryLoading] = useState(true);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [callsReceived, setCallsReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const entrySeq = useRef(0);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
      });
      const res = await api.get<ReportData>(`/api/callcenter/me/report?${qs.toString()}`);
      if (res.success && res.data) setData(res.data);
      else setError(res.error ?? 'Failed to load report.');
    } catch {
      setError('Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const loadEntry = useCallback(async (date: string) => {
    const seq = ++entrySeq.current;
    setEntry(null);
    setNotes('');
    setEntryLoading(true);
    setEntryError(null);
    try {
      const res = await api.get<DailyEntry>(
        `/api/callcenter/me/daily-report?date=${encodeURIComponent(date)}`
      );
      if (seq !== entrySeq.current) return;
      if (res.success && res.data) {
        setEntry(res.data);
        const existing = res.data.existing_report;
        setCallsReceived(existing && existing.calls_received > 0 ? String(existing.calls_received) : '');
        setNotes(existing?.notes ?? '');
      } else {
        setEntryError(res.error ?? 'Failed to load this day’s report.');
      }
    } catch {
      if (seq !== entrySeq.current) return;
      setEntryError('Failed to load this day’s report.');
    } finally {
      if (seq === entrySeq.current) setEntryLoading(false);
    }
  }, []);

  useEffect(() => {
    setSubmitError(null);
    setSubmitOk(null);
    if (!reportDate) return;
    void loadEntry(reportDate);
  }, [reportDate, loadEntry]);

  const handleRangeChange = (range: TimeRange, from: string, to: string) => {
    setActiveRange(range);
    setDateRange({ from, to });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitOk(null);

    if (!reportDate) {
      setSubmitError('Choose a report date.');
      return;
    }

    setSubmitting(true);
    try {
      const parsedCalls = callsReceived.trim() ? parseInt(callsReceived.trim(), 10) : undefined;
      const res = await api.post<{
        report_date: string;
        updated: boolean;
        orders_match: boolean;
      }>('/api/callcenter/me/daily-report', {
        report_date: reportDate,
        calls_received: parsedCalls !== undefined && !isNaN(parsedCalls) && parsedCalls >= 0 ? parsedCalls : undefined,
        notes: notes.trim() || undefined,
      });

      if (res.success && res.data) {
        setSubmitOk(
          `Daily report for ${fmtLongDate(reportDate)} ${
            res.data.updated ? 'updated' : 'submitted'
          } successfully.`
        );
        await loadEntry(reportDate);
        await fetchReport();
      } else {
        setSubmitError(res.error ?? 'Failed to submit the daily report.');
      }
    } catch {
      setSubmitError('Failed to submit the daily report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setCallsReceived('');
    setNotes('');
    setSubmitError(null);
    setSubmitOk(null);
  };

  // ── Live preview values ────────────────────────────────────────────────────
  const stats = entry?.stats;
  const today = entry?.today ?? localToday();
  const displayDate = reportDate || today;
  const isBackdated = reportDate !== today;
  const existing = entry?.existing_report ?? null;



  const s = data?.summary;
  const daily = data?.daily ?? [];

  // Heatmap & Timeline State
  const [heatmapMode, setHeatmapMode] = useState<'hourly' | 'calendar'>('hourly');

  // Continuous date sequence for daily chart
  const timelineDates = React.useMemo(() => {
    if (!data?.date_range?.from || !data?.date_range?.to) {
      return daily.map((d) => d.date);
    }
    const dates: string[] = [];
    const cur = new Date(data.date_range.from);
    const end = new Date(data.date_range.to);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [data?.date_range, daily]);

  const dailyMapByDate = React.useMemo(() => {
    const map = new Map<string, DailyRow>();
    daily.forEach((d) => map.set(d.date, d));
    return map;
  }, [daily]);

  const dailyChart = {
    labels: timelineDates.map((dateStr) => fmtDate(dateStr)),
    datasets: [
      {
        label: 'Delivery',
        data: timelineDates.map((dateStr) => dailyMapByDate.get(dateStr)?.delivery_orders ?? 0),
        backgroundColor: CHART.green700,
        borderRadius: 4,
        maxBarThickness: 24,
        stack: 'orders',
      },
      {
        label: 'Pickup',
        data: timelineDates.map((dateStr) => dailyMapByDate.get(dateStr)?.pickup_orders ?? 0),
        backgroundColor: CHART.goldLight,
        borderRadius: 4,
        maxBarThickness: 24,
        stack: 'orders',
      },
    ],
  };

  const heatmapMatrix = React.useMemo(() => {
    const matrix: Record<number, Record<number, number>> = {};
    for (let d = 0; d < 7; d++) {
      matrix[d] = {};
      for (let h = 0; h < 24; h++) {
        matrix[d][h] = 0;
      }
    }
    const list = data?.heatmap || [];
    list.forEach((cell) => {
      const d = cell.day_of_week;
      const h = cell.hour_of_day;
      if (matrix[d] && matrix[d][h] !== undefined) {
        matrix[d][h] = cell.count;
      }
    });
    return matrix;
  }, [data?.heatmap]);

  const { peakDayName, peakHourLabel, totalOrdersInHeatmap } = React.useMemo(() => {
    const list = data?.heatmap || [];
    const daySums: number[] = [0, 0, 0, 0, 0, 0, 0];
    const hourSums: Record<number, number> = {};
    let total = 0;

    list.forEach((c) => {
      total += c.count;
      daySums[c.day_of_week] = (daySums[c.day_of_week] || 0) + c.count;
      hourSums[c.hour_of_day] = (hourSums[c.hour_of_day] || 0) + c.count;
    });

    let bestDayIdx = 0;
    let bestDaySum = 0;
    daySums.forEach((sum, idx) => {
      if (sum > bestDaySum) {
        bestDaySum = sum;
        bestDayIdx = idx;
      }
    });

    let bestHour = 14;
    let bestHourSum = 0;
    Object.entries(hourSums).forEach(([h, sum]) => {
      if (sum > bestHourSum) {
        bestHourSum = sum;
        bestHour = Number(h);
      }
    });

    const dayName = bestDaySum > 0 ? DAYS[bestDayIdx] : 'None recorded';
    const hourLabel =
      bestHourSum > 0
        ? `${bestHour > 12 ? bestHour - 12 : bestHour}:00 ${bestHour >= 12 ? 'PM' : 'AM'}`
        : 'None recorded';

    return {
      peakDayName: dayName,
      peakHourLabel: hourLabel,
      totalOrdersInHeatmap: total || (data?.summary?.total_orders ?? 0),
    };
  }, [data?.heatmap, data?.summary?.total_orders]);

  const dailyOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } },
      tooltip: CHART_TOOLTIP,
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        border: { display: false },
        ticks: { color: CHART_AXIS.tick, maxTicksLimit: 12 },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: CHART_AXIS.grid },
        border: { display: false },
        ticks: { color: CHART_AXIS.tick, precision: 0 },
      },
    },
  };

  const typeChart = {
    labels: ['Delivery', 'Pickup', 'Other'],
    datasets: [
      {
        data: [
          s?.delivery_orders ?? 0,
          s?.pickup_orders ?? 0,
          s?.other_type_orders ?? 0,
        ],
        backgroundColor: [CHART.green700, CHART.goldLight, CHART.green200],
        borderColor: CHART.white,
        borderWidth: 2,
      },
    ],
  };

  const locationChart = {
    labels: ['Addis Ababa', 'Other Regions', 'Abroad'],
    datasets: [
      {
        data: [
          s?.addis_orders ?? 0,
          s?.other_region_orders ?? 0,
          s?.abroad_orders ?? 0,
        ],
        backgroundColor: [CHART.green700, CHART.gold, CHART.green300],
        borderColor: CHART.white,
        borderWidth: 2,
      },
    ],
  };

  const donutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } },
      tooltip: CHART_TOOLTIP,
    },
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm font-semibold text-gray-800';

  return (
    <DashboardLayout>
      <main className="p-6 space-y-5 max-w-[1440px] mx-auto">
        <div>
          <h1 className="text-2xl font-semibold">Reporting Channel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Submit one report for the day. Enter your call counts — the order,
            delivery, pickup, location and sales figures are filled from your records.
          </p>
        </div>

        {/* ── Period analytics ──────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2">
          <div>
            <h2 className="text-lg font-semibold">Reporting Analytics</h2>
            <p className="text-sm text-gray-500">
              Calls and orders recorded in the selected period.
            </p>
          </div>
          <TimeRangeSelector
            activeRange={activeRange}
            from={dateRange.from}
            to={dateRange.to}
            onRangeChange={handleRangeChange}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
            <span className="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
            <span className="text-sm">Loading report…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
            <span className="material-symbols-outlined text-[32px]">error_outline</span>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => void fetchReport()}
              className="mt-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <StatCard
                label="Calls Received"
                value={(s?.calls_received ?? 0).toLocaleString()}
                icon="headset_mic"
                color="text-blue-600"
                hint={`${s?.reports_submitted ?? 0} day(s) reported`}
              />
              <StatCard
                label="Orders Placed"
                value={(s?.calls_ordered ?? 0).toLocaleString()}
                icon="shopping_cart"
                color="text-emerald-700"
                hint="Entered by agent"
              />
              <StatCard
                label="Rejected Calls"
                value={(s?.calls_rejected ?? 0).toLocaleString()}
                icon="phone_disabled"
                color="text-amber-600"
              />
              <StatCard
                label="Orders in System"
                value={(s?.total_orders ?? 0).toLocaleString()}
                icon="receipt_long"
                color="text-indigo-600"
                hint={`Avg ${s?.avg_orders_per_day ?? 0}/day`}
              />
              <StatCard
                label="Total Sales"
                value={`ETB ${(s?.total_sales ?? 0).toLocaleString()}`}
                icon="payments"
                color="text-emerald-700"
              />
              <StatCard
                label="Delivery Orders"
                value={(s?.delivery_orders ?? 0).toLocaleString()}
                icon="local_shipping"
                color="text-emerald-700"
              />
              <StatCard
                label="Pickup Orders"
                value={(s?.pickup_orders ?? 0).toLocaleString()}
                icon="storefront"
                color="text-amber-600"
              />
              <StatCard
                label="Addis Ababa"
                value={(s?.addis_orders ?? 0).toLocaleString()}
                icon="location_city"
                color="text-emerald-700"
              />
              <StatCard
                label="Other Regions"
                value={(s?.other_region_orders ?? 0).toLocaleString()}
                icon="map"
                color="text-amber-700"
              />
              <StatCard
                label="Abroad"
                value={(s?.abroad_orders ?? 0).toLocaleString()}
                icon="public"
                color="text-cyan-700"
              />
            </div>
          </>
        )}
        {/* ── Daily call report ─────────────────────────────────────────────── */}
        <div className="bg-[#FAF9F6] border border-[#d4ecd4] rounded-3xl w-full shadow-lg overflow-hidden">
          <div className="px-6 md:px-8 pt-6 md:pt-7 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-2xl text-obsidian tracking-tight">Daily Call Report</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Example: 10 calls, 8 ordered, 2 rejected — the system fills the rest.
              </p>
            </div>
            <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined">headset_mic</span>
            </div>
          </div>

          <div className="px-6 md:px-8 pb-4">
            <hr className="border-[#d4ecd4]" />
          </div>

          {submitOk && (
            <div className="mx-6 md:mx-8 mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              {submitOk}
            </div>
          )}
          {submitError && (
            <div className="mx-6 md:mx-8 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-lg">error</span>
              {submitError}
            </div>
          )}
          {entryError && (
            <div className="mx-6 md:mx-8 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3 shadow-sm">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {entryError}
              </span>
              <button
                type="button"
                onClick={() => void loadEntry(reportDate)}
                className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-bold hover:bg-red-100 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {isBackdated && !entryError && (
            <div className="mx-6 md:mx-8 mb-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 text-sm flex items-start gap-3 shadow-sm">
              <span className="material-symbols-outlined text-xl text-amber-600 shrink-0">warning</span>
              <div>
                <p className="font-bold">Backdated report</p>
                <p className="mt-0.5 leading-relaxed">
                  You are reporting for <strong>{reportDate}</strong>, not today
                  (<strong>{today}</strong>). The system will recalculate that day’s
                  order figures, flag this as a backdated submission and record full
                  audit details (staff ID, submission time, order IDs and totals).
                </p>
              </div>
            </div>
          )}

          {existing && (
            <div className="mx-6 md:mx-8 mb-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-4 py-3 text-sm flex items-start gap-3 shadow-sm">
              <span className="material-symbols-outlined text-xl text-blue-600 shrink-0">info</span>
              <div>
                <p className="font-semibold">A report for this date already exists.</p>
                <p className="mt-0.5 leading-relaxed">
                  {existing.submitted_at
                    ? `It was submitted on ${new Date(existing.submitted_at).toLocaleString()}.`
                    : 'It has already been submitted.'}{' '}
                  Submitting again will update it and keep a revision in the audit log.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="px-6 md:px-8 pb-7">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Manual fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                    Report Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={reportDate}
                    max={today}
                    onChange={(e) => {
                      if (e.target.value) setReportDate(e.target.value);
                    }}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                    Reporting for {fmtLongDate(displayDate)}.
                  </p>
                </div>

                {/* Automated capture notification */}
                <div className="rounded-xl bg-white border border-[#d4ecd4] p-4 shadow-xs">
                  <h4 className="text-xs font-black text-[#1b4d24] uppercase tracking-wider mb-1.5">
                    Orders Captured Automatically
                  </h4>
                  <p className="text-[12px] font-bold text-[#1b4d24] leading-relaxed">
                    All orders you created for this date are captured directly from the system. You do not need to enter numbers manually—just review the calculated order figures on the right, add your shift notes below, and submit.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                    Calls Received (Total Calls Handled)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 20"
                    value={callsReceived}
                    onChange={(e) => setCallsReceived(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                    Total customer calls you handled for this date (e.g. 20 calls).
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                    Notes
                  </label>
                  <textarea
                    rows={4}
                    maxLength={500}
                    placeholder="Anything worth flagging: difficult customers, follow-ups, stock questions…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={`${inputClass} resize-none font-normal`}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                    {notes.length}/500 characters
                  </p>
                </div>
              </div>

              {/* Auto-calculated side */}
              <div className="rounded-2xl border border-[#d4ecd4] bg-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[20px] text-emerald-700">lock</span>
                  <div>
                    <h3 className="font-bold text-sm text-obsidian">Calculated from your orders</h3>
                    <p className="text-[11px] text-slate-400">
                      Read-only — recalculated by the system for {displayDate}.
                    </p>
                  </div>
                </div>

                {entryLoading ? (
                  <div className="flex items-center gap-2 py-10 justify-center text-slate-400 text-sm">
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    Calculating…
                  </div>
                ) : entryError ? (
                  <div className="py-10 text-center text-sm text-slate-400">
                    Order figures unavailable.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Orders in system', value: stats?.system_orders ?? 0 },
                        { label: 'Delivery', value: stats?.delivery_orders ?? 0 },
                        { label: 'Pickup', value: stats?.pickup_orders ?? 0 },
                        { label: 'Other type', value: stats?.other_type_orders ?? 0 },
                        { label: 'Addis Ababa', value: stats?.addis_orders ?? 0 },
                        { label: 'Other Regions', value: stats?.other_region_orders ?? 0 },
                        { label: 'Abroad', value: stats?.abroad_orders ?? 0 },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-[#e6f2e6] bg-[#f7faf7] px-3 py-2.5">
                          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                            {item.label}
                          </p>
                          <p className="mt-0.5 text-xl font-black text-obsidian">{item.value}</p>
                        </div>
                      ))}
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-700">
                          Sales
                        </p>
                        <p className="mt-0.5 text-xl font-black text-emerald-800">
                          ETB {(stats?.total_sales ?? 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-white border border-[#d4ecd4] px-4 py-3 text-[12px] leading-relaxed shadow-xs">
                      <p className="font-black text-[#1b4d24] text-xs uppercase tracking-wider mb-1">
                        Report Summary
                      </p>
                      <p className="font-bold text-[#1b4d24] text-[12px] leading-relaxed">
                        {callsReceived ? (
                          <>
                            <strong className="font-black text-[#1b4d24]">{callsReceived}</strong> call{Number(callsReceived) === 1 ? '' : 's'} handled →{' '}
                            <strong className="font-black text-[#1b4d24]">{stats?.system_orders ?? 0}</strong> order{(stats?.system_orders ?? 0) === 1 ? '' : 's'} placed.
                          </>
                        ) : (
                          <>
                            <strong className="font-black text-[#1b4d24]">{stats?.system_orders ?? 0}</strong> order{(stats?.system_orders ?? 0) === 1 ? '' : 's'} automatically captured for this date.
                          </>
                        )}
                        {' '}Breakdown:{' '}
                        <strong className="font-black text-[#1b4d24]">{stats?.delivery_orders ?? 0}</strong> delivery,{' '}
                        <strong className="font-black text-[#1b4d24]">{stats?.pickup_orders ?? 0}</strong> pickup;{' '}
                        <strong className="font-black text-[#1b4d24]">{stats?.addis_orders ?? 0}</strong> Addis Ababa,{' '}
                        <strong className="font-black text-[#1b4d24]">{stats?.other_region_orders ?? 0}</strong> other region
                        {(stats?.other_region_orders ?? 0) === 1 ? '' : 's'}
                        {(stats?.abroad_orders ?? 0) > 0 && (
                          <>, <strong className="font-black text-[#1b4d24]">{stats?.abroad_orders}</strong> abroad</>
                        )}.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-[#d4ecd4]">
              <button
                type="button"
                onClick={handleClear}
                disabled={submitting}
                className="px-6 py-3 rounded-xl border border-[#d4ecd4] bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting || entryLoading}
                className="px-8 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                    Sending…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">send</span>
                    {existing ? 'Update Daily Report' : 'Submit Daily Report'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Charts: Orders Placed Per Day & Order Breakdown (Managed Balanced Area) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Orders Placed Per Day */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-sm text-gray-800">Orders Placed Per Day</h2>
                <p className="text-[11px] text-gray-400">Daily volume breakdown (Delivery vs Pickup)</p>
              </div>
              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                {data?.date_range.from} → {data?.date_range.to}
              </span>
            </div>
            <div className="h-64 w-full">
              <Bar data={dailyChart} options={dailyOptions} />
            </div>
          </div>

          {/* Order Type & Regional Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
            <div className="mb-3">
              <h2 className="font-bold text-sm text-gray-800">Order & Regional Breakdown</h2>
              <p className="text-[11px] text-gray-400">Fulfillment type and destination distribution</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Fulfillment Type</span>
                <div className="h-44 w-full">
                  <Doughnut data={typeChart} options={donutOptions} />
                </div>
              </div>
              <div className="flex flex-col items-center sm:border-l sm:border-gray-100 sm:pl-4">
                <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider mb-2">Regional Destination</span>
                <div className="h-44 w-full">
                  <Doughnut data={locationChart} options={donutOptions} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Call Center Activity Heatmap */}
        <div className="bg-white rounded-2xl border border-[#d4ecd4] shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#eef5ee]">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1b4d24] text-xl">grid_view</span>
                <h2 className="font-bold text-sm text-gray-900">Call Center Activity Heatmap</h2>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Hourly order intensity and peak operational windows across days of the week
              </p>
            </div>

            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg bg-gray-100 p-0.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setHeatmapMode('hourly')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  heatmapMode === 'hourly'
                    ? 'bg-white text-[#1b4d24] shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Hourly Peak (Day × Hour)
              </button>
              <button
                type="button"
                onClick={() => setHeatmapMode('calendar')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  heatmapMode === 'calendar'
                    ? 'bg-white text-[#1b4d24] shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                30-Day Activity Calendar
              </button>
            </div>
          </div>

          {/* Quick Insights Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div className="bg-[#f7faf7] border border-[#e6f0e6] rounded-xl p-2.5">
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-gray-400">Busiest Day</span>
              <p className="text-xs font-black text-gray-900 mt-0.5 truncate">{peakDayName}</p>
            </div>
            <div className="bg-[#f7faf7] border border-[#e6f0e6] rounded-xl p-2.5">
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-gray-400">Peak Window</span>
              <p className="text-xs font-black text-gray-900 mt-0.5 truncate">{peakHourLabel}</p>
            </div>
            <div className="bg-[#f7faf7] border border-[#e6f0e6] rounded-xl p-2.5">
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-gray-400">Total Orders in Period</span>
              <p className="text-xs font-black text-[#1b4d24] mt-0.5">{totalOrdersInHeatmap}</p>
            </div>
            <div className="bg-[#f7faf7] border border-[#e6f0e6] rounded-xl p-2.5">
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-gray-400">Active Shifts</span>
              <p className="text-xs font-black text-gray-900 mt-0.5">{daily.length} Days</p>
            </div>
          </div>

          {/* Heatmap View 1: Hourly Peak (Day x Hour) */}
          {heatmapMode === 'hourly' ? (
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Hours Header */}
                <div className="grid grid-cols-[80px_repeat(13,1fr)] gap-1.5 mb-1.5 text-[10px] font-mono text-gray-400 font-bold text-center">
                  <div className="text-left pl-1">Day</div>
                  {HOURS.map((h) => (
                    <div key={h} className="truncate">
                      {h > 12 ? `${h - 12}P` : h === 12 ? '12P' : `${h}A`}
                    </div>
                  ))}
                </div>

                {/* Day Rows */}
                {DAYS.map((dayName, dayIdx) => (
                  <div key={dayName} className="grid grid-cols-[80px_repeat(13,1fr)] gap-1.5 mb-1.5 items-center">
                    <span className="text-xs font-bold text-gray-700 pl-1">{dayName}</span>
                    {HOURS.map((hour) => {
                      const count = heatmapMatrix[dayIdx]?.[hour] || 0;
                      return (
                        <div
                          key={hour}
                          title={`${dayName} ${hour}:00 - ${hour + 1}:00: ${count} order(s)`}
                          className={`h-8 rounded-lg flex items-center justify-center text-[11px] transition-all cursor-pointer ${
                            count === 0
                              ? 'bg-[#f4f7f4] border border-[#e5ebe5] text-transparent hover:border-gray-400'
                              : count === 1
                              ? 'bg-[#d1fae5] border border-[#a7f3d0] text-[#065f46] font-bold shadow-2xs hover:scale-105'
                              : count <= 3
                              ? 'bg-[#6ee7b7] border border-[#34d399] text-[#064e3b] font-black shadow-2xs hover:scale-105'
                              : count <= 5
                              ? 'bg-[#10b981] border border-[#059669] text-white font-black shadow-2xs hover:scale-105'
                              : 'bg-[#1b4d24] border border-[#143e1c] text-white font-black shadow-2xs hover:scale-105'
                          }`}
                        >
                          {count > 0 ? count : ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Heatmap View 2: 30-Day Activity Calendar */
            <div className="overflow-x-auto">
              <div className="min-w-[600px] p-3 bg-[#f9faf9] rounded-xl border border-[#e6eee6]">
                <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-15 gap-2">
                  {timelineDates.map((dateStr) => {
                    const row = dailyMapByDate.get(dateStr);
                    const orders = row?.orders || 0;
                    const calls = row?.calls_received || 0;
                    return (
                      <div
                        key={dateStr}
                        title={`${fmtDate(dateStr)}: ${orders} order(s), ${calls} call(s)`}
                        className={`aspect-square rounded-lg flex flex-col items-center justify-center p-1 border text-center transition-all cursor-pointer ${
                          orders === 0
                            ? 'bg-white border-gray-200 text-gray-400'
                            : orders === 1
                            ? 'bg-[#d1fae5] border-[#a7f3d0] text-[#065f46] font-bold'
                            : orders <= 3
                            ? 'bg-[#6ee7b7] border-[#34d399] text-[#064e3b] font-black'
                            : 'bg-[#1b4d24] border-[#143e1c] text-white font-black'
                        }`}
                      >
                        <span className="text-[9px] font-mono leading-none">{dateStr.slice(8)}</span>
                        {orders > 0 && (
                          <span className="text-[10px] font-extrabold mt-0.5">{orders}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Heatmap Legend */}
          <div className="mt-4 pt-3 border-t border-[#eef5ee] flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
            <span className="text-[11px] font-medium text-gray-500">
              Hover over any slot to inspect exact order count and shift details
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-gray-400">Less</span>
              <span className="w-4 h-4 rounded bg-[#f4f7f4] border border-[#e5ebe5]" title="0 orders" />
              <span className="w-4 h-4 rounded bg-[#d1fae5] border border-[#a7f3d0]" title="1 order" />
              <span className="w-4 h-4 rounded bg-[#6ee7b7] border border-[#34d399]" title="2-3 orders" />
              <span className="w-4 h-4 rounded bg-[#10b981] border border-[#059669]" title="4-5 orders" />
              <span className="w-4 h-4 rounded bg-[#1b4d24] border border-[#143e1c]" title="6+ orders" />
              <span className="text-gray-400">More</span>
            </div>
          </div>
        </div>

        {/* Daily table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Daily Breakdown</h2>
            <span className="text-xs text-gray-400">
              {daily.length} day{daily.length === 1 ? '' : 's'} with activity
            </span>
          </div>
          {daily.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <span className="material-symbols-outlined text-[36px] text-gray-200">bar_chart</span>
              <p className="mt-2 text-sm">No calls or orders recorded in this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Calls</th>
                    <th className="px-4 py-3 text-right">Ordered</th>
                    <th className="px-4 py-3 text-right">Rejected</th>
                    <th className="px-4 py-3 text-right">System Orders</th>
                    <th className="px-4 py-3 text-right">Delivery</th>
                    <th className="px-4 py-3 text-right">Pickup</th>
                    <th className="px-4 py-3 text-right">Addis Ababa</th>
                    <th className="px-4 py-3 text-right">Other Regions</th>
                    <th className="px-4 py-3 text-right">Abroad</th>
                    <th className="px-4 py-3 text-right">Sales (ETB)</th>
                    <th className="px-4 py-3 text-center">Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {daily.map((d) => (
                    <tr key={d.date} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">
                        {fmtDate(d.date)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">
                        {d.report_submitted ? d.calls_received : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {d.report_submitted ? d.calls_ordered : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700">
                        {d.report_submitted ? d.calls_rejected : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">{d.orders}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{d.delivery_orders}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{d.pickup_orders}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{d.addis_orders}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{d.other_region_orders}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{d.abroad_orders}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">
                        {d.total_sales.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {d.report_submitted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            {d.is_backdated ? 'Backdated' : 'Submitted'}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 text-[11px] font-semibold">
                            Not submitted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </DashboardLayout>
  );
};

export default CallCenterReportPage;


