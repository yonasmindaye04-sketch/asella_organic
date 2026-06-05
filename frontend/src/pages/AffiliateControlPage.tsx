import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { api } from '../services/api';

interface AffiliateStats {
  total_affiliates: number;
  active_affiliates: number;
  total_referred_customers: number;
  total_commissions_generated: number;
  total_paid: number;
  total_pending: number;
  pending_count: number;
}

interface Affiliate {
  id: string;
  referral_code: string;
  is_active: boolean | number;
  total_earnings: number;
  total_referrals: number;
  full_name: string;
  identifier: string;
  affiliate_type: 'staff' | 'external';
  total_customers: number;
  total_commissions_amount: number;
  pending_count: number;
  paid_count: number;
}

interface Commission {
  id: string;
  order_id: string;
  commission_amount: number;
  commission_type: string;
  commission_value: number;
  order_total: number;
  status: 'pending' | 'paid';
  calculated_at: string;
  paid_at?: string | null;
  affiliate_name: string;
  referral_code: string;
  customer_name?: string | null;
  customer_phone?: string | null;
}

interface ReferralConfig {
  id?: string;
  commission_type: 'percentage' | 'fixed';
  commission_value: number;
  min_order_amount: number;
  max_commission?: number | null;
}

const emptyStats: AffiliateStats = {
  total_affiliates: 0,
  active_affiliates: 0,
  total_referred_customers: 0,
  total_commissions_generated: 0,
  total_paid: 0,
  total_pending: 0,
  pending_count: 0,
};

const money = (value: unknown) => Number(value || 0).toLocaleString('en-US');

