import React, { useCallback, useEffect, useState } from 'react';
import { referrals } from '../../services/api';
import type { AffiliateRow } from '../../pages/AffiliateControlPage';

interface Props {
  affiliates: AffiliateRow[];
  onMessage: (m: string) => void;
  onError: (m: string) => void;
}

interface Recipient {
  id: string;
  referral_code: string;
  name: string;
  email: string | null;
  has_email: boolean;
}

interface ReportRun {
  id: string;
  referral_code: string | null;
  period_start: string;
  period_end: string;
  trigger_type: 'manual' | 'weekly';
  recipient: string | null;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

/** Default window: the last 7 days. */
const defaultRange = (): { from: string; to: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
};

/**
 * Item 5 — sales & engagement reporting.
 *
 * An admin can preview the exact email an affiliate will receive, or send it
 * on demand. A weekly summary also goes out automatically every Monday at
 * 08:00 EAT; the send history below shows both, so it is always clear whether
 * an affiliate has already been emailed for a given week.
 */
const AffiliateReportPanel: React.FC<Props> = ({ affiliates, onMessage, onError }) => {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [mailConfigured, setMailConfigured] = useState(true);
  const [history, setHistory] = useState<ReportRun[]>([]);
  const [selected, setSelected] = useState('');
  const [range, setRange] = useState(defaultRange());
  const [twoFaToken, setTwoFaToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recipientsRes, historyRes] = await Promise.all([
        referrals.recipients(),
        referrals.reportHistory(),
      ]);

      // The endpoint returns { recipients: Recipient[], mail_configured: boolean }
      // inside `data`. Defaults are applied so a malformed or partial payload
      // can never leave `recipients` undefined and crash the render below.
      if (recipientsRes.success) {
        const d = recipientsRes.data as
          | { recipients?: Recipient[]; mail_configured?: boolean }
          | undefined;
        setRecipients(Array.isArray(d?.recipients) ? d!.recipients : []);
        setMailConfigured(d?.mail_configured !== false);
      } else {
        // Surface the failure. Silently showing "0 affiliates" would read as
        // "nobody has portal access" rather than "this request failed".
        onError(recipientsRes.error || 'Failed to load report recipients.');
      }

      if (historyRes.success) {
        setHistory(Array.isArray(historyRes.data) ? (historyRes.data as ReportRun[]) : []);
      } else {
        onError(historyRes.error || 'Failed to load report history.');
      }
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to load report settings.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!twoFaToken.trim()) {
      onError('A 2FA code is required to send reports.');
      return;
    }
    setBusy(true);
    onError('');
    onMessage('');
    try {
      const res = await referrals.sendReports(
        {
          ...(selected ? { affiliate_id: selected } : {}),
          from: range.from,
          to: range.to,
        },
        twoFaToken.trim(),
      );
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to send reports.');

      const d = res.data as { sent: number; results: Array<{ name: string; status: string }> };
      const failed = d.results.filter(r => r.status === 'failed');

      onMessage(
        `Sent ${d.sent} report(s).` +
        (failed.length ? ` ${failed.length} failed: ${failed.map(f => f.name).join(', ')}.` : ''),
      );
      setTwoFaToken('');
      await load();
    } catch (err) {
      const e = err as { message?: string };
      onError(e.message || 'Failed to send reports.');
    } finally {
      setBusy(false);
    }
  };

  const previewUrl = selected
    ? referrals.previewUrl(selected, range.from, range.to)
    : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">
          Sales & Engagement Reports
        </h2>
        <span className="text-[10px] font-extrabold text-slate-400">
          Weekly auto-send: Mon 08:00
        </span>
      </div>

      {!mailConfigured && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
          Email is not configured. Set <code className="font-mono">SMTP_USER</code> and{' '}
          <code className="font-mono">SMTP_PASS</code> to enable sending. Preview still works.
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <label className="text-xs font-bold text-slate-600">
          Send to
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All affiliates with portal access ({recipients.length})</option>
            {recipients.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.referral_code}){r.has_email ? '' : ' — no email'}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-slate-600">
            From
            <input
              type="date"
              value={range.from}
              onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            To
            <input
              type="date"
              value={range.to}
              onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <p className="text-[10px] italic leading-relaxed text-slate-500">
          Reports contain aggregate figures and order references only — never the names or
          contact details of referred customers.
        </p>

        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Preview report
          </a>
        )}

        <label className="text-xs font-bold text-slate-600">
          2FA code
          <input
            value={twoFaToken}
            onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Required to send"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <button
          onClick={send}
          disabled={busy || loading || !mailConfigured || recipients.length === 0}
          className="rounded-lg bg-[#1b3d1e] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Sending...' : selected ? 'Send Report' : 'Send to All'}
        </button>
      </div>

      {/* Send history */}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
          Recent sends
        </h3>
        <div className="mt-2 max-h-56 overflow-y-auto">
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">
              {loading ? 'Loading...' : 'No reports sent yet.'}
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-1.5">Affiliate</th>
                  <th className="py-1.5">Period</th>
                  <th className="py-1.5">Trigger</th>
                  <th className="py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(run => (
                  <tr key={run.id} className="border-t border-slate-100">
                    <td className="py-1.5 font-mono text-[11px]">
                      {run.referral_code ?? '—'}
                      {run.error && (
                        <div className="font-sans text-[10px] text-red-600">{run.error}</div>
                      )}
                    </td>
                    <td className="py-1.5 text-[11px]">
                      {run.period_start} → {run.period_end}
                    </td>
                    <td className="py-1.5 text-[11px] capitalize">{run.trigger_type}</td>
                    <td className="py-1.5">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                          run.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700'
                            : run.status === 'failed'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {affiliates.length > 0 && recipients.length === 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          No affiliates can receive reports yet. Use <strong>Portal Login</strong> on an
          external affiliate to create their login — reports are sent to the address on that
          account.
        </p>
      )}
    </section>
  );
};

export default AffiliateReportPanel;
