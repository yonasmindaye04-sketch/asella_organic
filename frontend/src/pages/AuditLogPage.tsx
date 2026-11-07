/**
 * AuditLogPage.tsx
 * Asella Organic — Admin & Manager System Audit Log Viewer
 *
 * Provides a tamper-evident trace of system events, database mutations,
 * staff authentication, order status updates, and inventory changes.
 *
 * Redesigned for crisp readability, high contrast, and full dark/light mode support:
 *   - Material Symbols with bare colored glyphs (no icon background tiles per rule.md)
 *   - Bold colored text only in CAPITAL LETTERS for status/action indicators per rule.md
 *   - Outfit (font-heading), DM Sans (font-sans), font-mono for metrics & UUIDs
 *   - Side-by-side JSON diff inspector for old vs new database state
 *   - One-click CSV and JSON exports for reporting & compliance
 *   - Strict zero-emoji policy per rule.md
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface ActionInfo {
  label: string;
  color: string;
  icon: string;
}

// ─── Action Mapping (rule.md Section 2 compliant: bold colored text, bare glyphs) ──

const ACTION_MAP: Record<string, ActionInfo> = {
  ORDER_CREATED:        { label: 'ORDER CREATED',        color: 'text-emerald-600 dark:text-emerald-400', icon: 'add_shopping_cart' },
  ORDER_MODIFIED_ITEMS: { label: 'ORDER ITEMS MODIFIED', color: 'text-blue-600 dark:text-blue-400',       icon: 'edit_note' },
  ORDER_STATUS_UPDATED: { label: 'STATUS UPDATED',       color: 'text-purple-600 dark:text-purple-400',   icon: 'update' },
  ORDER_DELETED:        { label: 'ORDER DELETED',        color: 'text-rose-600 dark:text-rose-400',       icon: 'delete' },
  PRODUCT_CREATED:      { label: 'PRODUCT CREATED',      color: 'text-teal-600 dark:text-teal-400',       icon: 'add_box' },
  PRODUCT_UPDATED:      { label: 'PRODUCT UPDATED',      color: 'text-cyan-600 dark:text-cyan-400',       icon: 'inventory_2' },
  PRODUCT_DEACTIVATED:  { label: 'PRODUCT DEACTIVATED',  color: 'text-amber-600 dark:text-amber-400',     icon: 'do_not_disturb_on' },
  PRODUCT_REACTIVATED:  { label: 'PRODUCT REACTIVATED',  color: 'text-emerald-600 dark:text-emerald-400', icon: 'check_circle' },
  STAFF_CREATED:        { label: 'STAFF CREATED',        color: 'text-indigo-600 dark:text-indigo-400',   icon: 'person_add' },
  STAFF_DEACTIVATED:    { label: 'STAFF DEACTIVATED',    color: 'text-rose-600 dark:text-rose-400',       icon: 'person_off' },
  LOGIN_SUCCESS:        { label: 'LOGIN SUCCESS',        color: 'text-emerald-600 dark:text-emerald-400', icon: 'login' },
  LOGIN_FAIL:           { label: 'LOGIN FAILED',         color: 'text-rose-600 dark:text-rose-400',       icon: 'block' },
  LOGIN:                { label: 'LOGIN',                color: 'text-emerald-600 dark:text-emerald-400', icon: 'login' },
  LOGOUT:               { label: 'LOGOUT',               color: 'text-zinc-600 dark:text-zinc-400',       icon: 'logout' },
  INSERT:               { label: 'RECORD INSERTED',      color: 'text-teal-600 dark:text-teal-400',       icon: 'add_circle' },
  UPDATE:               { label: 'RECORD UPDATED',       color: 'text-blue-600 dark:text-blue-400',       icon: 'edit' },
  CALL_REPORT_SUBMITTED:{ label: 'CALL REPORT FILED',    color: 'text-sky-600 dark:text-sky-400',         icon: 'assignment' },
};

function getActionInfo(action: string, newValues: string | null): ActionInfo {
  if (action === 'LOGIN' && newValues) {
    try {
      const parsed = JSON.parse(newValues);
      if (parsed.note && String(parsed.note).includes('success=false')) {
        return { label: 'LOGIN FAILED', color: 'text-rose-600 dark:text-rose-400', icon: 'block' };
      }
      if (parsed.note && String(parsed.note).includes('success=true')) {
        return { label: 'LOGIN SUCCESS', color: 'text-emerald-600 dark:text-emerald-400', icon: 'login' };
      }
    } catch {
      // ignore
    }
  }

  const mapped = ACTION_MAP[action];
  if (mapped) return mapped;

  return {
    label: action.replace(/_/g, ' ').toUpperCase(),
    color: 'text-zinc-700 dark:text-zinc-300',
    icon: 'info',
  };
}

const TABLE_OPTIONS = [
  { value: '', label: 'All Tables' },
  { value: 'orders', label: 'Orders (orders)' },
  { value: 'order_items', label: 'Order Items (order_items)' },
  { value: 'products', label: 'Products (products)' },
  { value: 'staff_users', label: 'Staff Users (staff_users)' },
  { value: 'expenses', label: 'Expenses (expenses)' },
  { value: 'call_center_daily_reports', label: 'Call Center Reports' },
];

const ACTION_GROUPS = [
  { value: '', label: 'All Actions' },
  {
    group: 'Authentication & Security',
    options: [
      { value: 'LOGIN', label: 'Login (All)' },
      { value: 'LOGIN_SUCCESS', label: 'Login Success' },
      { value: 'LOGIN_FAIL', label: 'Login Failed' },
      { value: 'LOGOUT', label: 'Logout' },
      { value: 'STAFF_CREATED', label: 'Staff Created' },
      { value: 'STAFF_DEACTIVATED', label: 'Staff Deactivated' },
    ],
  },
  {
    group: 'Orders',
    options: [
      { value: 'ORDER_CREATED', label: 'Order Created' },
      { value: 'ORDER_STATUS_UPDATED', label: 'Order Status Updated' },
      { value: 'ORDER_MODIFIED_ITEMS', label: 'Order Items Modified' },
      { value: 'ORDER_DELETED', label: 'Order Deleted' },
    ],
  },
  {
    group: 'Products & Inventory',
    options: [
      { value: 'PRODUCT_CREATED', label: 'Product Created' },
      { value: 'PRODUCT_UPDATED', label: 'Product Updated' },
      { value: 'PRODUCT_DEACTIVATED', label: 'Product Deactivated' },
      { value: 'PRODUCT_REACTIVATED', label: 'Product Reactivated' },
      { value: 'INSERT', label: 'Insert (Direct)' },
      { value: 'UPDATE', label: 'Update (Direct)' },
    ],
  },
  {
    group: 'Reports & Logs',
    options: [
      { value: 'CALL_REPORT_SUBMITTED', label: 'Call Report Submitted' },
    ],
  },
];

// ─── JSON Diff Inspector ─────────────────────────────────────────────────────

function safeParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const val = JSON.parse(raw);
    return typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const JsonDiffViewer: React.FC<{
  oldValues: string | null;
  newValues: string | null;
  entryId: string;
  recordId: string | null;
  orderId: string | null;
}> = ({ oldValues, newValues, entryId, recordId, orderId }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const oldObj = safeParse(oldValues);
  const newObj = safeParse(newValues);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(type);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const hasData = oldObj || newObj;

  return (
    <div className="p-4 sm:p-5 bg-zinc-50 dark:bg-zinc-950/70 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
      {/* Target Identifiers Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400 font-bold uppercase">Event ID:</span>
            <span className="text-zinc-900 dark:text-zinc-100">{entryId}</span>
            <button
              onClick={() => handleCopy(entryId, 'event')}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition ml-1"
              title="Copy Event UUID"
            >
              <span className="material-symbols-outlined text-sm">
                {copiedId === 'event' ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>

          {recordId && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 dark:text-zinc-400 font-bold uppercase">Record ID:</span>
              <span className="text-zinc-900 dark:text-zinc-100">{recordId}</span>
              <button
                onClick={() => handleCopy(recordId, 'record')}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition ml-1"
                title="Copy Record ID"
              >
                <span className="material-symbols-outlined text-sm">
                  {copiedId === 'record' ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
          )}

          {orderId && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 dark:text-zinc-400 font-bold uppercase">Order ID:</span>
              <span className="text-[#1b4d24] dark:text-emerald-400 font-bold">{orderId}</span>
              <button
                onClick={() => handleCopy(orderId, 'order')}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition ml-1"
                title="Copy Order ID"
              >
                <span className="material-symbols-outlined text-sm">
                  {copiedId === 'order' ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
          )}
        </div>

        {copiedId && (
          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold font-heading">
            Copied to clipboard
          </span>
        )}
      </div>

      {/* Snapshot Diff Side-by-Side */}
      {hasData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Before / Old Values */}
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/15 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-400 font-heading">
                Before (Previous Values)
              </span>
              {oldObj && (
                <span className="text-xs font-mono text-rose-600 dark:text-rose-400 font-bold">
                  {Object.keys(oldObj).length} field{Object.keys(oldObj).length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {oldObj ? (
              <div className="space-y-1.5 font-mono text-xs max-h-72 overflow-y-auto pr-1">
                {Object.entries(oldObj).map(([key, value]) => {
                  const isChanged = newObj && JSON.stringify(newObj[key]) !== JSON.stringify(value);
                  return (
                    <div
                      key={key}
                      className={`flex items-start justify-between gap-3 p-1.5 rounded transition ${
                        isChanged ? 'bg-rose-100/70 dark:bg-rose-900/30' : ''
                      }`}
                    >
                      <span className="text-zinc-600 dark:text-zinc-400 font-bold shrink-0">{key}:</span>
                      <span className="text-rose-800 dark:text-rose-200 break-all text-right font-medium">
                        {JSON.stringify(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                No previous state recorded (new record creation or uncaptured baseline).
              </p>
            )}
          </div>

          {/* After / New Values */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/15 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-heading">
                After (New Values)
              </span>
              {newObj && (
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {Object.keys(newObj).length} field{Object.keys(newObj).length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {newObj ? (
              <div className="space-y-1.5 font-mono text-xs max-h-72 overflow-y-auto pr-1">
                {Object.entries(newObj).map(([key, value]) => {
                  const isChanged = oldObj && JSON.stringify(oldObj[key]) !== JSON.stringify(value);
                  return (
                    <div
                      key={key}
                      className={`flex items-start justify-between gap-3 p-1.5 rounded transition ${
                        isChanged ? 'bg-emerald-100/70 dark:bg-emerald-900/30' : ''
                      }`}
                    >
                      <span className="text-zinc-600 dark:text-zinc-400 font-bold shrink-0">{key}:</span>
                      <span className="text-emerald-800 dark:text-emerald-200 break-all text-right font-medium">
                        {JSON.stringify(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                No subsequent state recorded (record deletion or purge).
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
          No payload snapshots were attached to this log entry.
        </p>
      )}
    </div>
  );
};

// ─── Main Page Component ─────────────────────────────────────────────────────

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
  const [limit,        setLimit]        = useState(50);
  const [preset,       setPreset]       = useState<'all' | 'today' | '7days' | '30days'>('all');

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (tableFilter)  params.set('table_name', tableFilter);
      if (actionFilter) params.set('action',     actionFilter);
      if (actorFilter)  params.set('actor',      actorFilter.trim());
      if (dateFrom)     params.set('from',        dateFrom);
      if (dateTo)       params.set('to',          dateTo.includes(' ') ? dateTo : `${dateTo} 23:59:59`);

      const res = await api.get<AuditEntry[]>(`/api/admin/audit-log?${params}`);
      if (res.success) {
        setEntries(res.data ?? []);
        if (res.meta) setMeta(res.meta as Meta);
      } else {
        setError(res.error || 'Failed to load audit log');
      }
    } catch (err: any) {
      setError(err.message || 'Network connection failed');
    } finally {
      setLoading(false);
    }
  }, [page, limit, tableFilter, actionFilter, actorFilter, dateFrom, dateTo]);

  useEffect(() => {
    void fetchAuditLog();
  }, [fetchAuditLog]);

  const handleFilter = () => {
    setPage(1);
    void fetchAuditLog();
  };

  const clearFilters = () => {
    setTableFilter('');
    setActionFilter('');
    setActorFilter('');
    setDateFrom('');
    setDateTo('');
    setPreset('all');
    setPage(1);
  };

  const setDatePreset = (p: 'all' | 'today' | '7days' | '30days') => {
    setPreset(p);
    setPage(1);
    const now = new Date();
    const fmt = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (p === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (p === 'today') {
      const today = fmt(now);
      setDateFrom(today);
      setDateTo(today);
    } else if (p === '7days') {
      const past = new Date(now.getTime() - 7 * 86400000);
      setDateFrom(fmt(past));
      setDateTo(fmt(now));
    } else if (p === '30days') {
      const past = new Date(now.getTime() - 30 * 86400000);
      setDateFrom(fmt(past));
      setDateTo(fmt(now));
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => (prev === id ? null : id));
  };

  // ─── Export Functionality ──────────────────────────────────────────────────
  const handleExport = (format: 'csv' | 'json') => {
    if (entries.length === 0) return;
    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asella-audit-log-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['ID', 'Timestamp', 'Action', 'Table', 'Actor', 'Record ID', 'Order ID', 'Old Values', 'New Values'];
      const rows = entries.map(e => [
        e.id,
        new Date(e.created_at).toISOString(),
        e.action,
        e.table_name,
        e.actor || '',
        e.record_id || '',
        e.order_id || '',
        (e.old_values || '').replace(/"/g, '""'),
        (e.new_values || '').replace(/"/g, '""'),
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.map(f => `"${f}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asella-audit-log-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // ─── KPI Stats Breakdown ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    let orderCount = 0;
    let catalogCount = 0;
    let securityCount = 0;

    entries.forEach(e => {
      if (e.table_name === 'orders' || e.action.startsWith('ORDER_')) {
        orderCount++;
      } else if (e.table_name === 'products' || e.action.startsWith('PRODUCT_')) {
        catalogCount++;
      } else if (e.table_name === 'staff_users' || e.action.startsWith('LOGIN') || e.action.startsWith('STAFF_')) {
        securityCount++;
      }
    });

    return { orderCount, catalogCount, securityCount };
  }, [entries]);

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-50/70 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

          {/* ── Page Header ────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-3xl text-[#1b4d24] dark:text-emerald-400">
                  manage_history
                </span>
                <h1 className="text-xl sm:text-2xl font-bold font-heading text-zinc-900 dark:text-zinc-50 tracking-tight">
                  System Audit Log
                </h1>
                {meta.total > 0 && (
                  <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 ml-1">
                    ({meta.total.toLocaleString()} total events)
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                Tamper-evident record of data mutations, user authentications, and employee activities across Asella Organic.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
              {/* Export dropdown */}
              <button
                onClick={() => handleExport('csv')}
                disabled={entries.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs sm:text-sm font-bold font-heading text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
                title="Export visible log as CSV"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => handleExport('json')}
                disabled={entries.length === 0}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs sm:text-sm font-bold font-heading text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-40"
                title="Export visible log as JSON"
              >
                <span className="material-symbols-outlined text-base">data_object</span>
                <span>JSON</span>
              </button>

              {/* Refresh button */}
              <button
                onClick={fetchAuditLog}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1b4d24] text-white hover:bg-[#153e1c] text-xs sm:text-sm font-bold font-heading shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* ── KPI Summary Cards (2 per row on mobile per rule.md section 4) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Events */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">
                  database
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Total Logged Events
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {meta.total.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Across all system tables
              </p>
            </div>

            {/* Order Mutations */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-blue-600 dark:text-blue-400">
                  shopping_cart_checkout
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Order Events
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {stats.orderCount.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Creations, status & edits
              </p>
            </div>

            {/* Catalog & Inventory */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-teal-600 dark:text-teal-400">
                  inventory_2
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Catalog & Products
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {stats.catalogCount.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Stock & product mutations
              </p>
            </div>

            {/* Security & Access */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-emerald-600 dark:text-emerald-400">
                  security
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Auth & Staff Access
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {stats.securityCount.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Logins, logouts & permissions
              </p>
            </div>
          </div>

          {/* ── Filters & Search Section ──────────────────────────────── */}
          <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-heading flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-[#1b4d24] dark:text-emerald-400">filter_alt</span>
                Search & Filters
              </span>

              {/* Date Presets */}
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                {(
                  [
                    { key: 'all', label: 'All Time' },
                    { key: 'today', label: 'Today' },
                    { key: '7days', label: '7 Days' },
                    { key: '30days', label: '30 Days' },
                  ] as const
                ).map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setDatePreset(p.key)}
                    className={`px-3 py-1 text-xs font-bold font-heading rounded-lg transition cursor-pointer ${
                      preset === p.key
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Filter: Table */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading mb-1.5">
                  Database Table
                </label>
                <select
                  value={tableFilter}
                  onChange={e => { setTableFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-semibold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500"
                >
                  {TABLE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Filter: Action */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading mb-1.5">
                  Action Type
                </label>
                <select
                  value={actionFilter}
                  onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-semibold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500"
                >
                  <option value="">All Actions</option>
                  {ACTION_GROUPS.slice(1).map((grp: any) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.options.map((opt: any) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Filter: User / Actor */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading mb-1.5">
                  Staff / Actor
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base pointer-events-none">
                    person_search
                  </span>
                  <input
                    type="text"
                    placeholder="Search by user or email…"
                    value={actorFilter}
                    onChange={e => setActorFilter(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleFilter(); }}
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500"
                  />
                  {actorFilter && (
                    <button
                      onClick={() => setActorFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      title="Clear actor"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter: Date Range (Compact group with w-[140px] per rule.md section 3) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading mb-1.5">
                  Date Range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    title="From date"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPreset('all'); }}
                    className="w-[140px] px-2.5 py-2 text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500"
                  />
                  <span className="text-zinc-500 dark:text-zinc-400 text-xs font-bold">to</span>
                  <input
                    type="date"
                    title="To date"
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPreset('all'); }}
                    className="w-[140px] px-2.5 py-2 text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Filter Action Buttons */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFilter}
                  className="px-4 py-2 rounded-xl bg-[#1b4d24] text-white hover:bg-[#153e1c] text-xs sm:text-sm font-bold font-heading transition cursor-pointer shadow-xs"
                >
                  Apply Filters
                </button>
                <button
                  onClick={clearFilters}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs sm:text-sm font-bold font-heading transition cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">clear_all</span>
                  <span>Clear</span>
                </button>
              </div>

              {/* Items per page selector */}
              <div className="flex items-center gap-2 text-xs font-heading font-semibold text-zinc-600 dark:text-zinc-400">
                <span>Show:</span>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>per page</span>
              </div>
            </div>
          </div>

          {/* ── Error Banner ────────────────────────────────────────── */}
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center gap-2.5">
              <span className="material-symbols-outlined text-xl">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Table Container ───────────────────────────────────────── */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm sm:text-base min-w-[880px] text-left">
                <thead className="bg-zinc-100/80 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading whitespace-nowrap">
                      Timestamp
                    </th>
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading whitespace-nowrap">
                      Action Performed
                    </th>
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading whitespace-nowrap">
                      Table
                    </th>
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading whitespace-nowrap">
                      User / Actor
                    </th>
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading whitespace-nowrap">
                      Record / Order ID
                    </th>
                    <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 font-heading text-right whitespace-nowrap">
                      Diff Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-4"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-28" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-36" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-20" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-32" /></td>
                        <td className="px-4 py-4"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-24" /></td>
                        <td className="px-4 py-4 text-right"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-16 ml-auto" /></td>
                      </tr>
                    ))
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 dark:text-zinc-400 gap-2.5">
                          <span className="material-symbols-outlined text-5xl opacity-30 text-[#1b4d24] dark:text-emerald-400">
                            manage_history
                          </span>
                          <p className="text-base font-bold font-heading text-zinc-900 dark:text-zinc-100">
                            No audit log events match your filters
                          </p>
                          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                            Try broadening your date range, changing table filters, or clearing the actor search.
                          </p>
                          <button
                            onClick={clearFilters}
                            className="mt-3 px-4 py-2 rounded-xl bg-[#1b4d24] text-white text-xs sm:text-sm font-bold font-heading hover:bg-[#153e1c] transition"
                          >
                            Reset All Filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    entries.map(entry => {
                      const style = getActionInfo(entry.action, entry.new_values);
                      const isExpanded = expanded === entry.id;
                      const hasChanges = Boolean(entry.old_values || entry.new_values);
                      const targetId = entry.order_id || entry.record_id;

                      return (
                        <React.Fragment key={entry.id}>
                          <tr
                            onClick={() => toggleExpand(entry.id)}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                          >
                            {/* Timestamp */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs sm:text-sm text-zinc-600 dark:text-zinc-300">
                              {new Date(entry.created_at).toLocaleString('en-GB', {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </td>

                            {/* Action Indicator (bold colored text only in CAPITAL LETTERS per rule.md) */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-black font-heading tracking-wider uppercase ${style.color}`}>
                                <span className="material-symbols-outlined text-base">{style.icon}</span>
                                <span>{style.label}</span>
                              </span>
                            </td>

                            {/* Table */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-xs sm:text-sm text-zinc-800 dark:text-zinc-200">
                              {entry.table_name}
                            </td>

                            {/* Actor / Staff */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[#1b4d24] text-white flex items-center justify-center text-xs font-bold uppercase shrink-0 shadow-2xs">
                                  {(entry.actor || '?')[0]?.toUpperCase()}
                                </div>
                                <span className="font-bold font-heading text-sm text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">
                                  {entry.actor || 'System / Automated'}
                                </span>
                              </div>
                            </td>

                            {/* Record ID / Order ID */}
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-xs sm:text-sm text-[#1b4d24] dark:text-emerald-400">
                              {targetId ? (
                                <span title={targetId}>
                                  {targetId.length > 20 ? `${targetId.slice(0, 18)}…` : targetId}
                                </span>
                              ) : (
                                <span className="text-zinc-400 font-normal">—</span>
                              )}
                            </td>

                            {/* Diff toggle */}
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <div className="inline-flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                                {hasChanges ? (
                                  <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300">
                                    {entry.old_values && entry.new_values
                                      ? 'MODIFIED'
                                      : entry.new_values
                                      ? 'NEW SNAPSHOT'
                                      : 'REMOVED'}
                                  </span>
                                ) : (
                                  <span className="text-xs font-mono text-zinc-400">No snapshot</span>
                                )}
                                <span
                                  className={`material-symbols-outlined text-lg transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180 text-zinc-900 dark:text-zinc-100' : ''
                                  }`}
                                >
                                  expand_more
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded JSON diff row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <JsonDiffViewer
                                  oldValues={entry.old_values}
                                  newValues={entry.new_values}
                                  entryId={entry.id}
                                  recordId={entry.record_id}
                                  orderId={entry.order_id}
                                />
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

            {/* ── Pagination ───────────────────────────────────────────── */}
            {meta.pages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 bg-zinc-50/70 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of{' '}
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{meta.total.toLocaleString()}</span> entries
                </span>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {/* First page */}
                  <button
                    disabled={meta.page <= 1}
                    onClick={() => setPage(1)}
                    className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center disabled:opacity-30 hover:border-[#1b4d24] dark:hover:border-emerald-500 transition cursor-pointer"
                    title="First page"
                  >
                    <span className="material-symbols-outlined text-base">first_page</span>
                  </button>

                  {/* Previous page */}
                  <button
                    disabled={meta.page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center disabled:opacity-30 hover:border-[#1b4d24] dark:hover:border-emerald-500 transition cursor-pointer"
                    title="Previous page"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, meta.pages) }, (_, i) => {
                    let pNum = i + 1;
                    if (meta.pages > 5) {
                      if (meta.page <= 3) {
                        pNum = i + 1;
                      } else if (meta.page >= meta.pages - 2) {
                        pNum = meta.pages - 4 + i;
                      } else {
                        pNum = meta.page - 2 + i;
                      }
                    }
                    if (pNum < 1 || pNum > meta.pages) return null;

                    const isActive = meta.page === pNum;
                    return (
                      <button
                        key={pNum}
                        onClick={() => setPage(pNum)}
                        className={`w-8 h-8 rounded-lg border text-xs font-bold font-mono transition cursor-pointer ${
                          isActive
                            ? 'bg-[#1b4d24] text-white border-[#1b4d24] shadow-xs'
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-[#1b4d24] dark:hover:border-emerald-500'
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  })}

                  {/* Next page */}
                  <button
                    disabled={meta.page >= meta.pages}
                    onClick={() => setPage(p => p + 1)}
                    className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center disabled:opacity-30 hover:border-[#1b4d24] dark:hover:border-emerald-500 transition cursor-pointer"
                    title="Next page"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>

                  {/* Last page */}
                  <button
                    disabled={meta.page >= meta.pages}
                    onClick={() => setPage(meta.pages)}
                    className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center disabled:opacity-30 hover:border-[#1b4d24] dark:hover:border-emerald-500 transition cursor-pointer"
                    title="Last page"
                  >
                    <span className="material-symbols-outlined text-base">last_page</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AuditLogPage;
