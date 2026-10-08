import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { referrals, type AffiliateRuleType } from '../services/api';
import CommissionRulePanel from '../components/affiliates/CommissionRulePanel';
import AffiliateTable from '../components/affiliates/AffiliateTable';
import CommissionMovementTable from '../components/affiliates/CommissionMovementTable';
import AffiliateReportPanel from '../components/affiliates/AffiliateReportPanel';
import PanelErrorBoundary from '../components/affiliates/PanelErrorBoundary';

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

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Affiliate Control</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage referral codes, commission rules, payouts, and affiliate movement.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1b3d1e] px-4 py-2 text-sm font-bold text-white hover:bg-[#2e7d32]"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ['Affiliates', stats.total_affiliates],
            ['Active', `${stats.active_affiliates} (${activeRate}%)`],
            ['Pending ETB', money(stats.total_pending)],
            ['Paid ETB', money(stats.total_paid)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {label}
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>

        {/* Reversed + clawback are surfaced separately so a cancelled order
            is visibly excluded from pending/paid rather than silently folded in. */}
        {(Number(stats.total_reversed) > 0 || Number(stats.clawback_pending) > 0) && (
          <div className="flex flex-wrap gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <span className="font-semibold text-amber-900">
              Reversed (excluded from totals): ETB {money(stats.total_reversed)}
            </span>
            <span className="font-semibold text-amber-900">
              Clawback owed: ETB {money(stats.clawback_pending)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
          <div className="flex flex-col gap-5">
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

            <PanelErrorBoundary label="Affiliates">
              <AffiliateTable
                affiliates={affiliates}
                loading={loading}
                onChanged={load}
                onMessage={setMessage}
                onError={setError}
              />
            </PanelErrorBoundary>
          </div>

          <div className="flex flex-col gap-5">
            {/* Item 5 — sales & engagement reporting */}
            <PanelErrorBoundary label="Reports">
              <AffiliateReportPanel
                affiliates={affiliates}
                onMessage={setMessage}
                onError={setError}
              />
            </PanelErrorBoundary>
          </div>
        </div>

        {/* Commission ledger */}
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
