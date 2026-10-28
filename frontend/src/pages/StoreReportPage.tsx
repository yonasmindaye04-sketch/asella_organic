/**
 * src/pages/StoreReportPage.tsx
 * Sub Store Front Manager — Daily Pickup & Sales Report
 *
 * The pickup-order count and sales total are calculated by the backend from
 * the orders this manager placed on the selected date. They are read-only here,
 * so the report cannot be inflated by hand. The manager only chooses the date
 * and writes notes.
 *
 * Choosing a date other than today is allowed but shows a warning and is
 * recorded as a backdated submission, with the full calculation and included
 * order IDs written to the audit log.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

interface Form {
  report_date: string;
  notes:       string;
}

interface ReportStats {
  total_orders:    number;
  pickup_orders:   number;
  delivery_orders: number;
  other_orders:    number;
  excluded_orders: number;
  total_sales:     number;
}

interface ExistingReport {
  id:              string;
  total_orders:    number;
  pickup_orders:   number;
  delivery_orders: number;
  total_sales:     number;
  notes:           string | null;
  is_backdated:    boolean;
  submitted_on:    string;
  submitted_at:    string;
}

interface SummaryData {
  report_date:      string;
  today:            string;
  is_backdated:     boolean;
  stats:            ReportStats;
  existing_report:  ExistingReport | null;
}

interface SubmitResult {
  id:              string;
  report_date:     string;
  submitted_on:    string;
  is_backdated:    boolean;
  updated:         boolean;
  total_orders:    number;
  pickup_orders:   number;
  delivery_orders: number;
  total_sales:     number;
  notes:           string | null;
}

const emptyForm = (): Form => ({
  report_date: todayLocal(),
  notes:       '',
});

const money = (value: number) =>
  `ETB ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function StoreReportPage() {
  const [form, setForm]                   = useState<Form>(emptyForm);
  const [summary, setSummary]             = useState<SummaryData | null>(null);
  const [loadingStats, setLoadingStats]   = useState(true);
  const [statsError, setStatsError]       = useState<string | null>(null);
  const [reloadKey, setReloadKey]         = useState(0);
  const [submitting, setSubmitting]       = useState(false);
  const [success, setSuccess]             = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  const setField = (field: keyof Form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Summary is refetched whenever the date changes, so the displayed totals
  // always belong to the date currently in the form.
  useEffect(() => {
    let cancelled = false;
    setLoadingStats(true);
    setStatsError(null);

    api
      .get<SummaryData>(
        `/api/store-report/summary?date=${encodeURIComponent(form.report_date)}`
      )
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setSummary(res.data);
        } else {
          setSummary(null);
          setStatsError(res.error ?? 'Could not calculate this date.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setStatsError('Could not calculate this date.');
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false);
      });

    return () => { cancelled = true; };
  }, [form.report_date, reloadKey]);

  const refreshSummary = useCallback(() => setReloadKey((k) => k + 1), []);

  const stats = summary?.stats;
  const today = summary?.today ?? todayLocal();
  const isBackdated = form.report_date !== today;
  const statsReady =
    !loadingStats &&
    !statsError &&
    summary !== null &&
    summary.report_date === form.report_date;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.report_date) {
      setError('Please choose the report date.');
      return;
    }
    if (!statsReady || !summary) {
      setError('Wait for the system totals to finish loading before submitting.');
      return;
    }

    if (isBackdated && !window.confirm(
      `This report is for ${form.report_date}, not today (${today}). ` +
      `The system will record it as a backdated submission in the audit log. ` +
      `Continue?`
    )) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<SubmitResult>('/api/store-report', {
        report_date: form.report_date,
        notes:       form.notes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error ?? 'Submission failed');
      }

      const saved = res.data;
      setSuccess(
        `Report for ${saved.report_date} ${saved.updated ? 'updated' : 'submitted'}. ` +
        `${saved.total_orders} orders · ${saved.pickup_orders} pickup · ` +
        `${saved.delivery_orders} delivery · ${money(saved.total_sales)}. ` +
        (saved.is_backdated
          ? 'Backdated submission recorded in the audit log.'
          : 'The main store admin has been notified.')
      );
      setForm((prev) => ({ ...prev, notes: '' }));
      refreshSummary();
    } catch (err: any) {
      setError(err?.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClear() {
    setForm(emptyForm());
    setError(null);
    setSuccess(null);
    refreshSummary();
  }

  const pickupValue = loadingStats
    ? 'Calculating…'
    : stats
      ? String(stats.pickup_orders)
      : '—';

  const salesValue = loadingStats
    ? 'Calculating…'
    : stats
      ? stats.total_sales.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—';

  const submittedAt = summary?.existing_report?.submitted_at
    ? new Date(summary.existing_report.submitted_at).toLocaleString()
    : '';

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 font-sans w-full max-w-5xl mx-auto">
        <div className="bg-[#FAF9F6] border border-[#d4ecd4] rounded-3xl w-full shadow-lg overflow-hidden animate-in fade-in duration-300 flex flex-col">

          {/* Header */}
          <div className="px-8 pt-8 pb-4 bg-[#FAF9F6] flex justify-between items-start">
            <div>
              <h3 className="font-sans font-black text-3xl text-obsidian mb-1 tracking-tight">
                Daily Store Report
              </h3>
              <p className="text-sm font-sans text-slate-500">
                Pickup and sales figures are calculated automatically from the orders
                you placed. Choose the date and add any notes for the main store.
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-600 border border-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined">summarize</span>
            </div>
          </div>

          <div className="px-8 pb-4">
            <hr className="border-[#d4ecd4]" />
          </div>

          {success && (
            <div className="mx-8 mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              {success}
            </div>
          )}
          {error && (
            <div className="mx-8 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          {/* Different-date warning */}
          {isBackdated && (
            <div className="mx-8 mb-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 text-sm flex items-start gap-3 shadow-sm">
              <span className="material-symbols-outlined text-xl text-amber-600 shrink-0">warning</span>
              <div>
                <p className="font-bold">Different date selected</p>
                <p className="mt-0.5 leading-relaxed">
                  You are reporting for <strong>{form.report_date}</strong>, not today
                  (<strong>{today}</strong>). The system will calculate that date&apos;s
                  totals from your orders and record this as a backdated submission —
                  including your staff ID, submission time, calculated totals and the
                  included order IDs — in the audit log.
                </p>
              </div>
            </div>
          )}

          {/* Existing report notice */}
          {summary?.existing_report && (
            <div className="mx-8 mb-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-4 py-3 text-sm flex items-start gap-3 shadow-sm">
              <span className="material-symbols-outlined text-xl text-blue-600 shrink-0">info</span>
              <div>
                <p className="font-semibold">A report for this date already exists.</p>
                <p className="mt-0.5 leading-relaxed">
                  It was submitted on {submittedAt || summary.existing_report.submitted_on}.
                  Submitting again will recalculate the totals, replace that report and
                  record a revision in the audit log.
                </p>
              </div>
            </div>
          )}

          {/* Stats failure */}
          {statsError && (
            <div className="mx-8 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3 shadow-sm">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {statsError}
              </span>
              <button
                type="button"
                onClick={refreshSummary}
                className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-bold hover:bg-red-100 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="px-8 pb-8 flex-1 flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                  Report Date *
                </label>
                <input
                  type="date"
                  required
                  value={form.report_date}
                  max={today}
                  onChange={(e) => setField('report_date', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  You may adjust the date; a different date is flagged and audited.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                  <span className="material-symbols-outlined text-[13px]">lock</span>
                  Pickup Orders *
                </label>
                <input
                  type="text"
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  value={pickupValue}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-[#d4ecd4] text-slate-600 font-semibold cursor-not-allowed text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Counted from your pickup orders on this date.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                  <span className="material-symbols-outlined text-[13px]">lock</span>
                  Total Sales (ETB) *
                </label>
                <input
                  type="text"
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  value={salesValue}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-[#d4ecd4] text-slate-600 font-semibold cursor-not-allowed text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                  Sum of your orders on this date.
                </p>
              </div>
            </div>

            {/* Calculated breakdown */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-[#d4ecd4] bg-white px-4 py-3">
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                  Total Orders
                </p>
                <p className="mt-1 text-xl font-black text-obsidian">
                  {loadingStats ? '…' : stats?.total_orders ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-[#d4ecd4] bg-white px-4 py-3">
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                  Delivery Orders
                </p>
                <p className="mt-1 text-xl font-black text-obsidian">
                  {loadingStats ? '…' : stats?.delivery_orders ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-[#d4ecd4] bg-white px-4 py-3">
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                  Excluded
                </p>
                <p className="mt-1 text-xl font-black text-obsidian">
                  {loadingStats ? '…' : stats?.excluded_orders ?? '—'}
                </p>
              </div>
            </div>

            <p className="-mt-3 mb-6 text-[11px] text-slate-400 ml-1">
              Calculated live from the orders you placed on the selected date.
              Cancelled and returned orders are excluded.
            </p>

            <div className="mb-6">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                Notes
              </label>
              <textarea
                rows={5}
                maxLength={500}
                placeholder="Anything the main store should know (stock issues, big customers, etc.)"
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm resize-none"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                {form.notes.length}/500 characters
              </p>
            </div>

            <div className="mt-auto flex items-center justify-end gap-3 pt-4 border-t border-[#d4ecd4]">
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
                disabled={submitting || !statsReady}
                className="px-8 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                    Sending…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">send</span>
                    {summary?.existing_report ? 'Update Daily Report' : 'Submit Daily Report'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
