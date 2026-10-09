import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { referrals, auth, type AffiliateRuleType } from '../services/api';
import CommissionRulePanel from '../components/affiliates/CommissionRulePanel';
import AffiliateTable from '../components/affiliates/AffiliateTable';
import CommissionMovementTable from '../components/affiliates/CommissionMovementTable';
import AffiliateReportPanel from '../components/affiliates/AffiliateReportPanel';
import PanelErrorBoundary from '../components/affiliates/PanelErrorBoundary';
import * as t from '../components/affiliates/theme';

interface AffiliateStats {
  total_affiliates: number;
  active_affiliates: number;
  total_referred_customers: number;
  total_commissions_generated: number;
  total_paid: number;
  total_pending: number;
  pending_count: number;
  total_reversed?: number;
  clawback_pending?: number;
}

const emptyStats: AffiliateStats = {
  total_affiliates: 0,
  active_affiliates: 0,
  total_referred_customers: 0,
  total_commissions_generated: 0,
  total_paid: 0,
  total_pending: 0,
  pending_count: 0,
  total_reversed: 0,
  clawback_pending: 0,
};

export interface AffiliateRow {
  id: string;
  referral_code: string;
  is_active: boolean | number;
  rule_type: AffiliateRuleType;
  total_earnings: number;
  total_referrals: number;
  clawback_pending: number;
  full_name: string;
  identifier: string;
  affiliate_type: 'staff' | 'external';
  total_customers: number;
  total_commissions_amount: number;
  pending_count: number;
  paid_count: number;
}

const money = (value: unknown) => Number(value || 0).toLocaleString('en-US');

const AffiliateControlPage: React.FC = () => {
  const [stats, setStats] = useState<AffiliateStats>(emptyStats);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, affiliateRes] = await Promise.all([
        referrals.stats(),
        referrals.list(),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data as AffiliateStats);
      if (affiliateRes.success && affiliateRes.data) {
        setAffiliates(affiliateRes.data as AffiliateRow[]);
      }

      const failed = [statsRes, affiliateRes].find(res => !res.success);
      if (failed) setError(failed.error || 'Some affiliate data could not be loaded.');
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load affiliate dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRate = useMemo(() => {
    if (!stats.total_affiliates) return 0;
    return Math.round((stats.active_affiliates / stats.total_affiliates) * 100);
  }, [stats]);

  const customRuleCount = useMemo(
    () => affiliates.filter(a => a.rule_type === 'custom').length,
    [affiliates],
  );

  // Actions that move money (Portal Login, Delete, Mark Paid, Send Report) are
  // 2FA-gated server-side. If the admin has no 2FA they will fail with a bare
  // 403, so check up front and explain what to do about it.
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    // Failure here must not surface as an unhandled rejection — the banner is
    // advisory, and a network error should not interrupt the page.
    void auth.me()
      .then((res) => {
        if (res.success && res.data) {
          setTwoFactorEnabled(Boolean(res.data.two_factor_enabled));
        }
      })
      .catch(() => { /* leave the banner hidden */ });
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className={t.h1}>Affiliate Control</h1>
            <p className={t.sub}>
              Manage referral codes, commission rules, payouts, and affiliate movement.
            </p>
          </div>
          <button onClick={load} className={t.btnPrimary}>
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        </div>

        {error && <div className={t.alertError}>{error}</div>}
        {message && <div className={t.alertSuccess}>{message}</div>}

        {/* 2FA is required for Portal Login, Delete, Mark Paid and Send Report.
            Without this the admin only ever sees a bare "Forbidden". */}
        {twoFactorEnabled === false && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--amber)] bg-[rgba(245,158,11,0.10)] px-4 py-3">
            <div className="text-sm text-[var(--warn-text)]">
              <strong>Two-factor authentication is not enabled on your account.</strong>{' '}
              <span className="font-semibold">
                Creating a portal login, deleting an affiliate, marking a commission paid and
                sending reports all require a 2FA code.
              </span>
            </div>
            <Link
              to="/dashboard/change-password"
              className="shrink-0 rounded-md bg-[var(--amber)] px-4 py-2 text-sm font-bold text-white hover:brightness-95"
            >
              Set up 2FA
            </Link>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Affiliates', stats.total_affiliates],
            ['Active', `${stats.active_affiliates} (${activeRate}%)`],
            ['Pending ETB', money(stats.total_pending)],
            ['Paid ETB', money(stats.total_paid)],
          ].map(([label, value]) => (
            <div key={String(label)} className={`${t.panel} ${t.panelShadow} p-4`}>
              <div className={t.label}>{label}</div>
              <div className={`${t.figure} mt-2 text-2xl font-bold ${t.fg} sm:text-2xl`}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Reversed + clawback are surfaced separately so a cancelled order
            is visibly excluded from pending/paid rather than silently folded in. */}
        {(Number(stats.total_reversed) > 0 || Number(stats.clawback_pending) > 0) && (
          <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--amber)] bg-[rgba(245,158,11,0.10)] px-4 py-3 text-sm">
            <span className="font-semibold text-[var(--warn-text)]">
              Reversed (excluded from totals): ETB {money(stats.total_reversed)}
            </span>
            <span className="font-semibold text-[var(--warn-text)]">
              Clawback owed: ETB {money(stats.clawback_pending)}
            </span>
          </div>
        )}

        {/* Rule + Reports sit side by side on wide screens and stack on narrow ones.
            Both are narrow, form-heavy panels that do not benefit from — or
            fit — half the page each. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Item 1 — global or per-affiliate commission rules */}
          <PanelErrorBoundary label="Commission rules">
            <CommissionRulePanel
              affiliates={affiliates}
              customRuleCount={customRuleCount}
              onChanged={load}
              onMessage={setMessage}
              onError={setError}
            />
          </PanelErrorBoundary>

          {/* Item 5 — sales & engagement reporting */}
          <PanelErrorBoundary label="Reports">
            <AffiliateReportPanel
              affiliates={affiliates}
              onMessage={setMessage}
              onError={setError}
            />
          </PanelErrorBoundary>
        </div>

        {/* Roster — full width. It is the widest table on the page (8 columns)
            and was previously trapped in a 380px sidebar column. */}
        <PanelErrorBoundary label="Affiliates">
          <AffiliateTable
            affiliates={affiliates}
            loading={loading}
            onChanged={load}
            onMessage={setMessage}
            onError={setError}
          />
        </PanelErrorBoundary>

        {/* Commission ledger — full width, 8 columns. */}
        <PanelErrorBoundary label="Commission movement">
          <CommissionMovementTable
            onMessage={setMessage}
            onError={setError}
            onChanged={load}
          />
        </PanelErrorBoundary>
      </div>
    </DashboardLayout>
  );
};

export default AffiliateControlPage;
