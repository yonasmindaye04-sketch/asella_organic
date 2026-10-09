/**
 * frontend/src/pages/CustomersPage.tsx
 * Customer insights — value score, segments, and a per-customer
 * movement timeline.
 *
 * Three tabs share one page:
 *   Customers  the ranked list, filterable by segment / score / city
 *   Segments   portfolio breakdown + who the best customers are
 *   Activity   a cross-customer feed of every recorded movement
 *
 * The score comes from the backend view (vw_customer_insights) and is
 * accompanied by its own components so the number is explainable
 * rather than an oracle.
 *
 * Visual language mirrors OrderTracking (ink #141c15, muted #607d66,
 * hairline #ddeedd, accent #2e7d32) so the two pages read as one product.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { customers as customersApi } from '../services/api';
import type {
  CustomerActivity,
  CustomerActivityType,
  CustomerDetail,
  CustomerListItem,
  CustomerSegment,
  CustomerSummary,
} from '../services/api';

// Platform design tokens, matching OrderTracking so the pages read as one
// product. Applied as literal hex in classNames (Tailwind arbitrary values),
// so only the ones referenced from JS are declared here.
const MUTED = '#607d66';

const STATUS_COLOR: Record<string, string> = {
  'Delivered':  '#2e7d32',
  'Confirmed':  '#1565c0',
  'Packed':     '#6a1b9a',
  'In Transit': '#0277bd',
  'Processing': '#1565c0',
  'Pending':    '#f59e0b',
  'Cancelled':  '#c62828',
  'Returned':   '#ef6c00',
  'Issue':      '#ef6c00',
};

/** Section heading with the trailing hairline, as used across the platform. */
const SectionLabel: React.FC<{ icon: string; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] flex items-center gap-1.5 mb-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#ddeedd]">
    <span className="material-symbols-outlined text-[#2e7d32] text-[14px]">{icon}</span>
    {children}
  </div>
);

// ─── Presentation config ─────────────────────────────────────────────────────

const SEGMENT_CONFIG: Record<CustomerSegment, { label: string; color: string }> = {
  'VIP':       { label: 'VIP',       color: '#b45309' },
  'Loyal':     { label: 'Loyal',     color: '#2e7d32' },
  'Promising': { label: 'Promising', color: '#1565c0' },
  'At Risk':   { label: 'At Risk',   color: '#ef6c00' },
  'Dormant':   { label: 'Dormant',   color: '#607d66' },
};

// Status indicators follow the platform rule (OrderTracking): a solid colour
// dot plus bold, fully saturated text on the plain surface. No tinted chip
// fill — the background stays neutral so the colour itself carries the signal.
const ACTIVITY_CONFIG: Record<CustomerActivityType, { icon: string; label: string; color: string }> = {
  'sale':           { icon: 'shopping_cart',      label: 'Sale',       color: '#2e7d32' },
  'status_change':  { icon: 'local_shipping',    label: 'Status',     color: '#1565c0' },
  'return':         { icon: 'assignment_return', label: 'Return',     color: '#ef6c00' },
  'cancellation':   { icon: 'cancel',            label: 'Cancelled',  color: '#c62828' },
  'payment':        { icon: 'payments',          label: 'Payment',    color: '#2e7d32' },
  'note':           { icon: 'sticky_note_2',     label: 'Note',       color: '#6a1b9a' },
  'rating':         { icon: 'star',              label: 'Rating',     color: '#b45309' },
  'profile_update': { icon: 'edit',              label: 'Profile',    color: '#607d66' },
};

const scoreColor = (score: number) =>
  score >= 80 ? '#b45309' : score >= 60 ? '#2e7d32' : score >= 40 ? '#1565c0' : score >= 20 ? '#ef6c00' : '#9e9e9e';

