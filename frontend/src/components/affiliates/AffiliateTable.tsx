import React, { useState } from 'react';
import { referrals } from '../../services/api';
import type { AffiliateRow } from '../../pages/AffiliateControlPage';
import ConfirmDialog from './ConfirmDialog';
import * as t from './theme';

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

  /**
   * Row actions, shared by the desktop table and the mobile card view so the
   * two can never drift apart.
   */
  const renderActions = (affiliate: AffiliateRow) => (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <button onClick={() => copyLink(affiliate)} className={t.btnGhost}>
        Copy Link
      </button>

      {affiliate.affiliate_type === 'external' && affiliate.identifier && (
        <button
          onClick={() => setGrantTarget(affiliate)}
          className={t.btnSecondary}
          title="Create a login so this affiliate can view their own dashboard"
        >
          Portal Login
        </button>
      )}

      <button
        onClick={() => toggleAffiliate(affiliate)}
        disabled={saving === affiliate.id}
        className={`${t.btnBase} border-[1.5px] px-2.5 py-1.5 text-xs disabled:opacity-50 ${
          affiliate.is_active
            ? 'border-[var(--rose)] text-[var(--rose)] hover:bg-[var(--rose-dim)]'
            : 'border-[var(--border)] text-[var(--muted-ink)] hover:border-[var(--border-light)] hover:text-[var(--fg)]'
        }`}
      >
        {affiliate.is_active ? 'Deactivate' : 'Activate'}
      </button>

      <button
        onClick={() => setDeleteTarget(affiliate)}
        disabled={saving === affiliate.id}
        className={`${t.btnBase} border-[1.5px] px-2.5 py-1.5 text-xs disabled:opacity-50 ${
          affiliate.is_active
            ? 'border-[var(--border)] text-[var(--muted-ink)] hover:border-[var(--rose)] hover:text-[var(--rose)]'
            : 'border-[var(--border)] text-[var(--muted-ink)] hover:border-[var(--rose)] hover:text-[var(--rose)]'
        }`}
        title="Permanently remove this affiliate (commission history is retained)"
      >
        Delete
      </button>
    </div>
  );

  return (
    <>
      {/* Create affiliate */}
      <section className={`${t.panel} ${t.panelShadow} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={t.label}>Create Affiliate</h2>
          <button onClick={() => setShowCreate(v => !v)} className={t.btnGhost}>
            {showCreate ? 'Hide' : 'New'}
          </button>
        </div>

        {showCreate && (
          <div className="mt-4 grid gap-3">
            <label className={t.inputLabel}>
              Link to Staff Account (Optional UUID)
              <input
                value={newAffiliate.staff_id}
                onChange={e => setNewAffiliate(v => ({ ...v, staff_id: e.target.value }))}
                placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                className={t.input}
              />
            </label>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className={`${t.label} text-[var(--muted-ink)]`}>OR EXTERNAL AFFILIATE</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <label className={t.inputLabel}>
              Full Name
              <input
                value={newAffiliate.full_name}
                onChange={e => setNewAffiliate(v => ({ ...v, full_name: e.target.value }))}
                placeholder="External affiliate name"
                className={t.input}
              />
            </label>
            <label className={t.inputLabel}>
              Email
              <input
                type="email"
                value={newAffiliate.email}
                onChange={e => setNewAffiliate(v => ({ ...v, email: e.target.value }))}
                placeholder="Required for portal access"
                className={t.input}
              />
            </label>
            <label className={t.inputLabel}>
              Phone
              <input
                value={newAffiliate.phone}
                onChange={e => setNewAffiliate(v => ({ ...v, phone: e.target.value }))}
                placeholder="Phone"
                className={t.input}
              />
            </label>

            <p className={`${t.label} normal-case tracking-normal italic leading-relaxed`}>
              The referral code is generated automatically. Portal access is granted separately so
              creating a profile never creates a login on its own.
            </p>

            <button
              onClick={createAffiliate}
              disabled={saving === 'create' || (!newAffiliate.staff_id.trim() && !newAffiliate.full_name.trim())}
              className={`${t.btnPrimary} mt-2 px-4 py-2`}
            >
              {saving === 'create' ? 'Creating...' : 'Create Affiliate'}
            </button>
          </div>
        )}
      </section>

      {/* Roster — full width.
          Wide screens get the table; narrow screens get stacked cards, because
          an 8-column table either overflows or squeezes every cell unreadable. */}
      <section className={`${t.panel} ${t.panelShadow} overflow-hidden`}>
        <div
          className={`flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] p-4`}
        >
          <h2 className={t.label}>Affiliates</h2>
          <span className={`${t.label} normal-case tracking-normal`}>
            {loading ? 'Loading...' : `${affiliates.length} record${affiliates.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* ── Table: lg and up ── */}
        <div className="hidden overflow-x-auto lg:block">
          <table className={t.table}>
            <thead>
              <tr>
                <th className={t.th}>Affiliate</th>
                <th className={t.th}>Code</th>
                <th className={t.th}>Type</th>
                <th className={t.th}>Rule</th>
                <th className={`${t.th} text-right`}>Customers</th>
                <th className={`${t.th} text-right`}>Pending</th>
                <th className={`${t.th} text-right`}>Paid</th>
                <th className={`${t.th} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map(affiliate => (
                <tr key={affiliate.id} className={t.tr}>
                  <td className="px-4 py-3">
                    <div className={`font-bold ${t.fg}`}>{affiliate.full_name}</div>
                    <div className={`text-xs ${t.muted}`}>
                      {affiliate.identifier || 'No identifier'}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-[var(--accent)]">
                    {affiliate.referral_code}
                  </td>
                  <td className="px-3 py-3 capitalize">{affiliate.affiliate_type}</td>
                  <td className="px-3 py-3">
                    <t.StatusPill
                      tone={affiliate.rule_type === 'custom' ? 'custom' : 'neutral'}
                      label={affiliate.rule_type === 'custom' ? 'Individual' : 'Standard'}
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{affiliate.total_customers || 0}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{affiliate.pending_count || 0}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{affiliate.paid_count || 0}</td>
                  <td className="px-3 py-3">{renderActions(affiliate)}</td>
                </tr>
              ))}

              {!loading && affiliates.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-[var(--muted-ink)]">
                    No affiliates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Cards: below lg ── */}
        <div className="divide-y divide-[var(--border)] lg:hidden">
          {affiliates.map(affiliate => (
            <article key={affiliate.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`truncate font-bold ${t.fg}`}>{affiliate.full_name}</div>
                  <div className={`truncate text-xs ${t.muted}`}>
                    {affiliate.identifier || 'No identifier'}
                  </div>
                </div>
                <t.StatusPill
                  tone={affiliate.rule_type === 'custom' ? 'custom' : 'neutral'}
                  label={affiliate.rule_type === 'custom' ? 'Individual' : 'Standard'}
                />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                <div>
                  <dt className={t.label}>
                    Code
                  </dt>
                  <dd className={`font-mono font-bold text-[var(--accent)]`}>{affiliate.referral_code}</dd>
                </div>
                <div>
                  <dt className={t.label}>
                    Type
                  </dt>
                  <dd className={`capitalize ${t.fgSecondary}`}>{affiliate.affiliate_type}</dd>
                </div>
                <div>
                  <dt className={t.label}>
                    Customers
                  </dt>
                  <dd className={`font-mono font-bold ${t.fgSecondary}`}>{affiliate.total_customers || 0}</dd>
                </div>
                <div>
                  <dt className={t.label}>
                    Pending / Paid
                  </dt>
                  <dd className={`font-mono font-bold ${t.fgSecondary}`}>
                    {affiliate.pending_count || 0} / {affiliate.paid_count || 0}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 border-t border-[var(--border-strong)] pt-3">{renderActions(affiliate)}</div>
            </article>
          ))}

          {!loading && affiliates.length === 0 && (
            <p className={`px-3 py-10 text-center text-sm ${t.muted}`}>No affiliates yet.</p>
          )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--fg)]/40 p-4 backdrop-blur-[2px]">
          <div className={`w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--sh2)]`}>
            <h3 className={`${t.h2} text-base`}>Portal login created</h3>
            <p className={`mt-2 text-sm leading-relaxed ${t.fgSecondary}`}>
              Send these to the affiliate. This is the only time the password will be shown.
            </p>
            <dl className="mt-4 grid gap-2 rounded-lg bg-[var(--bg-deep)] p-3 font-mono text-sm">
              <div className="flex justify-between gap-4">
                <dt className={`${t.label} font-sans`}>Username</dt>
                <dd className={`font-bold ${t.fg}`}>{grantResult.username}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className={`${t.label} font-sans`}>Password</dt>
                <dd className="break-all text-right font-bold">{grantResult.temporary_password}</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setGrantResult(null)}
                className={`${t.btnPrimary} px-4 py-2`}
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
