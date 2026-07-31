import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  order_id: string | null;
  actor: string | null;
  action: string;
  old_values: string | null;
  new_values: string | null;
  created_at: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Action colour coding ─────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  ORDER_CREATED:        { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: 'add_shopping_cart' },
  ORDER_MODIFIED_ITEMS: { bg: 'bg-blue-100',    text: 'text-blue-800',    icon: 'edit_note' },
  ORDER_STATUS_UPDATED: { bg: 'bg-purple-100',  text: 'text-purple-800',  icon: 'update' },
  ORDER_DELETED:        { bg: 'bg-red-100',      text: 'text-red-800',     icon: 'delete' },
  PRODUCT_CREATED:      { bg: 'bg-teal-100',     text: 'text-teal-800',    icon: 'add_box' },
  PRODUCT_UPDATED:      { bg: 'bg-cyan-100',     text: 'text-cyan-800',    icon: 'inventory_2' },
  PRODUCT_DEACTIVATED:  { bg: 'bg-orange-100',   text: 'text-orange-800',  icon: 'do_not_disturb_on' },
  PRODUCT_REACTIVATED:  { bg: 'bg-lime-100',     text: 'text-lime-800',    icon: 'check_circle' },
  STAFF_CREATED:        { bg: 'bg-indigo-100',   text: 'text-indigo-800',  icon: 'person_add' },
  STAFF_DEACTIVATED:    { bg: 'bg-red-100',      text: 'text-red-800',     icon: 'person_off' },
  LOGIN_SUCCESS:        { bg: 'bg-green-100',    text: 'text-green-800',   icon: 'login' },
  LOGIN_FAIL:           { bg: 'bg-red-100',      text: 'text-red-800',     icon: 'block' },
};

const getActionStyle = (action: string) =>
  ACTION_STYLE[action] ?? { bg: 'bg-gray-100', text: 'text-gray-700', icon: 'info' };

const TABLE_OPTIONS = [
  '', 'orders', 'order_items', 'products', 'staff_users', 'expenses',
];
const ACTION_OPTIONS = [
  '', 'ORDER_CREATED', 'ORDER_MODIFIED_ITEMS', 'ORDER_STATUS_UPDATED', 'ORDER_DELETED',
  'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DEACTIVATED', 'PRODUCT_REACTIVATED',
  'STAFF_CREATED', 'STAFF_DEACTIVATED', 'LOGIN_SUCCESS', 'LOGIN_FAIL',
];

// ─── JSON diff viewer ─────────────────────────────────────────────────────────