const formatCurrency = (n: number) =>
  `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB`;

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** Star rating as a compact row, supporting halves for the average. */
const Stars: React.FC<{ value: number; size?: string }> = ({ value, size = '14px' }) => (
  <span className="inline-flex items-center gap-0.5" title={`${Number(value).toFixed(1)} / 5`}>
    {[1, 2, 3, 4, 5].map(n => (
      <span
        key={n}
        className="material-symbols-outlined leading-none"
        style={{
          fontSize: size,
          color: value >= n ? '#f59e0b' : value >= n - 0.5 ? '#fcd34d' : '#d4ecd4',
        }}
      >
        star
      </span>
    ))}
  </span>
);

const SegmentBadge: React.FC<{ segment: CustomerSegment }> = ({ segment }) => {
  const cfg = SEGMENT_CONFIG[segment] ?? SEGMENT_CONFIG.Dormant;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-wider whitespace-nowrap"
      style={{ color: cfg.color }}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
};

const ScoreBar: React.FC<{ score: number }> = ({ score }) => (
  <div className="flex items-center gap-2">
    <span className="font-extrabold tabular-nums text-[15px] font-mono" style={{ color: scoreColor(score) }}>
      {Math.round(score)}
    </span>
    <div className="w-14 h-1.5 rounded-full bg-[#ddeedd] overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(3, Math.min(100, score))}%`, background: scoreColor(score) }}
      />
    </div>
  </div>
);

// ─── Customer detail drawer ───────────────────────────────────────────────────
//
// Rendered through a portal on document.body. DashboardLayout puts page
// children inside `main.relative.z-[1]`, and that positioning creates a
// stacking context: anything inside it — however high its z-index — paints
// below the sticky TopHeader (z-40) that sits outside it. Portalling to body
// escapes that context, which is what stops the panel header being clipped.

