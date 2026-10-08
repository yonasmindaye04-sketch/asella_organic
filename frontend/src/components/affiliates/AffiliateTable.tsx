import React, { useState } from 'react';
import { referrals } from '../../services/api';
import type { AffiliateRow } from '../../pages/AffiliateControlPage';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  affiliates: AffiliateRow[];
  loading: boolean;
  onChanged: () => void | Promise<void>;
  onMessage: (m: string) => void;
  onError: (m: string) => void;
}

const emptyForm = { staff_id: '', full_name: '', email: '', phone: '' };

/**
 * Affiliate roster with three actions per row:
 *   • Deactivate / Activate — reversible, keeps history and referral link
 *   • Delete                 — permanent removal (soft delete server-side)
 *   • Grant portal access    — item 2, creates the affiliate's own login
 *
 * Delete is deliberately separate from Deactivate and requires both a typed
 * confirmation and 2FA. Deactivation remains the everyday control.
 */
const AffiliateTable: React.FC<Props> = ({
  affiliates,
  loading,
  onChanged,
  onMessage,
  onError,
}) => {
  const [newAffiliate, setNewAffiliate] = useState(emptyForm);
  const [saving, setSaving] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AffiliateRow | null>(null);
  const [grantTarget, setGrantTarget] = useState<AffiliateRow | null>(null);
  const [grantResult, setGrantResult] = useState<{ username: string; temporary_password: string } | null>(null);

  const createAffiliate = async () => {
    setSaving('create');
    onError('');
    onMessage('');
    try {
      const body = newAffiliate.staff_id.trim()
        ? { staff_id: newAffiliate.staff_id.trim() }
        : {
            full_name: newAffiliate.full_name.trim(),
            ...(newAffiliate.email.trim() ? { email: newAffiliate.email.trim() } : {}),
            ...(newAffiliate.phone.trim() ? { phone: newAffiliate.phone.trim() } : {}),
          };
      const res = await referrals.create(body);
      if (!res.success) throw new Error(res.error || 'Failed to create affiliate.');
      setNewAffiliate(emptyForm);
      setShowCreate(false);
      onMessage('Affiliate created.');
      await onChanged();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to create affiliate.');
    } finally {
      setSaving('');
    }
  };

  const toggleAffiliate = async (affiliate: AffiliateRow) => {
    setSaving(affiliate.id);
    onError('');
    onMessage('');
    try {
      const nextActive = !affiliate.is_active;
      const res = await referrals.update(affiliate.id, { is_active: nextActive });
      if (!res.success) throw new Error(res.error || 'Failed to update affiliate.');
      onMessage(`${affiliate.full_name} ${nextActive ? 'activated' : 'deactivated'}.`);
      await onChanged();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to update affiliate.');
    } finally {
      setSaving('');
    }
  };

  const deleteAffiliate = async (twoFaToken: string) => {
    if (!deleteTarget) return;
    setSaving(deleteTarget.id);
    onError('');
    onMessage('');
    try {
      const res = await referrals.remove(deleteTarget.id, twoFaToken);
      if (!res.success) throw new Error(res.error || 'Failed to delete affiliate.');
      onMessage(`${deleteTarget.full_name} deleted. Commission history retained.`);
      setDeleteTarget(null);
      await onChanged();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to delete affiliate.');
    } finally {
      setSaving('');
    }
  };

  const grantPortalAccess = async (twoFaToken: string) => {
    if (!grantTarget) return;
    setSaving(grantTarget.id);
    onError('');
    onMessage('');
    try {
      const res = await referrals.grantPortalAccess(grantTarget.id, twoFaToken);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Failed to grant portal access.');
      }
      setGrantResult({
        username: res.data.username,
        temporary_password: res.data.temporary_password,
      });
      setGrantTarget(null);
      await onChanged();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to grant portal access.');
    } finally {
      setSaving('');
    }
  };

  const copyLink = async (affiliate: AffiliateRow) => {
    const link = `${window.location.origin}/?ref=${affiliate.referral_code}`;
    try {
      await navigator.clipboard.writeText(link);
      onMessage(`Referral link for ${affiliate.full_name} copied.`);
    } catch {
      onError('Could not copy to clipboard. Link: ' + link);
    }
  };

  return (
    <>
      {/* Create affiliate */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
            Create Affiliate
          </h2>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="text-xs font-extrabold text-emerald-700 hover:text-emerald-800"
          >
            {showCreate ? 'Hide' : 'New'}
          </button>
        </div>

        {showCreate && (
          <div className="mt-4 grid gap-3">
            <label className="text-xs font-bold text-slate-600">
              Link to Staff Account (Optional UUID)
              <input
                value={newAffiliate.staff_id}
                onChange={e => setNewAffiliate(v => ({ ...v, staff_id: e.target.value }))}
                placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                OR EXTERNAL AFFILIATE
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <label className="text-xs font-bold text-slate-600">
              Full Name
              <input
                value={newAffiliate.full_name}
                onChange={e => setNewAffiliate(v => ({ ...v, full_name: e.target.value }))}
                placeholder="External affiliate name"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Email
              <input
                type="email"
                value={newAffiliate.email}
                onChange={e => setNewAffiliate(v => ({ ...v, email: e.target.value }))}
                placeholder="Required for portal access"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Phone
              <input
                value={newAffiliate.phone}
                onChange={e => setNewAffiliate(v => ({ ...v, phone: e.target.value }))}
                placeholder="Phone"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <p className="text-[10px] italic leading-relaxed text-slate-500">
              The referral code is generated automatically. Portal access is granted
              separately so creating a profile never creates a login on its own.
            </p>

            <button
              onClick={createAffiliate}
              disabled={saving === 'create' || (!newAffiliate.staff_id.trim() && !newAffiliate.full_name.trim())}
              className="mt-2 rounded-lg bg-[#1b3d1e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving === 'create' ? 'Creating...' : 'Create Affiliate'}
            </button>
          </div>
        )}
      </section>

      {/* Roster */}
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Affiliates</h2>
          <span className="text-xs text-slate-500">
            {loading ? 'Loading...' : `${affiliates.length} records`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Affiliate</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Rule</th>
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
                  <td className="px-4 py-3 font-mono font-bold text-emerald-700">
                    {affiliate.referral_code}
                  </td>
                  <td className="px-4 py-3 capitalize">{affiliate.affiliate_type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        affiliate.rule_type === 'custom'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {affiliate.rule_type === 'custom' ? 'Individual' : 'Standard'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{affiliate.total_customers || 0}</td>
                  <td className="px-4 py-3 font-mono">{affiliate.pending_count || 0}</td>
                  <td className="px-4 py-3 font-mono">{affiliate.paid_count || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        onClick={() => copyLink(affiliate)}
                        className="rounded-md px-2 py-1.5 text-xs font-extrabold text-blue-700 hover:text-blue-800"
                      >
                        Copy Link
                      </button>

                      {affiliate.affiliate_type === 'external' && affiliate.identifier && (
                        <button
                          onClick={() => setGrantTarget(affiliate)}
                          className="rounded-md px-2 py-1.5 text-xs font-extrabold text-amber-700 hover:text-amber-800"
                          title="Create a login so this affiliate can view their own dashboard"
                        >
                          Portal Login
                        </button>
                      )}

                      <button
                        onClick={() => toggleAffiliate(affiliate)}
                        disabled={saving === affiliate.id}
                        className={`rounded-md px-2 py-1.5 text-xs font-extrabold disabled:opacity-50 ${
                          affiliate.is_active
                            ? 'text-red-700 hover:text-red-800'
                            : 'text-emerald-700 hover:text-emerald-800'
                        }`}
                      >
                        {affiliate.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        onClick={() => setDeleteTarget(affiliate)}
                        disabled={saving === affiliate.id}
                        className="rounded-md px-2 py-1.5 text-xs font-extrabold text-red-800 hover:bg-red-50 disabled:opacity-50"
                        title="Permanently remove this affiliate (commission history is retained)"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && affiliates.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No affiliates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Delete confirmation — item 3 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete affiliate"
        description={
          deleteTarget
            ? `${deleteTarget.full_name} (${deleteTarget.referral_code}) will be permanently removed from the affiliate list, their portal access will be revoked, and their referral link will stop working. Commission history is retained for your records. This cannot be undone — deactivate instead if you only want to pause them.`
            : ''
        }
        confirmPhrase={deleteTarget?.referral_code}
        confirmLabel="Delete permanently"
        danger
        busy={saving === deleteTarget?.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteAffiliate}
      />

      {/* Grant portal access — item 2 */}
      <ConfirmDialog
        open={grantTarget !== null}
        title="Create portal login"
        description={
          grantTarget
            ? `A login will be created so ${grantTarget.full_name} can view their own dashboard at /affiliate. They will only ever see their own commissions and referral figures. The temporary password is shown once — send it to them securely and ask them to change it on first sign-in.`
            : ''
        }
        confirmLabel="Create login"
        busy={saving === grantTarget?.id}
        onCancel={() => setGrantTarget(null)}
        onConfirm={grantPortalAccess}
      />

      {/* Credentials handoff — shown exactly once */}
      {grantResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-black text-slate-900">Portal login created</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Send these to the affiliate. This is the only time the password will be shown.
            </p>
            <dl className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-sans text-xs font-bold uppercase text-slate-500">Username</dt>
                <dd className="font-bold">{grantResult.username}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-sans text-xs font-bold uppercase text-slate-500">Password</dt>
                <dd className="font-bold break-all text-right">{grantResult.temporary_password}</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setGrantResult(null)}
                className="rounded-lg bg-[#2e7d32] px-4 py-2 text-sm font-bold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AffiliateTable;
