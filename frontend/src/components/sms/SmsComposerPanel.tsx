/**
 * src/components/sms/SmsComposerPanel.tsx
 * Asella Organic — SMS broadcast composer
 *
 * Three-phase send flow so every spend is individually approved:
 *
 *   1. Compose   — targeting predicate OR a pasted list, one message body.
 *                  The segment counter is client-side and advisory only;
 *                  the server recomputes it authoritatively.
 *   2. Preview   — POST /api/sms/preview. Free, no provider calls, no writes.
 *                  Shows the exact recipient counts and the cost band.
 *   3. Dispatch  — POST /api/sms/dispatch behind typed confirmation + 2FA.
 *
 * There is no "send once" path that skips the dry run. The two screens are
 * separated on purpose: a preview returned in the same HTTP call as a send
 * would fall over the moment the campaign exceeded memory in the preview.
 */

import React, { useMemo, useState } from 'react';
import * as t from '../affiliates/theme';
import { sms, type SmsPreview, type CustomerSegment, type SmsRecipient } from '../../services/api';
import { calculateSmsSegments, estimateSmsCostEtb, formatCostBand } from '../../utils/smsSegments';
import { useToast } from '../dashboard/DashboardToastProvider';

const SEGMENTS: CustomerSegment[] = ['VIP', 'Loyal', 'Promising', 'At Risk', 'Dormant'];

interface Props {
  onDraftCreated: (campaignId: string) => void;
}

