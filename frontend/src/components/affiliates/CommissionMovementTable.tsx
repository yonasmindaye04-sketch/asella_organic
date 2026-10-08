import React, { useCallback, useEffect, useState } from 'react';
import { referrals, type CommissionStatus } from '../../services/api';
import type { AdminCommission } from '../../services/api';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  onMessage: (m: string) => void;
  onError: (m: string) => void;
  onChanged: () => void | Promise<void>;
}

const money = (v: unknown) => Number(v || 0).toLocaleString('en-US');

const statusChip: Record<CommissionStatus, string> = {
  pending:  'text-amber-700 bg-amber-50',
  paid:     'text-emerald-700 bg-emerald-50',
  reversed: 'text-slate-500 bg-slate-100 line-through',
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

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
              Commission Movement
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Commissions are credited when an order is delivered. Cancelling or returning
              that order reverses the commission automatically.
            </p>
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="reversed">Reversed</option>
            <option value="">All</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Affiliate</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Order Total</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Rule</th>
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
                  <td className="px-4 py-3 font-mono">{commission.order_id || '—'}</td>
                  <td className="px-4 py-3">
                    <div>{commission.customer_name || 'Unknown'}</div>
                    <div className="text-xs text-slate-500">{commission.customer_phone || ''}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{money(commission.order_total)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">
                    {money(commission.commission_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        commission.rule_source === 'individual'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {commission.rule_source === 'individual' ? 'Individual' : 'Standard'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${statusChip[commission.status]}`}>
                      {commission.status}
                    </span>
                    {Number(commission.clawback_settled) === 1 && commission.status === 'paid' && (
                      <div className="mt-1 text-[10px] font-bold text-red-700">clawback</div>
                    )}
                    {commission.reversal_reason && (
                      <div className="mt-1 max-w-[180px] text-[10px] leading-snug text-slate-500">
                        {commission.reversal_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {commission.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setReverseTarget(commission)}
                          disabled={busyId === commission.id}
                          className="rounded-md px-2 py-1.5 text-xs font-extrabold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Reverse
                        </button>
                        <button
                          onClick={() => setPayTarget(commission)}
                          disabled={busyId === commission.id}
                          className="rounded-md bg-[#2e7d32] px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                      </div>
                    ) : commission.status === 'paid' ? (
                      <span className="text-xs text-slate-500">
                        {commission.paid_at ? new Date(commission.paid_at).toLocaleDateString('en-GB') : 'Paid'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {commission.reversed_at ? new Date(commission.reversed_at).toLocaleDateString('en-GB') : 'Reversed'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {!loading && commissions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No commission records match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manual reversal — voids a pending commission that must not be paid */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-black text-slate-900">Reverse commission</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This voids the pending {money(reverseTarget.commission_amount)} ETB commission for{' '}
              {reverseTarget.affiliate_name} on order {reverseTarget.order_id}. It stays in the
              ledger for your records and leaves the pending totals.
            </p>

            <label className="mt-4 block text-xs font-bold text-slate-600">
              Reason
              <input
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder="e.g. duplicate referral, order not delivered"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="mt-3 block text-xs font-bold text-slate-600">
              2FA code
              <input
                value={twoFaToken}
                onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code from your authenticator"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setReverseTarget(null);
                  setReverseReason('');
                  setTwoFaToken('');
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
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
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
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
        onConfirm={token => {
          if (payTarget) void pay(payTarget, token);
          setPayTarget(null);
        }}
      />
    </>
  );
};

export default CommissionMovementTable;
