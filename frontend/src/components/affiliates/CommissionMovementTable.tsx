import React, { useCallback, useEffect, useState } from 'react';
import { referrals, type CommissionStatus } from '../../services/api';
import type { AdminCommission } from '../../services/api';
import ConfirmDialog from './ConfirmDialog';
import * as t from './theme';

interface Props {
  onMessage: (m: string) => void;
  onError: (m: string) => void;
  onChanged: () => void | Promise<void>;
}

const money = (v: unknown) => Number(v || 0).toLocaleString('en-US');

/**
 * Status colour follows the platform convention (OrderTracking, CustomersPage):
 * a solid colour dot plus bold saturated text on the plain surface. No tinted
 * chip fill — the background stays neutral so the colour carries the signal.
 * `reversed` also gets a line-through because it is struck from the totals.
 */
const statusTone: Record<CommissionStatus, t.StatusTone> = {
  pending: 'pending',
  paid: 'paid',
  reversed: 'reversed',
};

/**
 * The commission ledger.
 *
 * Status is no longer just pending/paid: a commission on an order that was
 * cancelled or returned after delivery shows as 'reversed' (money never left)
 * or carries a clawback flag (money already paid, deducted from the next
 * payout). Reversed rows are excluded from the pending and paid totals on the
 * summary cards above.
 */