const AffiliateControlPage: React.FC = () => {
  const [stats, setStats] = useState<AffiliateStats>(emptyStats);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [config, setConfig] = useState<ReferralConfig>({
    commission_type: 'percentage',
    commission_value: 5,
    min_order_amount: 0,
    max_commission: undefined,
  });
  const [commissionFilter, setCommissionFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newAffiliate, setNewAffiliate] = useState({
    staff_id: '',
    full_name: '',
    email: '',
    phone: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, affiliateRes, configRes, commissionRes] = await Promise.all([
        api.get<AffiliateStats>('/api/referrals/stats'),
        api.get<Affiliate[]>('/api/referrals/affiliates'),
        api.get<ReferralConfig | null>('/api/referrals/config'),
        api.get<Commission[]>(`/api/referrals/commissions?status=${commissionFilter}&limit=100`),
      ]);

      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (affiliateRes.success && affiliateRes.data) setAffiliates(affiliateRes.data);
      if (configRes.success && configRes.data) {
        setConfig({
          commission_type: configRes.data.commission_type,
          commission_value: Number(configRes.data.commission_value || 0),
          min_order_amount: Number(configRes.data.min_order_amount || 0),
          max_commission: configRes.data.max_commission == null ? undefined : Number(configRes.data.max_commission),
        });
      }
      if (commissionRes.success && commissionRes.data) setCommissions(commissionRes.data);

      const failed = [statsRes, affiliateRes, configRes, commissionRes].find(res => !res.success);
      if (failed) setError(failed.error || 'Some affiliate data could not be loaded.');
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load affiliate dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [commissionFilter]);

  const activeRate = useMemo(() => {
    if (!stats.total_affiliates) return 0;
    return Math.round((stats.active_affiliates / stats.total_affiliates) * 100);
  }, [stats]);

  const saveConfig = async () => {
    setSaving('config');
    setError('');
    setMessage('');
    try {
      const body = {
        commission_type: config.commission_type,
        commission_value: Number(config.commission_value),
        min_order_amount: Number(config.min_order_amount || 0),
        ...(config.max_commission ? { max_commission: Number(config.max_commission) } : {}),
      };
      const res = await api.post<ReferralConfig>('/api/referrals/config', body);
      if (!res.success) throw new Error(res.error || 'Failed to save commission rule.');
      setMessage('Commission rule updated.');
      await load();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to save commission rule.');
    } finally {
      setSaving('');
    }
  };

  const createAffiliate = async () => {
    setSaving('affiliate');
    setError('');
    setMessage('');
    try {
      const body = newAffiliate.staff_id.trim()
        ? { staff_id: newAffiliate.staff_id.trim() }
        : {
            full_name: newAffiliate.full_name.trim(),
            ...(newAffiliate.email.trim() ? { email: newAffiliate.email.trim() } : {}),
            ...(newAffiliate.phone.trim() ? { phone: newAffiliate.phone.trim() } : {}),
          };
      const res = await api.post('/api/referrals/affiliates', body);
      if (!res.success) throw new Error(res.error || 'Failed to create affiliate.');
      setNewAffiliate({ staff_id: '', full_name: '', email: '', phone: '' });
      setMessage('Affiliate created.');
      await load();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to create affiliate.');
    } finally {
      setSaving('');
    }
  };

  const toggleAffiliate = async (affiliate: Affiliate) => {
    setSaving(affiliate.id);
    setError('');
    setMessage('');
    try {
      const nextActive = !Boolean(affiliate.is_active);
      const res = await api.patch(`/api/referrals/affiliates/${affiliate.id}`, { is_active: nextActive });
      if (!res.success) throw new Error(res.error || 'Failed to update affiliate.');
      setMessage(`${affiliate.full_name} ${nextActive ? 'activated' : 'deactivated'}.`);
      await load();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to update affiliate.');
    } finally {
      setSaving('');
    }
  };

  const payCommission = async (commission: Commission) => {
    setSaving(commission.id);
    setError('');
    setMessage('');
    try {
      const res = await api.patch(`/api/referrals/commissions/${commission.id}/pay`, {});
      if (!res.success) throw new Error(res.error || 'Failed to mark commission paid.');
      setMessage(`Commission for ${commission.affiliate_name} marked paid.`);
      await load();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to mark commission paid.');
    } finally {
      setSaving('');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Affiliate Control</h1>
            <p className="text-sm text-slate-500 mt-1">Manage referral codes, commission rules, payouts, and affiliate movement.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-[#1b3d1e] px-4 py-2 text-sm font-bold text-white hover:bg-[#2e7d32]">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ['Affiliates', stats.total_affiliates],
            ['Active', `${stats.active_affiliates} (${activeRate}%)`],
            ['Pending ETB', money(stats.total_pending)],
            ['Paid ETB', money(stats.total_paid)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</div>
              <div className="mt-2 font-mono text-2xl font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
          <div className="flex flex-col gap-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Commission Rule</h2>
              <div className="mt-4 grid gap-3">
                <label className="text-xs font-bold text-slate-600">
                  Type
                  <select value={config.commission_type} onChange={e => setConfig(c => ({ ...c, commission_type: e.target.value as ReferralConfig['commission_type'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed ETB</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Value
                  <input type="number" min="0" value={config.commission_value} onChange={e => setConfig(c => ({ ...c, commission_value: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Minimum Order ETB
                  <input type="number" min="0" value={config.min_order_amount} onChange={e => setConfig(c => ({ ...c, min_order_amount: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Max Commission ETB
                  <input type="number" min="0" value={config.max_commission ?? ''} onChange={e => setConfig(c => ({ ...c, max_commission: e.target.value ? Number(e.target.value) : undefined }))} placeholder="No cap" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <button onClick={saveConfig} disabled={saving === 'config'} className="rounded-lg bg-[#2e7d32] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {saving === 'config' ? 'Saving...' : 'Save Rule'}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Create Affiliate</h2>
              <div className="mt-4 grid gap-3">
                <label className="text-xs font-bold text-slate-600">
                  Link to Staff Account (Optional UUID)
                  <input value={newAffiliate.staff_id} onChange={e => setNewAffiliate(v => ({ ...v, staff_id: e.target.value }))} placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-200"></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">OR EXTERNAL AFFILIATE</span>
                  <div className="h-px flex-1 bg-slate-200"></div>
                </div>
                <label className="text-xs font-bold text-slate-600">
                  Full Name
                  <input value={newAffiliate.full_name} onChange={e => setNewAffiliate(v => ({ ...v, full_name: e.target.value }))} placeholder="External affiliate name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Email
                  <input value={newAffiliate.email} onChange={e => setNewAffiliate(v => ({ ...v, email: e.target.value }))} placeholder="Email" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Phone
                  <input value={newAffiliate.phone} onChange={e => setNewAffiliate(v => ({ ...v, phone: e.target.value }))} placeholder="Phone" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <p className="text-[10px] text-slate-500 italic">Note: The referral code will be automatically generated upon creation.</p>
                <button onClick={createAffiliate} disabled={saving === 'affiliate' || (!newAffiliate.staff_id.trim() && !newAffiliate.full_name.trim())} className="rounded-lg bg-[#1b3d1e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 mt-2">
                  {saving === 'affiliate' ? 'Creating...' : 'Create Affiliate'}
                </button>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Affiliates</h2>
              <span className="text-xs text-slate-500">{loading ? 'Loading...' : `${affiliates.length} records`}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Affiliate</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customers</th>
                    <th className="px-4 py-3">Pending</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliates.map(affiliate => (
                    <tr key={affiliate.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{affiliate.full_name}</div>
                        <div className="text-xs text-slate-500">{affiliate.identifier || 'No identifier'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700">{affiliate.referral_code}</td>
                      <td className="px-4 py-3 capitalize">{affiliate.affiliate_type}</td>
                      <td className="px-4 py-3 font-mono">{affiliate.total_customers || 0}</td>
                      <td className="px-4 py-3 font-mono">{affiliate.pending_count || 0}</td>
                      <td className="px-4 py-3 font-mono">{affiliate.paid_count || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => toggleAffiliate(affiliate)} disabled={saving === affiliate.id} className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${affiliate.is_active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} disabled:opacity-50`}>
                          {affiliate.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Commission Movement</h2>
            <select value={commissionFilter} onChange={e => setCommissionFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="">All</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Affiliate</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Order Total</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map(commission => (
                  <tr key={commission.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{commission.affiliate_name}</div>
                      <div className="font-mono text-xs text-emerald-700">{commission.referral_code}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{commission.order_id}</td>
                    <td className="px-4 py-3">
                      <div>{commission.customer_name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{commission.customer_phone || ''}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{money(commission.order_total)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{money(commission.commission_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${commission.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {commission.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {commission.status === 'pending' ? (
                        <button onClick={() => payCommission(commission)} disabled={saving === commission.id} className="rounded-md bg-[#2e7d32] px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-50">
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">{commission.paid_at ? new Date(commission.paid_at).toLocaleDateString('en-GB') : 'Paid'}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && commissions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">No commission records match this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default AffiliateControlPage;
