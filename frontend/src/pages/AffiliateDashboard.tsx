import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { affiliatePortal, auth } from '../services/api';
import type { AffiliateMe, AffiliateSummary, PortalCommission } from '../services/api';
import { logout } from '../store/slices/authSlice';

const money = (v: unknown) =>
  Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v: number) => `${(Number(v || 0) * 100).toFixed(1)}%`;

type Tab = 'overview' | 'commissions' | 'referrals';

/**
 * Item 2 — the affiliate's own dashboard.
 *
 * Everything rendered here comes from /api/affiliate/me/*, which is scoped to
 * the caller's affiliate profile server-side. There is no affiliate id in the
 * URL, in the query string, or in any request body, so there is nothing for a
 * user to tamper with in order to see another affiliate's figures. The page
 * also never receives customer names or phone numbers — only counts, order
 * references and money.
 *
 * This layout is intentionally standalone rather than a reuse of
 * DashboardLayout, so no admin navigation, data or component can leak in.
 */
const AffiliateDashboard: React.FC = () => {
  const dispatch = useDispatch();

  const [me, setMe] = useState<AffiliateMe | null>(null);
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [commissions, setCommissions] = useState<PortalCommission[]>([]);
  const [commissionTotals, setCommissionTotals] = useState({
    pending: 0, paid: 0, reversed: 0,
  });
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meRes, summaryRes] = await Promise.all([
        affiliatePortal.me(),
        affiliatePortal.summary(),
      ]);

      if (meRes.success && meRes.data) setMe(meRes.data);
      else setError(meRes.error || 'Could not load your profile.');

      if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
      else setError(summaryRes.error || 'Could not load your summary.');
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCommissions = useCallback(async () => {
    try {
      const res = await affiliatePortal.commissions({
        ...(statusFilter ? { status: statusFilter as PortalCommission['status'] } : {}),
        limit: 50,
      });
      if (res.success && res.data) {
        setCommissions(res.data);
        setCommissionTotals(
          (res as unknown as { totals?: typeof commissionTotals }).totals ?? {
            pending: 0, paid: 0, reversed: 0,
          },
        );
      }
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load your commissions.');
    }
  }, [statusFilter]);

  const loadActivity = useCallback(async () => {
    try {
      const res = await affiliatePortal.activity();
      if (res.success && res.data) setActivity(res.data as Array<Record<string, unknown>>);
    } catch {
      // Activity is supplementary; a failure here must not break the page.
    }
  }, []);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { void loadCommissions(); }, [loadCommissions]);
  useEffect(() => { void loadActivity(); }, [loadActivity]);

  const copyLink = async () => {
    if (!me) return;
    const url = `${window.location.origin}${me.share_link}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy automatically. Your link is: ' + url);
    }
  };

  const signOut = async () => {
    await auth.logout();
    dispatch(logout());
  };

  const shareUrl = me ? `${window.location.origin}${me.share_link}` : '';

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[#081d0b] px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#d5ad6d]">
              <span className="material-symbols-outlined text-[#081d0b] text-2xl">eco</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Affiliate Dashboard</h1>
              <p className="text-xs font-bold tracking-wide text-[#8ff59c]">
                {me?.display_name ?? 'Loading...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {me && (
              <div className="rounded-lg border border-[#3e6b45] bg-[#0a2410] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5b9e65]">
                  Your code
                </div>
                <div className="font-mono text-sm font-bold text-[#8ff59c]">{me.referral_code}</div>
              </div>
            )}
            <button
              onClick={signOut}
              className="rounded-lg border border-[#3e6b45] px-4 py-2 text-sm font-bold text-[#8ff59c] hover:bg-[#1a4023]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {me && !me.is_active && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Your affiliate account is currently deactivated. Your referral link will not credit
            new commissions until you are reactivated — contact your manager.
          </div>
        )}

        {/* Referral link */}
        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
            Your referral link
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Share this link. Orders placed through it are attributed to you, and you earn once
            they are delivered.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={e => e.currentTarget.select()}
              className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
            />
            <button
              onClick={copyLink}
              className="rounded-lg bg-[#2e7d32] px-5 py-2 text-sm font-bold text-white hover:bg-[#1b3d1e]"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </section>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 border-b border-slate-200">
          {([
            ['overview', 'Overview'],
            ['commissions', 'Commissions'],
            ['referrals', 'Referral engagement'],
          ] as Array<[Tab, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-bold ${
                tab === key
                  ? 'border-b-2 border-[#2e7d32] text-[#1b3d1e]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Lifetime earned', summary ? money(summary.lifetime.totalEarned) : '—'],
                ['Awaiting payout', summary ? money(summary.lifetime.totalPending) : '—'],
                ['Already paid', summary ? money(summary.lifetime.totalPaid) : '—'],
                ['Customers referred', summary ? String(summary.lifetime.customers) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    {label}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold text-slate-900">{value}</div>
                </div>
              ))}
            </div>

            {summary && Number(summary.clawback) > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                ETB {money(summary.clawback)} has been clawed back because an order you referred
                was cancelled or returned after your commission was paid. This is deducted from
                your next payout.
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
                This week
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {summary ? `${summary.period.start} to ${summary.period.end}` : '—'}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Delivered orders', summary ? String(summary.orders) : '—'],
                  ['Sales you generated', summary ? money(summary.grossSales) : '—'],
                  ['Commission earned', summary ? money(summary.commissionEarned) : '—'],
                  ['Reversed', summary ? money(summary.commissionReversed) : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {k}
                    </dt>
                    <dd className="mt-1 font-mono text-lg font-bold text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>

              {summary && (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  Your commission rate: <strong>{summary.commissionRule}</strong>
                </p>
              )}
            </div>

            {activity.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
                  Recent activity
                </h2>
                <ul className="mt-3 space-y-2">
                  {activity.map((a, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2 text-xs last:border-0">
                      <span className="font-bold text-slate-700">
                        {String(a.event_type ?? '')}
                        {a.order_id ? (
                          <span className="ml-2 font-mono text-slate-500">{String(a.order_id)}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono font-bold text-slate-900">
                          {money(a.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {a.occurred_at
                            ? new Date(String(a.occurred_at)).toLocaleDateString('en-GB')
                            : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'commissions' && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
                Your commissions
              </h2>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="pending">Awaiting payout</option>
                <option value="paid">Paid</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs">
              <span className="text-amber-700">
                Awaiting payout: <strong className="font-mono">{money(commissionTotals.pending)}</strong>
              </span>
              <span className="text-emerald-700">
                Paid: <strong className="font-mono">{money(commissionTotals.paid)}</strong>
              </span>
              {commissionTotals.reversed > 0 && (
                <span className="text-slate-500">
                  Reversed: <strong className="font-mono">{money(commissionTotals.reversed)}</strong>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-white text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Order total</th>
                    <th className="px-4 py-3">Your commission</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map(c => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs">{c.order_id || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(c.calculated_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 font-mono">{money(c.order_total)}</td>
                      <td className="px-4 py-3 font-mono font-bold">{money(c.commission_amount)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-extrabold ${
                            c.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : c.status === 'reversed'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {c.status === 'pending'
                            ? 'Awaiting payout'
                            : c.status === 'paid'
                              ? 'Paid'
                              : 'Reversed'}
                        </span>
                        {c.reversal_reason && (
                          <div className="mt-1 text-[10px] leading-snug text-slate-500">
                            {c.reversal_reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {commissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                        No commissions yet. Share your link to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'referrals' && summary && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Link clicks', String(summary.linkClicks)],
                ['Unique visitors', String(summary.uniqueVisitors)],
                ['Customers referred', String(summary.referredCustomers)],
                ['Conversion rate', pct(summary.conversionRate)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    {label}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold text-slate-900">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
                How engagement works
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
                <li>
                  <strong>Link clicks</strong> — how many times somebody opened your referral link.
                </li>
                <li>
                  <strong>Customers referred</strong> — first-time customers who used your code.
                </li>
                <li>
                  <strong>Conversion rate</strong> — of those customers, how many placed an order.
                </li>
              </ul>
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                For your privacy we share counts only, never the names or contact details of the
                people you referred. Commission is earned once an order is delivered; if that order
                is later cancelled or returned, the commission is reversed.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <p className="mt-6 text-center text-sm text-slate-400">Loading your dashboard...</p>
        )}
      </main>
    </div>
  );
};

export default AffiliateDashboard;