const CommissionMovementTable: React.FC<Props> = ({ onMessage, onError, onChanged }) => {
  const [filter, setFilter] = useState<string>('pending');
  const [commissions, setCommissions] = useState<AdminCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reverseTarget, setReverseTarget] = useState<AdminCommission | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [payTarget, setPayTarget] = useState<AdminCommission | null>(null);
  const [twoFaToken, setTwoFaToken] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await referrals.commissions({
        ...(filter ? { status: filter as CommissionStatus } : {}),
        limit: 100,
      });
      if (res.success && res.data) {
        setCommissions(res.data);
      } else {
        onError(res.error || 'Failed to load commissions.');
      }
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to load commissions.');
    } finally {
      setLoading(false);
    }
  }, [filter, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const pay = async (commission: AdminCommission, twoFaToken: string) => {
    setBusyId(commission.id);
    onError('');
    onMessage('');
    try {
      const res = await referrals.markPaid(commission.id, twoFaToken);
      if (!res.success) throw new Error(res.error || 'Failed to mark commission paid.');
      const clawback = Number((res.data as { clawback_applied?: number } | undefined)?.clawback_applied ?? 0);
      onMessage(
        `Commission for ${commission.affiliate_name} marked paid.` +
        (clawback > 0 ? ` A clawback of ETB ${money(clawback)} was deducted.` : ''),
      );
      await load();
      await onChanged();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to mark commission paid.');
    } finally {
      setBusyId('');
    }
  };

  const reverse = async (twoFaToken: string) => {
    if (!reverseTarget) return;
    setBusyId(reverseTarget.id);
    onError('');
    onMessage('');
    try {
      const res = await referrals.reverse(
        reverseTarget.id,
        reverseReason.trim() || 'Manual reversal by administrator',
        twoFaToken,
      );
      if (!res.success) throw new Error(res.error || 'Failed to reverse commission.');
      onMessage(`Commission for ${reverseTarget.affiliate_name} reversed.`);
      setReverseTarget(null);
      setReverseReason('');
      await load();
      await onChanged();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to reverse commission.');
    } finally {
      setBusyId('');
    }
  };

  /**
   * Row actions, shared by the desktop table and the mobile card view so the
   * two cannot drift apart.
   */
  const renderActions = (commission: AdminCommission) => {
    if (commission.status !== 'pending') {
      return (
        <span className={`text-xs ${t.muted}`}>
          {commission.status === 'paid'
            ? (commission.paid_at ? new Date(commission.paid_at).toLocaleDateString('en-GB') : 'Paid')
            : (commission.reversed_at ? new Date(commission.reversed_at).toLocaleDateString('en-GB') : 'Reversed')}
        </span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <button
          onClick={() => setReverseTarget(commission)}
          disabled={busyId === commission.id}
          className={`${t.btnSecondary} disabled:opacity-50`}
        >
          Reverse
        </button>
        <button
          onClick={() => setPayTarget(commission)}
          disabled={busyId === commission.id}
          className={`${t.btnBase} bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--g800)] disabled:opacity-50`}
        >
          Mark Paid
        </button>
      </div>
    );
  };

  return (
    <>
      <section className={`${t.panel} ${t.panelShadow} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-strong)] p-4">
          <div>
            <h2 className={t.label}>
              Commission Movement
            </h2>
            <p className={`mt-0.5 text-[11px] ${t.muted}`}>
              Commissions are credited when an order is delivered. Cancelling or returning
              that order reverses the commission automatically.
            </p>
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className={t.input}
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="reversed">Reversed</option>
            <option value="">All</option>
          </select>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-sm">
            <thead className={t.label}>
              <tr>
                <th className="px-4 py-3">Affiliate</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Order Total</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map(commission => (
                <tr key={commission.id} className={t.tr}>
                  <td className="px-3 py-3">
                    <div className={`${t.fg} font-bold`}>{commission.affiliate_name}</div>
                    <div className={`font-mono text-xs text-[var(--accent)]`}>{commission.referral_code}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {commission.order_id || '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div>{commission.customer_name || 'Unknown'}</div>
                    <div className={`text-xs ${t.muted}`}>{commission.customer_phone || ''}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {money(commission.order_total)}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${t.fg}`}>
                    {money(commission.commission_amount)}
                  </td>
                  <td className="px-3 py-3">
                    <t.StatusPill
                      tone={commission.rule_source === 'individual' ? 'custom' : 'neutral'}
                      label={commission.rule_source === 'individual' ? 'Individual' : 'Standard'}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <t.StatusPill
                      tone={statusTone[commission.status]}
                      label={commission.status}
                      strike={commission.status === 'reversed'}
                    />
                    {Number(commission.clawback_settled) === 1 && commission.status === 'paid' && (
                      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--rose)]">clawback</div>
                    )}
                    {commission.reversal_reason && (
                      <div className={`mt-1 max-w-[180px] text-[10px] leading-snug ${t.muted}`}>
                        {commission.reversal_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{renderActions(commission)}</td>
                </tr>
              ))}

              {!loading && commissions.length === 0 && (
                <tr>
                  <td colSpan={8} className={`px-3 py-10 text-center text-sm ${t.muted}`}>
                    No commission records match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Cards: below lg ── */}
        <div className="divide-y divide-[var(--border)] lg:hidden">
          {commissions.map(commission => (
            <article key={commission.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`truncate font-bold ${t.fg}`}>{commission.affiliate_name}</div>
                  <div className={`truncate font-mono text-xs text-[var(--accent)]`}>
                    {commission.referral_code}
                  </div>
                </div>
                <t.StatusPill
                  tone={statusTone[commission.status]}
                  label={commission.status}
                  strike={commission.status === 'reversed'}
                />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <dt className={t.label}>
                    Order
                  </dt>
                  <dd className={`truncate font-mono text-[11px] ${t.fgSecondary}`}>
                    {commission.order_id || '—'}
                  </dd>
                </div>
                <div>
                  <dt className={t.label}>
                    Order total
                  </dt>
                  <dd className={`font-mono font-bold ${t.fgSecondary}`}>
                    {money(commission.order_total)}
                  </dd>
                </div>
                <div>
                  <dt className={t.label}>
                    Commission
                  </dt>
                  <dd className={`font-mono font-bold ${t.fg}`}>
                    {money(commission.commission_amount)}
                  </dd>
                </div>
              </dl>

              {commission.customer_name && (
                <p className={`mt-2 text-xs ${t.muted}`}>
                  Customer: {commission.customer_name}
                  {commission.customer_phone ? ` · ${commission.customer_phone}` : ''}
                </p>
              )}

              {(commission.reversal_reason || Number(commission.clawback_settled) === 1) && (
                <div className="mt-2 space-y-1">
                  {Number(commission.clawback_settled) === 1 && commission.status === 'paid' && (
                    <div className={`text-[10px] font-bold text-[var(--rose)]`}>clawback</div>
                  )}
                  {commission.reversal_reason && (
                    <div className={`text-[10px] leading-snug ${t.muted}`}>
                      {commission.reversal_reason}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 border-t border-[var(--border-strong)] pt-3">{renderActions(commission)}</div>
            </article>
          ))}

          {!loading && commissions.length === 0 && (
            <p className={`px-3 py-10 text-center text-sm ${t.muted}`}>
              No commission records match this filter.
            </p>
          )}
        </div>
      </section>

      {/* Manual reversal — voids a pending commission that must not be paid */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--fg)]/40 p-4 backdrop-blur-[2px]">
          <div className={`w-full max-w-md rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-5 shadow-[var(--sh2)]`}>
            <h3 className={`${t.h2} text-base`}>Reverse commission</h3>
            <p className={`mt-2 text-sm leading-relaxed ${t.fgSecondary}`}>
              This voids the pending {money(reverseTarget.commission_amount)} ETB commission for{' '}
              {reverseTarget.affiliate_name} on order {reverseTarget.order_id}. It stays in the
              ledger for your records and leaves the pending totals.
            </p>

            <label className={`mt-4 block text-xs font-bold ${t.fgSecondary}`}>
              Reason
              <input
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder="e.g. duplicate referral, order not delivered"
                className={`mt-1 ${t.input}`}
              />
            </label>

            <label className={`mt-3 block text-xs font-bold ${t.fgSecondary}`}>
              2FA code
              <input
                value={twoFaToken}
                onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code from your authenticator"
                className={`mt-1 ${t.input}`}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setReverseTarget(null);
                  setReverseReason('');
                  setTwoFaToken('');
                }}
                className={`${t.btnBase} border-[1.5px] border-[var(--border)] px-4 py-2 text-sm text-[var(--fg-secondary)] hover:border-[var(--border-light)] hover:text-[var(--fg)] disabled:opacity-40`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!twoFaToken.trim()) { onError('A 2FA code is required.'); return; }
                  void reverse(twoFaToken.trim());
                  setTwoFaToken('');
                }}
                disabled={!twoFaToken.trim() || busyId === reverseTarget.id}
                className={`${t.btnBase} bg-[var(--rose)] px-4 py-2 text-sm text-white hover:brightness-95 disabled:opacity-50`}
              >
                Reverse commission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark paid — books a real expense, so it is confirmed with 2FA */}
      <ConfirmDialog
        open={payTarget !== null}
        title="Mark commission as paid"
        description={
          payTarget
            ? `Pay ${money(payTarget.commission_amount)} ETB to ${payTarget.affiliate_name} for order ${payTarget.order_id}. This records an affiliate payout as an expense so it deducts from revenue. Any outstanding clawback for this affiliate is deducted from the net amount.`
            : ''
        }
        confirmLabel="Mark paid"
        busy={busyId === payTarget?.id}
        onCancel={() => setPayTarget(null)}
        onConfirm={(token: string) => {
          if (payTarget) void pay(payTarget, token);
          setPayTarget(null);
        }}
      />
    </>
  );
};

export default CommissionMovementTable;
