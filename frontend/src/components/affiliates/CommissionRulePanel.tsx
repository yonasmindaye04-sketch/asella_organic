import React, { useCallback, useEffect, useState } from 'react';
import { referrals } from '../../services/api';
import type { AffiliateRow } from '../../pages/AffiliateControlPage';
import * as t from './theme';

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
  t.input;
const labelCls = t.inputLabel;

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
        // null, not omitted: the API treats a missing max_commission as "no cap"
        // and an explicit null as "clear the cap".
        max_commission: form.max_commission ? Number(form.max_commission) : null,
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
    <section className={`${t.panel} ${t.panelShadow} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className={t.label}>
          Commission Rule
        </h2>
        {customRuleCount > 0 && (
          <t.StatusPill tone="custom" label={`${customRuleCount} individual`} />
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
        <p className={`mt-2 rounded-md bg-[var(--bg-deep)] px-3 py-2 text-[11px] leading-relaxed ${t.fgSecondary}`}>
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

        <p className={`text-[10px] italic leading-relaxed ${t.muted}`}>
          {isGlobal
            ? 'The standard rate applies to every affiliate without an individual rule. Changing it does not affect commissions already credited.'
            : 'Applies only to this affiliate. Commissions already credited keep the rate they were calculated at.'}
        </p>

        <button
          onClick={save}
          disabled={saving || loading}
          className={`${t.btnBase} bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--g800)] disabled:opacity-50`}
        >
          {saving ? 'Saving...' : isGlobal ? 'Save Standard Rule' : 'Save Individual Rule'}
        </button>

        {!isGlobal && target?.rule_type === 'custom' && (
          <button
            onClick={resetToStandard}
            disabled={saving}
            className={`${t.btnBase} border-[1.5px] border-[var(--border)] px-4 py-2 text-sm text-[var(--fg-secondary)] hover:border-[var(--border-light)] hover:text-[var(--fg)] disabled:opacity-40`}
          >
            Revert to Standard Rule
          </button>
        )}
      </div>
    </section>
  );
};

export default CommissionRulePanel;
