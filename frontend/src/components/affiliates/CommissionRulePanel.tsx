import React, { useCallback, useEffect, useState } from 'react';
import { referrals } from '../../services/api';
import type { AffiliateRow } from '../../pages/AffiliateControlPage';

interface Props {
  affiliates: AffiliateRow[];
  customRuleCount: number;
  onChanged: () => void | Promise<void>;
  onMessage: (m: string) => void;
  onError: (m: string) => void;
}

interface RuleForm {
  commission_type: 'percentage' | 'fixed';
  commission_value: string;
  min_order_amount: string;
  max_commission: string;
}

const emptyForm: RuleForm = {
  commission_type: 'percentage',
  commission_value: '5',
  min_order_amount: '0',
  max_commission: '',
};

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
const labelCls = 'text-xs font-bold text-slate-600';

/**
 * Coerce an API rule row into form state.
 *
 * mysql2 returns DECIMAL columns as strings and the endpoint may omit fields
 * entirely, so every value is coerced defensively. A missing or malformed
 * number must render as an empty input, never the string "NaN".
 */
const toForm = (r: {
  commission_type?: string;
  commission_value?: number | string | null;
  min_order_amount?: number | string | null;
  max_commission?: number | string | null;
}): RuleForm => {
  const num = (v: unknown): string => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '';
  };
  return {
    commission_type: r.commission_type === 'fixed' ? 'fixed' : 'percentage',
    commission_value: num(r.commission_value),
    min_order_amount: num(r.min_order_amount ?? 0),
    max_commission: r.max_commission == null ? '' : num(r.max_commission),
  };
};

/**
 * Item 1 — commission rules.
 *
 * Scope selector decides whether the form edits the global rule (applied to
 * every affiliate without an individual rate) or one specific affiliate's
 * override. The affiliate list is passed in so the admin can pick a target
 * without leaving the page.
 */
const CommissionRulePanel: React.FC<Props> = ({
  affiliates,
  customRuleCount,
  onChanged,
  onMessage,
  onError,
}) => {
  // 'global' = the standard rule; otherwise a specific affiliate_profile id.
  const [scope, setScope] = useState<string>('global');
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isGlobal = scope === 'global';
  const target = affiliates.find(a => a.id === scope);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isGlobal) {
        const res = await referrals.config();
        const d = res.success ? res.data : null;
        if (!d) { setForm(emptyForm); return; }
        setForm(toForm(d));
      } else {
        const res = await referrals.getRule(scope);
        const d = res.success ? res.data : null;
        if (!d) { setForm(emptyForm); return; }
        // A profile with rule_type 'custom' but no active rule row falls back
        // to the standard rate, so prefill from whichever is actually in force.
        const src = d.rule ?? d.global_rule;
        setForm(src ? toForm(src) : emptyForm);
      }
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to load the commission rule.');
      setForm(emptyForm);
    } finally {
      setLoading(false);
    }
  }, [isGlobal, scope, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    onError('');
    onMessage('');
    try {
      const body = {
        commission_type: form.commission_type,
        commission_value: Number(form.commission_value),
        min_order_amount: Number(form.min_order_amount || 0),
        ...(form.max_commission ? { max_commission: Number(form.max_commission) } : {}),
      };

      if (Number.isNaN(body.commission_value) || body.commission_value <= 0) {
        onError('Commission value must be greater than zero.');
        return;
      }

      const res = isGlobal
        ? await referrals.saveConfig(body)
        : await referrals.saveRule(scope, body);

      if (!res.success) throw new Error(res.error || 'Failed to save commission rule.');
      onMessage(
        isGlobal
          ? 'Standard commission rule updated for all affiliates.'
          : `Individual rule saved for ${target?.full_name ?? 'affiliate'}.`,
      );
      await onChanged();
      await load();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to save commission rule.');
    } finally {
      setSaving(false);
    }
  };

  const resetToStandard = async () => {
    setSaving(true);
    onError('');
    onMessage('');
    try {
      const res = await referrals.clearRule(scope);
      if (!res.success) throw new Error(res.error || 'Failed to revert to the standard rule.');
      onMessage(`${target?.full_name ?? 'Affiliate'} now uses the standard commission rule.`);
      await onChanged();
      await load();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to revert to the standard rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
          Commission Rule
        </h2>
        {customRuleCount > 0 && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-700">
            {customRuleCount} individual
          </span>
        )}
      </div>

      <label className={`${labelCls} mt-4 block`}>
        Applies to
        <select
          value={scope}
          onChange={e => setScope(e.target.value)}
          className={inputCls}
        >
          <option value="global">All affiliates (standard rate)</option>
          {affiliates.map(a => (
            <option key={a.id} value={a.id}>
              {a.full_name} ({a.referral_code})
              {a.rule_type === 'custom' ? ' — individual' : ''}
            </option>
          ))}
        </select>
      </label>

      {!isGlobal && target && (
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          {target.rule_type === 'custom' ? (
            <>
              This affiliate has an <strong>individual rate</strong>. Orders they refer are
              paid at the values below instead of the standard rate.
            </>
          ) : (
            <>
              This affiliate currently uses the <strong>standard rate</strong>. Saving here
              creates an individual rule that overrides it.
            </>
          )}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        <label className={labelCls}>
          Type
          <select
            value={form.commission_type}
            onChange={e =>
              setForm(f => ({ ...f, commission_type: e.target.value as RuleForm['commission_type'] }))
            }
            className={inputCls}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed ETB</option>
          </select>
        </label>

        <label className={labelCls}>
          Value {form.commission_type === 'percentage' ? '(%)' : '(ETB)'}
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.commission_value}
            onChange={e => setForm(f => ({ ...f, commission_value: e.target.value }))}
            className={inputCls}
          />
        </label>

        <label className={labelCls}>
          Minimum Order ETB
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.min_order_amount}
            onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value }))}
            className={inputCls}
          />
        </label>

        <label className={labelCls}>
          Max Commission ETB
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.max_commission}
            onChange={e => setForm(f => ({ ...f, max_commission: e.target.value }))}
            placeholder="No cap"
            className={inputCls}
          />
        </label>

        <p className="text-[10px] italic leading-relaxed text-slate-500">
          {isGlobal
            ? 'The standard rate applies to every affiliate without an individual rule. Changing it does not affect commissions already credited.'
            : 'Applies only to this affiliate. Commissions already credited keep the rate they were calculated at.'}
        </p>

        <button
          onClick={save}
          disabled={saving || loading}
          className="rounded-lg bg-[#2e7d32] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : isGlobal ? 'Save Standard Rule' : 'Save Individual Rule'}
        </button>

        {!isGlobal && target?.rule_type === 'custom' && (
          <button
            onClick={resetToStandard}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Revert to Standard Rule
          </button>
        )}
      </div>
    </section>
  );
};

export default CommissionRulePanel;
