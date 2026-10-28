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

const localToday = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseCount = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
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
  const [callsOrdered, setCallsOrdered] = useState('');
  const [callsRejected, setCallsRejected] = useState('');
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
    setCallsReceived('');
    setCallsOrdered('');
    setCallsRejected('');
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
        setCallsReceived(existing ? String(existing.calls_received) : '');
        setCallsOrdered(existing ? String(existing.calls_ordered) : '');
        setCallsRejected(existing ? String(existing.calls_rejected) : '');
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

    const received = parseCount(callsReceived);
    const ordered = parseCount(callsOrdered);
    const rejected = parseCount(callsRejected);

    if (received === null || ordered === null || rejected === null) {
      setSubmitError('Enter whole numbers for calls received, orders placed and rejected calls.');
      return;
    }
    if (ordered + rejected > received) {
      setSubmitError('Orders placed plus rejected calls cannot be greater than total calls received.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{
        report_date: string;
        updated: boolean;
        orders_match: boolean;
      }>('/api/callcenter/me/daily-report', {
        report_date: reportDate,
        calls_received: received,
        calls_ordered: ordered,
        calls_rejected: rejected,
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
    setCallsOrdered('');
    setCallsRejected('');
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

  const receivedN = parseCount(callsReceived);
  const orderedN = parseCount(callsOrdered);
  const rejectedN = parseCount(callsRejected);
  const unaccounted =
    receivedN !== null && orderedN !== null && rejectedN !== null
      ? receivedN - orderedN - rejectedN
      : null;
  const mismatch =
    orderedN !== null && stats ? orderedN !== stats.system_orders : false;
  const overAllocated =
    receivedN !== null && orderedN !== null && rejectedN !== null
      ? orderedN + rejectedN > receivedN
      : false;

  const s = data?.summary;
  const daily = data?.daily ?? [];

  const dailyChart = {
    labels: daily.map((d) => fmtDate(d.date)),
    datasets: [
      {
        label: 'Delivery',
        data: daily.map((d) => d.delivery_orders),
        backgroundColor: CHART.green700,
        borderRadius: 4,
        stack: 'orders',
      },
      {
        label: 'Pickup',
        data: daily.map((d) => d.pickup_orders),
        backgroundColor: CHART.goldLight,
        borderRadius: 4,
        stack: 'orders',
      },
    ],
  };

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
              </div>
          </>
        )
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                      Calls Received *
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="10"
                      value={callsReceived}
                      onChange={(e) => setCallsReceived(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                      Orders Placed *
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="8"
                      value={callsOrdered}
                      onChange={(e) => setCallsOrdered(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                      Rejected Calls *
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="2"
                      value={callsRejected}
                      onChange={(e) => setCallsRejected(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {(overAllocated || mismatch || (unaccounted !== null && unaccounted > 0)) && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12px] text-amber-900 space-y-1">
                    {overAllocated && (
                      <p className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-amber-600">error</span>
                        Orders placed + rejected calls is greater than calls received.
                      </p>
                    )}
                    {mismatch && stats && (
                      <p className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-amber-600">sync_problem</span>
                        You entered <strong>{orderedN}</strong> orders placed, but the system
                        recorded <strong>{stats.system_orders}</strong> orders for this date.
                      </p>
                    )}
                    {unaccounted !== null && unaccounted > 0 && (
                      <p className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-amber-600">info</span>
                        <strong>{unaccounted}</strong> call{unaccounted === 1 ? '' : 's'} not marked
                        as ordered or rejected.
                      </p>
                    )}
                  </div>
                )}

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

                    <div className="mt-4 rounded-xl bg-[#f0fdf4] border border-[#c3e6cb] px-4 py-3 text-[12px] leading-relaxed text-[#14532d]">
                      <p className="font-bold mb-1">Report preview</p>
                      <p>
                        {receivedN ?? 0} call{(receivedN ?? 0) === 1 ? '' : 's'} received →{' '}
                        <strong>{orderedN ?? 0}</strong> ordered,{' '}
                        <strong>{rejectedN ?? 0}</strong> rejected.
                        {' '}From the {stats?.system_orders ?? 0} order
                        {(stats?.system_orders ?? 0) === 1 ? '' : 's'} in the system:{' '}
                        <strong>{stats?.delivery_orders ?? 0}</strong> delivery,{' '}
                        <strong>{stats?.pickup_orders ?? 0}</strong> pickup;{' '}
                        <strong>{stats?.addis_orders ?? 0}</strong> Addis Ababa,{' '}
                        <strong>{stats?.other_region_orders ?? 0}</strong> other region
                        {(stats?.other_region_orders ?? 0) === 1 ? '' : 's'}
                        {(stats?.abroad_orders ?? 0) > 0 && (
                          <>, <strong>{stats?.abroad_orders}</strong> abroad</>
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

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Orders Placed Per Day</h2>
              <span className="text-xs text-gray-400">
                {data?.date_range.from} → {data?.date_range.to}
              </span>
            </div>
            <div className="h-72">
              <Bar data={dailyChart} options={dailyOptions} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Order Type</h2>
            <div className="h-48">
              <Doughnut data={typeChart} options={donutOptions} />
            </div>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h2 className="font-semibold text-gray-800 mb-3">Location</h2>
              <div className="h-48">
                <Doughnut data={locationChart} options={donutOptions} />
              </div>
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