const JsonViewer: React.FC<{ label: string; raw: string | null; accent: string }> = ({ label, raw, accent }) => {
  if (!raw) return null;
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw); } catch { return null; }
  const keys = Object.keys(parsed);
  if (keys.length === 0) return null;
  return (
    <div className={`rounded-lg border ${accent} p-3 text-[11px] font-mono`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      {keys.map(k => (
        <div key={k} className="flex gap-2">
          <span className="text-gray-500 shrink-0">{k}:</span>
          <span className="text-gray-800 break-all">{JSON.stringify(parsed[k])}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AuditLogPage: React.FC = () => {
  const [entries, setEntries]   = useState<AuditEntry[]>([]);
  const [meta, setMeta]         = useState<Meta>({ total: 0, page: 1, limit: 50, pages: 1 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [tableFilter,  setTableFilter]  = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter,  setActorFilter]  = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [page,         setPage]         = useState(1);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (tableFilter)  params.set('table_name', tableFilter);
      if (actionFilter) params.set('action',     actionFilter);
      if (actorFilter)  params.set('actor',      actorFilter);
      if (dateFrom)     params.set('from',        dateFrom);
      if (dateTo)       params.set('to',          dateTo);

      const res = await api.get<AuditEntry[]>(`/api/admin/audit-log?${params}`);
      if (res.success) {
        setEntries(res.data ?? []);
        if (res.meta) setMeta(res.meta as Meta);
      } else {
        setError(res.error || 'Failed to load audit log');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [page, tableFilter, actionFilter, actorFilter, dateFrom, dateTo]);

  useEffect(() => { void fetchAuditLog(); }, [fetchAuditLog]);

  const handleFilter = () => { setPage(1); void fetchAuditLog(); };
  const clearFilters = () => {
    setTableFilter(''); setActionFilter(''); setActorFilter('');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-[#f7faf7] overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-5 py-3 bg-[#1b3d1e] shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-30 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#2e7d32] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[16px]">manage_history</span>
            </div>
            <h1 className="text-white font-black text-[15px] tracking-wide">Audit Log</h1>
            {meta.total > 0 && (
              <span className="text-white/50 text-[11px] font-mono ml-2">{meta.total.toLocaleString()} events</span>
            )}
          </div>
          <button
            onClick={fetchAuditLog}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-[1.5px] border-white/20 text-white rounded-md text-[12px] font-bold hover:bg-white/10 hover:border-white/50 transition"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span> Refresh
          </button>
        </header>

        {/* ── Filters ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white border-b border-[#ddeedd] shrink-0">
          {/* Table filter */}
          <select
            value={tableFilter}
            onChange={e => setTableFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs font-semibold text-[#141c15] focus:outline-none focus:border-[#2e7d32] min-w-[130px]"
          >
            <option value="">All Tables</option>
            {TABLE_OPTIONS.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs font-semibold text-[#141c15] focus:outline-none focus:border-[#2e7d32] min-w-[170px]"
          >
            <option value="">All Actions</option>
            {ACTION_OPTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>

          {/* Actor filter */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[#607d66] text-[13px]">person_search</span>
            <input
              type="text"
              placeholder="Filter by user…"
              value={actorFilter}
              onChange={e => setActorFilter(e.target.value)}
              className="pl-7 pr-2.5 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs focus:outline-none focus:border-[#2e7d32] focus:bg-white min-w-[140px]"
            />
          </div>

          <input
            type="date"
            title="From date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs text-[#141c15] focus:outline-none focus:border-[#2e7d32]"
          />
          <span className="text-[#607d66] text-xs">to</span>
          <input
            type="date"
            title="To date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs text-[#141c15] focus:outline-none focus:border-[#2e7d32]"
          />

          <button
            onClick={handleFilter}
            className="px-3.5 py-1.5 bg-[#2e7d32] text-white rounded-lg text-xs font-bold hover:bg-[#1b5e20] transition"
          >
            Apply
          </button>
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 border-[1.5px] border-[#ddeedd] rounded-lg text-xs font-bold text-[#607d66] hover:border-red-400 hover:text-red-500 transition flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[13px]">close</span> Clear
          </button>

          <div className="ml-auto text-[11px] text-[#607d66] font-mono">
            Page {meta.page} of {meta.pages}
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-xs font-bold flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[15px]">error</span> {error}
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[820px] border-collapse text-[12px]">
            <thead>
              <tr>
                {['Timestamp', 'Action', 'Table', 'Actor', 'Record ID', 'Details'].map(h => (
                  <th key={h} className="sticky top-0 bg-white py-2.5 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3 bg-gray-200 rounded" style={{ width: `${60 + j * 10}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-20 text-[#607d66] gap-2">
                      <span className="material-symbols-outlined text-[40px] opacity-20">manage_history</span>
                      <p className="text-sm">No audit log entries match your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map(entry => {
                  const style = getActionStyle(entry.action);
                  const isExpanded = expanded === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        onClick={() => toggleExpand(entry.id)}
                        className="bg-white border-b border-[#ddeedd] hover:bg-[#f1f8f1] cursor-pointer transition-colors"
                      >
                        {/* Timestamp */}
                        <td className="px-3 py-2.5 whitespace-nowrap text-[11px] text-[#607d66] font-mono">
                          {new Date(entry.created_at).toLocaleString('en-GB')}
                        </td>

                        {/* Action badge */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${style.bg} ${style.text}`}>
                            <span className="material-symbols-outlined text-[12px]">{style.icon}</span>
                            {entry.action.replace(/_/g, ' ')}
                          </span>
                        </td>

                        {/* Table */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono">{entry.table_name}</span>
                        </td>

                        {/* Actor */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-[#e8f5e9] text-[#2e7d32] flex items-center justify-center text-[9px] font-black">
                              {(entry.actor || '?')[0]?.toUpperCase()}
                            </div>
                            <span className="text-[#141c15] font-medium">{entry.actor || '—'}</span>
                          </div>
                        </td>

                        {/* Record ID */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-[11px] font-mono text-[#2e7d32]">
                            {entry.order_id || entry.record_id ? (entry.order_id || entry.record_id)?.slice(0, 20) + '…' : '—'}
                          </span>
                        </td>

                        {/* Expand indicator */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-[#607d66]">
                            {(entry.old_values || entry.new_values) && (
                              <span className="text-[10px]">
                                {entry.old_values && <span className="text-red-500 mr-1">old</span>}
                                {entry.new_values && <span className="text-green-600">new</span>}
                              </span>
                            )}
                            <span className={`material-symbols-outlined text-[15px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row with JSON diff */}
                      {isExpanded && (
                        <tr className="bg-[#f9fdf9] border-b border-[#ddeedd]">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <JsonViewer label="Before (Old Values)" raw={entry.old_values} accent="border-red-200 bg-red-50" />
                              <JsonViewer label="After (New Values)"  raw={entry.new_values} accent="border-green-200 bg-green-50" />
                              <div className="text-[10px] text-[#607d66] font-mono col-span-2">
                                Entry ID: {entry.id} · Record: {entry.record_id || 'n/a'} · Order: {entry.order_id || 'n/a'}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        {meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-[#ddeedd] shrink-0">
            <span className="text-[11px] text-[#607d66]">
              Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString()} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={meta.page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="w-8 h-8 rounded-lg border-[1.5px] border-[#ddeedd] bg-white text-[#607d66] flex items-center justify-center disabled:opacity-30 hover:border-[#2e7d32] hover:text-[#2e7d32] transition"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(7, meta.pages) }, (_, i) => {
                const p = meta.pages <= 7 ? i + 1 : (meta.page <= 4 ? i + 1 : meta.page - 3 + i);
                if (p < 1 || p > meta.pages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg border-[1.5px] text-[12px] font-bold transition ${meta.page === p ? 'border-[#2e7d32] bg-[#2e7d32] text-white' : 'border-[#ddeedd] bg-white text-[#607d66] hover:border-[#2e7d32] hover:text-[#2e7d32]'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={meta.page >= meta.pages}
                onClick={() => setPage(p => p + 1)}
                className="w-8 h-8 rounded-lg border-[1.5px] border-[#ddeedd] bg-white text-[#607d66] flex items-center justify-center disabled:opacity-30 hover:border-[#2e7d32] hover:text-[#2e7d32] transition"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AuditLogPage;
