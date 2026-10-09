import * as t from '../components/affiliates/theme';
import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { affiliatePortal, auth } from '../services/api';
import type { AffiliateMe, AffiliateSummary, PortalCommission } from '../services/api';
import { useToast } from '../components/ui/ToastProvider';
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
  const { toast } = useToast();

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
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Forced password change
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const meRes = await affiliatePortal.me();
      if (meRes.success && meRes.data) setMe(meRes.data);
      else setError(meRes.error || 'Could not load your profile.');

      // While the temporary password is still in force the API refuses every
      // other route, so do not fire requests that can only 403.
      if (meRes.success && meRes.data && !meRes.data.must_change_password) {
        const summaryRes = await affiliatePortal.summary();
        if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
        else setError(summaryRes.error || 'Could not load your summary.');
      }
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load your dashboard.');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
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
  useEffect(() => {
    // These endpoints 403 until the temporary password is replaced.
    if (loadedOnce && me && !me.must_change_password) {
      void loadCommissions();
      void loadActivity();
    }
  }, [loadedOnce, me, loadCommissions, loadActivity]);

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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setPwError('');
    const res = await affiliatePortal.changePassword(pwCurrent, pwNew);
    if (res.success) {
      // The server invalidated the session tokens, so a fresh login is required.
      toast(res.data?.message ?? 'Password updated. Please sign in again.', 'success');
      await auth.logout();
      dispatch(logout());
    } else {
      setPwError(res.error || 'Failed to change your password.');
      setPwBusy(false);
    }
  };

  const shareUrl = me ? `${window.location.origin}${me.share_link}` : '';

  // ── Forced password change ────────────────────────────────────────────────
  // Reachable before any other portal data, because the server blocks the rest
  // of the API until the temporary password is replaced.
  if (loadedOnce && me?.must_change_password) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--g900)] px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--highland-gold-light)]">
              <span className="material-symbols-outlined text-[var(--g900)] text-3xl">lock</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-white">Choose your password</h1>
            <p className="mt-2 text-sm text-[var(--g200)]">
              You are signed in as {me.display_name} with a temporary password. Set your own to
              continue — the rest of your dashboard unlocks once you do.
            </p>
          </div>

          <form onSubmit={changePassword} className="space-y-4 rounded-2xl border-2 border-[var(--g600)] bg-[var(--g800)] p-6">
            <div>
              <label htmlFor="pw-current" className="block text-xs font-bold uppercase tracking-wider text-[var(--g200)]">
                Temporary password
              </label>
              <input
                id="pw-current"
                type="password"
                required
                value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
                className="mt-2 w-full rounded-xl border-2 border-[var(--g600)] bg-transparent px-4 py-3 text-white"
              />
            </div>

            <div>
              <label htmlFor="pw-new" className="block text-xs font-bold uppercase tracking-wider text-[var(--g200)]">
                New password
              </label>
              <input
                id="pw-new"
                type="password"
                required
                minLength={8}
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                className="mt-2 w-full rounded-xl border-2 border-[var(--g600)] bg-transparent px-4 py-3 text-white"
              />
              <p className="mt-1 text-[11px] text-[var(--g300)]">
                At least 8 characters, including upper case, lower case and a number.
              </p>
            </div>

            {pwError && (
              <div className="rounded-md border border-[var(--rose)] bg-[var(--rose-dim)] px-3 py-2 text-sm font-semibold text-[var(--rose)]">
                {pwError}
              </div>
            )}

            <button
              type="submit"
              disabled={pwBusy}
              className="w-full rounded-xl bg-[var(--highland-gold-light)] px-4 py-3 font-extrabold text-[var(--g900)] disabled:opacity-50"
            >
              {pwBusy ? 'Saving...' : 'Set password & continue'}
            </button>

            <button
              type="button"
              onClick={signOut}
              className="w-full text-sm font-bold text-[var(--g200)] underline-offset-4 hover:underline"
            >
              Sign out instead
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header className="bg-[var(--g900)] px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--highland-gold-light)]">
              <span className="material-symbols-outlined text-[var(--g900)] text-2xl">eco</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Affiliate Dashboard</h1>
              <p className="text-xs font-bold tracking-wide text-[var(--g200)]">
                {me?.display_name ?? 'Loading...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {me && (
              <div className="rounded-lg border border-[var(--g600)] bg-[var(--g800)] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--g300)]">
                  Your code
                </div>
                <div className="font-mono text-sm font-bold text-[var(--g200)]">{me.referral_code}</div>
              </div>
            )}
            <button
              onClick={signOut}
              className="rounded-lg border border-[var(--g600)] px-4 py-2 text-sm font-bold text-[var(--g200)] hover:bg-[var(--g800)]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-5 rounded-lg border border-[var(--rose)] bg-[var(--rose-dim)] px-4 py-3 text-sm font-semibold text-[var(--rose)]">
            {error}
          </div>
        )}

        {me && !me.is_active && (
          <div className="mb-5 rounded-lg border border-[var(--amber)] bg-[rgba(245,158,11,0.10)] px-4 py-3 text-sm font-semibold text-[var(--warn-text)]">
            Your affiliate account is currently deactivated. Your referral link will not credit
            new commissions until you are reactivated — contact your manager.
          </div>
        )}

        {/* Referral link */}
        <section className="mb-5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
          <h2 className={t.label}>
            Your referral link
          </h2>
          <p className="mt-1 text-[13px] text-[var(--muted-ink)]">
            Share this link. Orders placed through it are attributed to you, and you earn once
            they are delivered.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={e => e.currentTarget.select()}
              className="min-w-[240px] flex-1 rounded-md border-[1.5px] border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-xs text-[var(--fg)]"
            />
            <button
              onClick={copyLink}
              className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--g800)]"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </section>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 border-b border-[var(--border-strong)]">
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
                  ? 'border-b-2 border-[var(--accent)] text-[var(--fg)]'
                  : 'text-[var(--muted-ink)] hover:text-[var(--fg)]'
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
                <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)]">
                  <div className={t.label}>
                    {label}
                  </div>
                  <div className={`mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--fg)]`}>{value}</div>
                </div>
              ))}
            </div>

            {summary && Number(summary.clawback) > 0 && (
              <div className="rounded-lg border border-[var(--rose)] bg-[var(--rose-dim)] px-4 py-3 text-sm font-semibold text-[var(--rose)]">
                ETB {money(summary.clawback)} has been clawed back because an order you referred
                was cancelled or returned after your commission was paid. This is deducted from
                your next payout.
              </div>
            )}

            <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
              <h2 className={t.label}>
                This week
              </h2>
              <p className="mt-1 text-[13px] text-[var(--muted-ink)]">
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
                    <dt className={t.label}>
                      {k}
                    </dt>
                    <dd className={`mt-1 font-mono text-lg font-bold tabular-nums text-[var(--fg)]`}>{v}</dd>
                  </div>
                ))}
              </dl>

              {summary && (
                <p className="mt-4 rounded-md bg-[var(--bg-deep)] px-3 py-2 text-xs leading-relaxed text-[var(--fg-secondary)]">
                  Your commission rate: <strong>{summary.commissionRule}</strong>
                </p>
              )}
            </div>

            {activity.length > 0 && (
              <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
                <h2 className={t.label}>
                  Recent activity
                </h2>
                <ul className="mt-3 space-y-2">
                  {activity.map((a, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-2 text-xs last:border-0">
                      <span className="font-bold text-[var(--fg-secondary)]">
                        {String(a.event_type ?? '')}
                        {a.order_id ? (
                          <span className="ml-2 font-mono text-[var(--muted-ink)]">{String(a.order_id)}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono font-bold text-[var(--fg)]">
                          {money(a.amount)}
                        </span>
                        <span className="text-[11.5px] text-[var(--muted-ink)]">
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
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] p-4">
              <h2 className={t.label}>
                Your commissions
              </h2>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-md border-[1.5px] border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">All</option>
                <option value="pending">Awaiting payout</option>
                <option value="paid">Paid</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-4 border-b border-[var(--border-strong)] bg-[var(--bg-deep)] px-4 py-3 text-[13px]">
              <span className="font-extrabold text-[var(--amber-ink)]">
                Awaiting payout: <strong className="font-mono">{money(commissionTotals.pending)}</strong>
              </span>
              <span className="font-extrabold text-[var(--emerald)]">
                Paid: <strong className="font-mono">{money(commissionTotals.paid)}</strong>
              </span>
              {commissionTotals.reversed > 0 && (
                <span className="font-extrabold text-[var(--muted-ink)]">
                  Reversed: <strong className="font-mono">{money(commissionTotals.reversed)}</strong>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className={`${t.table} w-full min-w-[640px] text-left text-[13px]`}>
                <thead className={`${t.label} bg-[var(--bg-deep)]`}>
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
                    <tr key={c.id} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3 font-mono text-xs">{c.order_id || '—'}</td>
                      <td className="px-3 py-3 text-[13px] text-[var(--muted-ink)]">
                        {new Date(c.calculated_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 font-mono">{money(c.order_total)}</td>
                      <td className="px-4 py-3 font-mono font-bold">{money(c.commission_amount)}</td>
                      <td className="px-3 py-3">
                        <t.StatusPill
                          tone={
                            c.status === 'paid'
                              ? 'paid'
                              : c.status === 'reversed'
                                ? 'reversed'
                                : 'pending'
                          }
                          label={
                            c.status === 'pending'
                              ? 'Awaiting payout'
                              : c.status === 'paid'
                                ? 'Paid'
                                : 'Reversed'
                          }
                          strike={c.status === 'reversed'}
                        />
                        {c.reversal_reason && (
                          <div className="mt-1 text-[11px] leading-snug text-[var(--muted-ink)]">
                            {c.reversal_reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {commissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-[var(--muted-ink)]">
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
                <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)]">
                  <div className={t.label}>
                    {label}
                  </div>
                  <div className={`mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--fg)]`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
              <h2 className={t.label}>
                How engagement works
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--fg-secondary)]">
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
              <p className="mt-4 rounded-md bg-[var(--bg-deep)] px-3 py-2 text-xs leading-relaxed text-[var(--muted-ink)]">
                For your privacy we share counts only, never the names or contact details of the
                people you referred. Commission is earned once an order is delivered; if that order
                is later cancelled or returned, the commission is reversed.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <p className="mt-6 text-center text-sm text-[var(--muted-ink)]">Loading your dashboard...</p>
        )}
      </main>
    </div>
  );
};

export default AffiliateDashboard;