const SmsComposerPanel: React.FC<Props> = ({ onDraftCreated }) => {
  const { showToast } = useToast();

  const [campaignName, setCampaignName] = useState('');
  const [category, setCategory] = useState<'broadcast' | 'marketing'>('broadcast');
  const [useTargeting, setUseTargeting] = useState(true);
  const [segment, setSegment] = useState<CustomerSegment | ''>('');
  const [city, setCity] = useState('');
  const [minOrders, setMinOrders] = useState('');
  const [maxDaysIdle, setMaxDaysIdle] = useState('');
  const [pasted, setPasted] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const [preview, setPreview] = useState<SmsPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const parsedRecipients = useMemo<SmsRecipient[]>(() => {
    if (useTargeting) return [];
    // One "phone[,name]" per line. Server-side JSON.parse is the contract;
    // the backend re-normalizes every number, so this is display-level only.
    return pasted
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [phone, name] = line.split(',').map((s) => s.trim());
        return { phone: phone ?? '' , name };
      });
  }, [pasted, useTargeting]);

  const seg = useMemo(() => calculateSmsSegments(body), [body]);
  const costEstimate = useMemo(() => {
    const recipients = preview?.valid ?? 0;
    return estimateSmsCostEtb(recipients * seg.segmentCount);
  }, [preview, seg.segmentCount]);

  const runPreview = async () => {
    if (!body.trim()) { setError('Write the message first.'); return; }
    if (campaignName.trim().length < 3) { setError('Give the campaign a name first — the dispatch step reads it back to you.'); return; }
    setError('');
    setPreviewing(true);
    try {
      const res = await sms.preview({
        text: body,
        ...(useTargeting
          ? {
              ...(segment ? { segment } : {}),
              ...(city ? { city } : {}),
              ...(minOrders ? { min_orders: Number(minOrders) } : {}),
              ...(maxDaysIdle ? { max_days_idle: Number(maxDaysIdle) } : {}),
            }
          : { recipients: parsedRecipients }),
      });
      if (!res.success || !res.data) {
        setError(res.error ?? 'Preview failed');
        return;
      }
      setPreview(res.data);
    } finally {
      setPreviewing(false);
    }
  };

  const createAndDispatchIntent = async () => {
    setError('');
    setCreating(true);
    try {
      const payload: Record<string, any> = {
        name: campaignName,
        category,
        body,
        scheduled_at: scheduledAt || undefined,
      };

      if (useTargeting) {
        payload.segment = segment || undefined;
        payload.city = city || undefined;
        payload.min_orders = minOrders ? Number(minOrders) : undefined;
        payload.max_days_idle = maxDaysIdle ? Number(maxDaysIdle) : undefined;
      } else {
        payload.recipients = parsedRecipients;
      }

      const res = await sms.createCampaign(payload);
      if (!res.success || !res.data) {
        setError(res.error ?? 'Failed to create campaign');
        return;
      }
      showToast(`Draft created. Review the numbers below, then confirm dispatch on the next screen.`, 'success');
      if (res.data?.id) {
        onDraftCreated(res.data.id);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className={`${t.panel} ${t.panelShadow} p-5`}>
      <h2 className={t.h2}>Compose a broadcast</h2>
      <p className={`${t.muted} text-sm mt-1`}>
        Nothing here calls SMSEthiopia until you confirm dispatch on the next screen.
        Preview costs nothing and writes nothing.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className={t.inputLabel}>
          Campaign name
          <input
            className={t.input}
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="New Year 2026 greeting"
            maxLength={160}
          />
        </label>

        <label className={t.inputLabel}>
          Category
          <select className={t.select} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="broadcast">Broadcast (greetings, notices — no marketing consent required)</option>
            <option value="marketing">Marketing (requires customer opt-in)</option>
          </select>
        </label>

        <label className={t.inputLabel}>
          Schedule (optional)
          <input
            className={t.input}
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <p className={`${t.muted} text-[11px] mt-1`}>
            Leave empty for immediate dispatch. The backend queue honours this; SMSEthiopia has no native scheduling.
          </p>
        </label>

        <div className={t.inputLabel}>
          Recipients
          <div className={`${t.panel} p-2 flex gap-1 rounded-md`}>
            <button
              type="button"
              className={`${t.btnGhost} flex-1 ${useTargeting ? `${t.btnPrimaryBg} text-white` : ''}`}
              onClick={() => setUseTargeting(true)}
            >
              By segment
            </button>
            <button
              type="button"
              className={`${t.btnGhost} flex-1 ${useTargeting ? '' : `${t.btnPrimaryBg} text-white`}`}
              onClick={() => setUseTargeting(false)}
            >
              Paste list
            </button>
          </div>
        </div>
      </div>

      {useTargeting ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <label className={t.inputLabel}>
            Segment
            <select className={t.select} value={segment} onChange={(e) => setSegment(e.target.value as CustomerSegment | '')}>
              <option value="">All</option>
              {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={t.inputLabel}>
            City
            <input className={t.input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Adama" />
          </label>
          <label className={t.inputLabel}>
            Min orders
            <input className={t.input} type="number" min="0" value={minOrders} onChange={(e) => setMinOrders(e.target.value)} placeholder="0" />
          </label>
          <label className={t.inputLabel}>
            Idle ≥ days
            <input className={t.input} type="number" min="0" value={maxDaysIdle} onChange={(e) => setMaxDaysIdle(e.target.value)} placeholder="180" />
          </label>
        </div>
      ) : (
        <label className={`${t.inputLabel} mt-4`}>
          Paste one line per recipient — <span className="font-mono">phone[,name]</span>
          <textarea
            className={`${t.input} font-mono`}
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'0911234567,Abebe\n0711234567,Selam'}
          />
          <p className={`${t.muted} text-[11px] mt-1`}>
            {parsedRecipients.length} line{parsedRecipients.length === 1 ? '' : 's'} parsed. The backend will
            re-validate each number and drop duplicates.
          </p>
        </label>
      )}

      <label className={`${t.inputLabel} mt-4`}>
        Message
        <textarea
          className={t.input}
          rows={5}
          value={body}
          onChange={(e) => { setBody(e.target.value); setPreview(null); }}
          placeholder="Hello {{name}}, ..."
          maxLength={335}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
        <span className={t.muted}>
          Segments <strong className={t.figure}>{seg.segmentCount}</strong>
        </span>
        <span className={t.muted}>
          Chars <strong className={t.figure}>{seg.characterCount}</strong>
        </span>
        <span className={t.muted}>
          Encoding <strong className={t.figure}>{seg.encoding}</strong>
        </span>
        {preview && (
          <span className={t.muted}>
            Est. cost <strong className={t.figure}>{formatCostBand(costEstimate.min, costEstimate.max)}</strong>
          </span>
        )}
      </div>

      {body && seg.encoding === 'UNICODE' && (
        <p className={`${t.warnText} text-[11px] mt-2`}>
          This message is non-Latin (e.g. Amharic), which halves the per-segment budget (70 characters, not 160).
          The cost estimate above already reflects this.
        </p>
      )}

      {error && <div className={`${t.alertError} mt-4`}>{error}</div>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className={t.btnSecondary}
          onClick={() => void runPreview()}
          disabled={previewing || !body.trim()}
        >
          {previewing ? 'Counting…' : 'Preview (free)'}
        </button>
        <button
          type="button"
          className={t.btnPrimary}
          onClick={() => void createAndDispatchIntent()}
          disabled={creating || !body.trim() || campaignName.trim().length < 3}
        >
          {creating ? 'Creating…' : 'Save as draft and continue to confirm'}
        </button>
      </div>

      {preview && (
        <div className={`${t.panel} mt-4 p-4`}>
          <h3 className={t.label}>Dry run — exactly what dispatch would do</h3>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            {[
              { label: 'Would send', value: preview.valid, tone: String(t.status.success) },
              { label: 'Opted out', value: preview.optedOut, tone: String(t.status.error) },
              { label: 'Invalid number', value: preview.invalid, tone: String(t.status.warning) },
              { label: 'Duplicates', value: preview.deduped, tone: String(t.status.neutral) },
              { label: 'No phone on file', value: preview.noPhone, tone: String(t.status.neutral) },
            ].map((kpi) => (
              <div key={kpi.label} className={`${t.panel} p-3`}>
                <p className={`${t.figure} text-2xl font-extrabold ${t.fg}`}>{kpi.value}</p>
                <p className={`${t.label} mt-0.5`} style={{ color: kpi.tone }}>{kpi.label}</p>
              </div>
            ))}
          </div>
          <p className={`${t.muted} text-sm mt-3`}>
            Est. billable segments <strong className={t.figure}>{preview.totalSegments}</strong>
            {' '}({preview.segmentCount} per message) · Est. cost{' '}
            <strong className={t.figure}>{formatCostBand(preview.costMinEtb, preview.costMaxEtb)}</strong>
            {preview.exceedsCampaignLimit && (
              <span style={{ color: 'var(--rose)' }}> — exceeds the {preview.maxCampaignCostEtb} ETB campaign ceiling and will require the cost_override flag at dispatch.</span>
            )}
          </p>
          {preview.samples.length > 0 && (
            <details className="mt-3">
              <summary className={`${t.muted} text-xs cursor-pointer`}>
                Show {preview.samples.length} skipped recipient{preview.samples.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1 text-xs font-mono">
                {preview.samples.map((s) => (
                  <li key={s.phone}>
                    <span className={t.fg}>{s.phone}</span>
                    {s.name && <span className={t.muted}> · {s.name}</span>}
                    {s.reason && <span className={t.muted}> — {s.reason}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
};

export default SmsComposerPanel;