interface DetailDrawerProps {
  customerId: string | null;
  onClose: () => void;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({ customerId, onClose }) => {
  const [detail, setDetail]     = useState<CustomerDetail | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const [note, setNote]         = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [stars, setStars]       = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [flash, setFlash]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      const res = await customersApi.get(customerId);
      if (res.success && res.data) setDetail(res.data);
      else setError(res.error ?? 'Failed to load customer');
    } catch {
      setError('Failed to load customer');
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    setDetail(null);
    setNote('');
    setStars(0);
    setRatingComment('');
    setFlash(null);
    if (customerId) load();
  }, [customerId, load]);

  // Escape closes, consistent with the rest of the dashboard.
  useEffect(() => {
    if (!customerId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customerId, onClose]);

  // Lock the page behind the panel so the list cannot scroll underneath.
  useEffect(() => {
    if (!customerId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [customerId]);

  const handleAddNote = async () => {
    if (!customerId || !note.trim()) return;
    setNoteBusy(true);
    const res = await customersApi.addNote(customerId, note.trim());
    setNoteBusy(false);
    if (res.success) { setNote(''); setFlash('Note added'); load(); }
    else setError(res.error ?? 'Failed to add note');
  };

  const handleRate = async () => {
    if (!customerId || stars === 0) return;
    setRatingBusy(true);
    const res = await customersApi.rate(customerId, { stars, comment: ratingComment.trim() || undefined });
    setRatingBusy(false);
    if (res.success) { setStars(0); setRatingComment(''); setFlash('Rating saved'); load(); }
    else setError(res.error ?? 'Failed to save rating');
  };

  if (!customerId) return null;

  const inputCls =
    'w-full px-2.5 py-2 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[13px] text-[#141c15] outline-none focus:border-[#2e7d32] placeholder-[#607d66]';
  const btnCls =
    'px-3.5 py-2 bg-[#2e7d32] text-white rounded-md text-[12px] font-extrabold transition-colors hover:bg-[#256428] disabled:opacity-40';

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full md:w-[440px] bg-white border-l border-[#ddeedd] shadow-2xl flex flex-col">
        {/* Header — shrink-0 so the identity stays put while the body scrolls */}
        <div className="flex items-start justify-between p-4 border-b border-[#ddeedd] shrink-0 gap-2 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#e8f5e9] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px] text-[#2e7d32]">person</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-extrabold text-[#141c15] truncate leading-tight">
                {detail?.name ?? 'Loading...'}
              </h3>
              <p className="text-[12px] text-[#607d66] font-mono font-semibold truncate">{detail?.phone ?? ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[25px] h-[25px] rounded-md border-[1.5px] border-[#ddeedd] bg-white flex items-center justify-center text-[14px] text-[#607d66] transition-colors hover:bg-red-100 hover:border-red-500 hover:text-red-500 shrink-0"
            aria-label="Close customer details"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
              <span className="material-symbols-outlined animate-spin text-[28px]">sync</span>
              <p className="text-xs">Loading customer...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-3 bg-red-100 border-[1.5px] border-red-500 rounded-lg text-red-800 text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span> {error}
            </div>
          )}

          {!loading && detail && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <SegmentBadge segment={detail.segment} />
                {detail.avg_stars > 0 && (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#f7faf7] border border-[#ddeedd]">
                    <Stars value={detail.avg_stars} size="13px" />
                    <span className="text-[11px] text-[#141c15] font-extrabold">
                      {detail.avg_stars.toFixed(1)} ({detail.rating_count})
                    </span>
                  </span>
                )}
                {detail.is_telegram === 1 && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#f7faf7] border border-[#ddeedd] text-[11px] font-extrabold uppercase tracking-wider" style={{ color: '#1565c0' }}>
                    <span className="material-symbols-outlined text-[13px]">telegram</span>
                    Telegram
                  </span>
                )}
              </div>

              {flash && (
                <div className="p-2.5 rounded-lg bg-[#e8f5e9] border border-[#c8e6c9] text-[#2e7d32] text-[12px] font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span> {flash}
                </div>
              )}

              {/* Value score breakdown */}
              <div>
                <SectionLabel icon="speed">Value Score</SectionLabel>
                <div className="bg-[#f1f8f1] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[26px] font-black text-[#2e7d32] font-mono leading-none">
                      {detail.value_score}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66]">
                      {detail.segment}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Recency',   value: detail.recency_score,  max: 30 },
                      { label: 'Frequency', value: detail.frequency_score, max: 30 },
                      { label: 'Monetary',  value: detail.monetary_score, max: 30 },
                      { label: 'Penalty',   value: detail.penalty_score,  max: 0 },
                    ].map(c => (
                      <div key={c.label} className="bg-white rounded-md py-2.5 px-1 text-center border border-[#ddeedd]">
                        <div className={`text-[15px] font-extrabold font-mono ${c.value < 0 ? 'text-[#c62828]' : 'text-[#141c15]'}`}>
                          {c.value > 0 ? `+${c.value}` : c.value}
                        </div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] mt-0.5">{c.label}</div>
                        {c.max > 0 && <div className="text-[10px] text-[#607d66] font-mono font-semibold">/ {c.max}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Headline stats */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Net',     value: formatCurrency(detail.net_value) },
                  { label: 'Orders',  value: String(detail.order_count) },
                  { label: 'Returns', value: String(detail.returned_count) },
                  { label: 'Units',   value: String(detail.total_units) },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-[#ddeedd] rounded-lg p-2.5 text-center">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66]">{s.label}</div>
                    <div className="text-[15px] font-extrabold text-[#141c15] font-mono truncate mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Contact */}
              <div>
                <SectionLabel icon="badge">Contact</SectionLabel>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {([
                    ['City',           detail.city],
                    ['Location',       detail.location],
                    ['Email',          detail.email],
                    ['Gender',         detail.gender],
                    ['Age group',      detail.age_group],
                    ['Referred by',    detail.affiliate_name],
                    ['Customer since', formatDate(detail.customer_since)],
                    ['Last order',     formatDate(detail.last_order_at)],
                  ] as Array<[string, string | null | undefined]>).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[#607d66] mb-0.5">{label}</label>
                      <span className="text-[13.5px] text-[#141c15] font-bold block overflow-hidden text-ellipsis whitespace-nowrap">
                        {value || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent orders */}
              {detail.orders.length > 0 && (
                <div>
                  <SectionLabel icon="receipt_long">Recent Orders ({detail.orders.length})</SectionLabel>
                  <div className="border border-[#ddeedd] rounded-lg overflow-hidden">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr>
                          {['Order', 'Status', 'Total'].map((h, i) => (
                            <th key={h} className={`py-1.5 px-2 bg-[#f1f8f1] text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] ${i === 2 ? 'text-right' : 'text-left'}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.orders.slice(0, 8).map(o => (
                          <tr key={o.id} className="border-b border-[#ddeedd] last:border-0">
                            <td className="py-1.5 px-2 font-mono text-[11px] text-[#141c15]">{o.id}</td>
                            <td className="py-1.5 px-2">
                              <span className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: STATUS_COLOR[o.status] ?? MUTED }}>
                                {o.status}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-extrabold text-[#2e7d32]">
                              {formatCurrency(o.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top products */}
              {detail.products.length > 0 && (
                <div>
                  <SectionLabel icon="inventory_2">Top Products</SectionLabel>
                  <div className="border border-[#ddeedd] rounded-lg overflow-hidden">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr>
                          {['Product', 'Qty', 'Spent'].map((h, i) => (
                            <th key={h} className={`py-1.5 px-2 bg-[#f1f8f1] text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] ${i === 0 ? 'text-left' : 'text-right'}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.products.slice(0, 5).map(p => (
                          <tr key={`${p.item_name}-${p.package_size}`} className="border-b border-[#ddeedd] last:border-0">
                            <td className="py-1.5 px-2 text-[#141c15]">
                              {p.item_name}
                              <span className="text-[10px] text-[#607d66]"> / {p.package_size}</span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-[#141c15]">{p.units_bought}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-extrabold text-[#2e7d32]">
                              {formatCurrency(p.amount_spent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Add rating */}
              <div>
                <SectionLabel icon="star">Add Rating</SectionLabel>
                <div className="flex items-center gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setStars(n)}
                      className="p-1 rounded transition-colors hover:bg-[#f1f8f1]"
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    >
                      <span className="material-symbols-outlined text-[24px] leading-none" style={{ color: stars >= n ? '#f59e0b' : '#d4ecd4' }}>
                        star
                      </span>
                    </button>
                  ))}
                  {stars > 0 && <span className="text-[11px] text-[#607d66] font-bold ml-2">{stars}/5</span>}
                </div>
                <input
                  type="text"
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  placeholder="Optional comment..."
                  className={`${inputCls} mb-2`}
                />
                <button onClick={handleRate} disabled={stars === 0 || ratingBusy} className={btnCls}>
                  {ratingBusy ? 'Saving...' : 'Save Rating'}
                </button>
              </div>

              {/* Add note */}
              <div>
                <SectionLabel icon="sticky_note_2">Add Note</SectionLabel>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Call attempted, prefers WhatsApp..."
                  rows={2}
                  className={`${inputCls} mb-2 resize-none`}
                />
                <button onClick={handleAddNote} disabled={!note.trim() || noteBusy} className={btnCls}>
                  {noteBusy ? 'Adding...' : 'Add Note'}
                </button>
              </div>

              {/* Movement timeline */}
              <div>
                <SectionLabel icon="history">Movement Timeline ({detail.activity.length})</SectionLabel>
                {detail.activity.length === 0 ? (
                  <p className="text-[12px] text-[#607d66] py-4 text-center">No recorded movements yet.</p>
                ) : (
                  <ol className="relative border-l-2 border-[#ddeedd] ml-3 space-y-3">
                    {detail.activity.map(item => {
                      const cfg = ACTIVITY_CONFIG[item.activity_type] ?? ACTIVITY_CONFIG.note;
                      return (
                        <li key={item.id} className="ml-5 relative">
                          <span
                            className="absolute -left-[31px] top-0 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 border-white bg-[#f7faf7]"
                            style={{ color: cfg.color }}
                          >
                            <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
                          </span>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[13px] font-extrabold text-[#141c15]">{item.title}</p>
                              {item.detail && <p className="text-[12px] text-[#607d66] mt-0.5 break-words">{item.detail}</p>}
                              <p className="text-[11px] text-[#607d66] mt-0.5 font-medium">
                                {formatDateTime(item.created_at)}
                                {item.actor_name && ` / ${item.actor_name}`}
                              </p>
                            </div>
                            { item.amount !== null && (
                              <span className={`text-[13px] font-mono font-extrabold whitespace-nowrap ${item.amount < 0 ? 'text-[#c62828]' : 'text-[#2e7d32]'}`}>
                                {item.amount < 0 ? '' : '+'}{formatCurrency(item.amount)}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'customers' | 'segments' | 'activity';

const CustomersPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('customers');

  const [list, setList]       = useState<CustomerListItem[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [segment, setSegment]           = useState('');
  const [city, setCity]                 = useState('');
  const [minScore, setMinScore]         = useState('');
  const [returnedOnly, setReturnedOnly] = useState(false);
  const [sort, setSort]                 = useState('value_score');
  const [page, setPage]                 = useState(1);

  const [meta, setMeta]       = useState({ total: 0, pages: 0 });
  const [selected, setSelected] = useState<string | null>(null);

  // Debounce the search box so typing does not fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await customersApi.list({
        page,
        limit: 25,
        search: search || undefined,
        segment: (segment || undefined) as never,
        city: city || undefined,
        min_score: minScore ? Number(minScore) : undefined,
        returned_only: returnedOnly || undefined,
        sort,
      });
      if (res.success && res.data) {
        setList(res.data);
        setMeta({ total: res.meta?.total ?? res.data.length, pages: res.meta?.pages ?? 1 });
      } else {
        setError(res.error ?? 'Failed to load customers');
      }
    } catch {
      setError('Failed to load customers');
    }
    setLoading(false);
  }, [page, search, segment, city, minScore, returnedOnly, sort]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    customersApi.summary()
      .then(res => { if (res.success && res.data) setSummary(res.data); })
      .catch(() => { /* KPIs are non-critical */ });
  }, []);

  const hasFilters = Boolean(search || segment || city || minScore || returnedOnly);

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setSegment(''); setCity('');
    setMinScore(''); setReturnedOnly(false); setPage(1);
  };

  const segmentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    summary?.segments.forEach(s => { map[s.segment] = s.customers; });
    return map;
  }, [summary]);

  const inputCls =
    'w-full px-3 py-2 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[13px] text-[#141c15] outline-none focus:border-[#2e7d32] placeholder-[#607d66]';
  const labelCls = 'block text-[11px] font-extrabold uppercase tracking-wider text-[#607d66] mb-1.5';

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-[#f7faf7]">

        {/* Page header */}
        <div className="shrink-0 px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#141c15]">Customers</h1>
            <p className="text-sm text-[#607d66] mt-1">Every customer movement and how valuable each one is.</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#e8f5e9] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px] text-[#2e7d32]">groups</span>
          </div>
        </div>

        {/* KPI row */}
        <div className="shrink-0 px-5 pb-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { label: 'Total Customers', icon: 'group',         value: summary ? String(summary.total_customers) : '...', tone: '#2e7d32' },
            { label: 'Lifetime Value',  icon: 'savings',       value: summary ? formatCurrency(summary.total_net_value) : '...', tone: '#2e7d32' },
            { label: 'Average Score',   icon: 'speed',         value: summary ? `${summary.avg_score}/100` : '...', tone: '#1565c0' },
            { label: 'Churning (90d+)',  icon: 'trending_down', value: summary ? String(summary.churning) : '...', tone: '#c62828' },
          ].map(card => (
            <div key={card.label} className="bg-white border border-[#ddeedd] rounded-lg p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm" style={{ background: card.tone, color: '#fff' }}>
                <span className="material-symbols-outlined text-[18px]">{card.icon}</span>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#607d66] truncate">{card.label}</div>
                <div className="text-2xl font-extrabold text-[#141c15] font-mono tabular-nums leading-tight truncate">{card.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="shrink-0 px-5 border-b border-[#ddeedd]">
          <div className="flex gap-5">
            {([
              ['customers', 'Customers'],
              ['segments',  'Segments'],
              ['activity',  'Activity'],
            ] as Array<[Tab, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`pb-2 text-sm font-extrabold border-b-2 -mb-px transition-colors ${
                  tab === key ? 'border-[#2e7d32] text-[#2e7d32]' : 'border-transparent text-[#607d66] hover:text-[#141c15]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">

          {/* ── Customers tab ── */}
          {tab === 'customers' && (
            <>
              <div className="bg-white border border-[#ddeedd] rounded-lg p-3 mb-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[170px]">
                    <label className={labelCls}>Search</label>
                    <input type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                      placeholder="Name, phone, email..." className={inputCls} />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className={labelCls}>Segment</label>
                    <select value={segment} onChange={e => { setSegment(e.target.value); setPage(1); }} className={inputCls}>
                      <option value="">All Segments</option>
                      {(Object.keys(SEGMENT_CONFIG) as CustomerSegment[]).map(s => (
                        <option key={s} value={s}>
                          {SEGMENT_CONFIG[s].label}{segmentCounts[s] ? ` (${segmentCounts[s]})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className={labelCls}>City</label>
                    <input type="text" value={city} onChange={e => { setCity(e.target.value); setPage(1); }}
                      placeholder="Addis Ababa" className={inputCls} />
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <label className={labelCls}>Min Score</label>
                    <input type="number" min={0} max={100} value={minScore}
                      onChange={e => { setMinScore(e.target.value); setPage(1); }} placeholder="0" className={inputCls} />
                  </div>
                  <div className="flex items-center gap-2 pb-2 min-w-[120px]">
                    <input type="checkbox" id="returnedOnly" checked={returnedOnly}
                      onChange={e => { setReturnedOnly(e.target.checked); setPage(1); }}
                      className="rounded border-[#ddeedd] text-[#2e7d32] focus:ring-[#2e7d32]" />
                    <label htmlFor="returnedOnly" className="text-[12px] font-bold text-[#607d66] cursor-pointer">Returns only</label>
                  </div>
                  {hasFilters && (
                    <button onClick={clearFilters}
                      className="px-3 py-2 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[12px] font-extrabold text-[#607d66] hover:text-[#141c15] hover:border-[#c8e6c9] transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#ddeedd] rounded-lg overflow-hidden">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
                    <span className="material-symbols-outlined animate-spin text-[26px]">sync</span>
                    <p className="text-xs">Loading customers...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
                    <span className="material-symbols-outlined text-[30px] text-red-400">error</span>
                    <p className="text-xs">{error}</p>
                  </div>
                ) : list.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
                    <span className="material-symbols-outlined text-[32px] opacity-25">person_search</span>
                    <p className="text-xs">{hasFilters ? 'No customers match your filters' : 'No customers yet'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] border-collapse text-[13px]">
                      <thead>
                        <tr>
                          {([
                            ['Customer', null],
                            ['Segment', null],
                            ['Score',    'value_score'],
                            ['Orders',   'order_count'],
                            ['Net Value','net_value'],
                            ['Returns',  null],
                            ['Stars',    'avg_stars'],
                            ['Last Order','last_order_at'],
                          ] as Array<[string, string | null]>).map(([label, sortKey]) => (
                            <th key={label}
                              className="text-left py-2.5 px-3 bg-[#f1f8f1] text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] whitespace-nowrap">
                              {sortKey ? (
                                <button onClick={() => setSort(sortKey)}
                                  className={`inline-flex items-center gap-1 hover:text-[#2e7d32] ${sort === sortKey ? 'text-[#2e7d32]' : ''}`}>
                                  {label}
                                  {sort === sortKey && (
                                    <span className="material-symbols-outlined text-[11px]">arrow_downward</span>
                                  )}
                                </button>
                              ) : label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(c => (
                          <tr key={c.customer_id} onClick={() => setSelected(c.customer_id)}
                            className="bg-white border-b border-[#ddeedd] cursor-pointer transition-colors hover:bg-[#f1f8f1]">
                            <td className="px-3 py-3">
                              <div className="font-extrabold text-[#141c15] text-[13.5px] truncate">{c.name}</div>
                              <div className="text-[12px] text-[#607d66] font-mono font-medium">
                                {c.phone}{c.city ? ` / ${c.city}` : ''}
                              </div>
                            </td>
                            <td className="px-3 py-3"><SegmentBadge segment={c.segment} /></td>
                            <td className="px-3 py-3"><ScoreBar score={c.value_score} /></td>
                            <td className="px-3 py-3 text-[#141c15] font-mono font-bold text-[13.5px]">
                              {c.order_count}
                              {c.open_count > 0 && <span className="ml-1 text-[11px] text-[#ef6c00] font-extrabold">({c.open_count} open)</span>}
                            </td>
                            <td className="px-3 py-3 font-mono font-extrabold text-[13.5px] text-[#141c15]">{formatCurrency(c.net_value)}</td>
                            <td className="px-3 py-3 text-[13.5px]">
                              {c.returned_count > 0
                                ? <span className="text-[#ef6c00] font-extrabold">{c.returned_count}</span>
                                : <span className="text-[#607d66]">-</span>}
                            </td>
                            <td className="px-3 py-3">
                              {c.avg_stars > 0 ? <Stars value={c.avg_stars} size="13px" /> : <span className="text-[12px] text-[#607d66]">-</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-[#607d66] font-medium whitespace-nowrap">{formatDate(c.last_order_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {meta.pages > 1 && (
                  <div className="flex items-center justify-between px-3 py-2.5 border-t border-[#ddeedd] bg-[#f7faf7]">
                    <span className="text-[11px] text-[#607d66] font-medium">
                      Page {page} of {meta.pages} / {meta.total} customers
                    </span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                        className="px-2.5 py-1 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[11px] font-extrabold text-[#607d66] disabled:opacity-40 hover:text-[#141c15]">
                        Prev
                      </button>
                      <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page >= meta.pages}
                        className="px-2.5 py-1 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[11px] font-extrabold text-[#607d66] disabled:opacity-40 hover:text-[#141c15]">
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Segments tab ── */}
          {tab === 'segments' && (
            <div className="grid lg:grid-cols-2 gap-3">
              <div className="bg-white border border-[#ddeedd] rounded-lg p-4">
                <SectionLabel icon="donut_small">Customer Segments</SectionLabel>
                {!summary?.segments.length ? (
                  <p className="text-xs text-[#607d66] py-6 text-center">No segment data yet.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.segments.map(s => {
                      const cfg = SEGMENT_CONFIG[s.segment] ?? SEGMENT_CONFIG.Dormant;
                      const max = Math.max(...summary.segments.map(x => x.customers), 1);
                      return (
                        <div key={s.segment}>
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <SegmentBadge segment={s.segment} />
                            <span className="text-[11.5px] text-[#607d66] font-semibold truncate">
                              {s.customers} customers / avg {s.avg_score} / {formatCurrency(s.net_value)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[#f1f8f1] overflow-hidden">
                            <div className="h-full rounded-full" style={{ background: cfg.color, width: `${(s.customers / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-[#ddeedd] rounded-lg p-4">
                <SectionLabel icon="workspace_premium">Most Valuable Customers</SectionLabel>
                {!summary?.top_customers.length ? (
                  <p className="text-xs text-[#607d66] py-6 text-center">No ranked customers yet.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {summary.top_customers.map((c, i) => (
                      <li key={c.customer_id} onClick={() => setSelected(c.customer_id)}
                        className="flex items-center gap-2.5 p-2 rounded-md hover:bg-[#f1f8f1] cursor-pointer transition-colors">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                          i === 0 ? 'bg-[#f59e0b] text-white'
                          : i === 1 ? 'bg-[#9e9e9e] text-white'
                          : i === 2 ? 'bg-[#ef6c00] text-white'
                          : 'bg-[#f1f8f1] text-[#607d66]'
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-extrabold text-[#141c15] truncate">{c.name}</div>
                          <div className="text-[12px] text-[#607d66] font-medium">{c.order_count} orders / {formatCurrency(c.net_value)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <SegmentBadge segment={c.segment} />
                          <ScoreBar score={c.value_score} />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* ── Activity tab ── */}
          {tab === 'activity' && <ActivityFeed />}
        </div>
      </div>

      {selected && <DetailDrawer customerId={selected} onClose={() => setSelected(null)} />}
    </DashboardLayout>
  );
};

// ─── Cross-customer activity feed ─────────────────────────────────────────────
//
// Server-paged: flattening every customer's full timeline client-side would mean
// fetching all of them just to show the 20 most recent movements.

const FEED_PAGE_SIZE = 20;

const ActivityFeed: React.FC = () => {
  const [entries, setEntries] = useState<Array<CustomerActivity & { customer_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [total, setTotal]     = useState(0);
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await customersApi.activity({
        page,
        limit: FEED_PAGE_SIZE,
        type: typeFilter ? (typeFilter as CustomerActivityType) : undefined,
      });
      if (res.success && res.data) setEntries(res.data);
      else setError(res.error ?? 'Failed to load activity');
      setPages(res.meta?.pages ?? 1);
      setTotal(res.meta?.total ?? 0);
    } catch {
      setError('Failed to load activity');
    }
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white border border-[#ddeedd] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#ddeedd] bg-[#f7faf7] gap-3">
        <h2 className="text-[13px] font-black text-[#141c15]">
          Recent Customer Activity {total > 0 && <span className="text-[#607d66] font-medium">({total})</span>}
        </h2>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-2.5 py-1.5 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[12px] text-[#141c15] outline-none focus:border-[#2e7d32]">
          <option value="">All types</option>
          {(Object.keys(ACTIVITY_CONFIG) as CustomerActivityType[]).map(t => (
            <option key={t} value={t}>{ACTIVITY_CONFIG[t].label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
          <span className="material-symbols-outlined animate-spin text-[26px]">sync</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
          <span className="material-symbols-outlined text-[30px] text-red-400">error</span>
          <p className="text-xs">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#607d66]">
          <span className="material-symbols-outlined text-[32px] opacity-25">history</span>
          <p className="text-xs">No recorded movements yet.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[#ddeedd]">
            {entries.map(e => {
              const cfg = ACTIVITY_CONFIG[e.activity_type] ?? ACTIVITY_CONFIG.note;
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#f1f8f1] transition-colors">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#f7faf7] border border-[#ddeedd]"
                    style={{ color: cfg.color }}
                  >
                    <span className="material-symbols-outlined text-[15px]">{cfg.icon}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] text-[#141c15]">
                      <span className="font-extrabold">{e.customer_name}</span>
                      <span className="text-[#607d66] font-medium"> / {e.title}</span>
                    </p>
                    {e.detail && <p className="text-[12px] text-[#607d66] mt-0.5 truncate">{e.detail}</p>}
                    <p className="text-[11px] text-[#607d66] font-medium mt-0.5">
                      {formatDateTime(e.created_at)}{e.actor_name && ` / ${e.actor_name}`}
                    </p>
                  </div>
                  {e.amount !== null && (
                    <span className={`text-[13px] font-mono font-extrabold whitespace-nowrap ${e.amount < 0 ? 'text-[#c62828]' : 'text-[#2e7d32]'}`}>
                      {e.amount < 0 ? '' : '+'}{formatCurrency(e.amount)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#ddeedd] bg-[#f7faf7]">
              <span className="text-[11px] text-[#607d66] font-medium">Page {page} of {pages}</span>
              <div className="flex gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-2.5 py-1 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[11px] font-extrabold text-[#607d66] disabled:opacity-40 hover:text-[#141c15]">
                  Prev
                </button>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
                  className="px-2.5 py-1 rounded-md border-[1.5px] border-[#ddeedd] bg-white text-[11px] font-extrabold text-[#607d66] disabled:opacity-40 hover:text-[#141c15]">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CustomersPage;