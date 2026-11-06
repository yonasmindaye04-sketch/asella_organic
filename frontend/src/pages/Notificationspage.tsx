/**
 * NotificationsPage.tsx
 * Asella Organic — In-App Notification Center
 *
 * Dedicated notification channel:
 * - Drivers & Couriers: Delivery dispatch requests, assigned deliveries, route notes, and admin dispatch alerts.
 * - Substore Managers: Store-specific stock requests and localized order updates.
 * - Admins, Managers & Tech Support: Full operational activity (low stock, stock requests, new orders, procurement).
 */
import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

type Category =
  | 'all'
  | 'low_stock'
  | 'stock_request'
  | 'new_order'
  | 'vendor'
  | 'delivery_assigned'
  | 'new_delivery'
  | 'dispatch_alert';

interface Notification {
  id: string;
  category: Category;
  title: string;
  body: string;
  created_at: string;
  metadata?: Record<string, any>;
}

interface Summary {
  low_stock?: number;
  stock_request?: number;
  new_order?: number;
  vendor?: number;
  delivery_assigned?: number;
  new_delivery?: number;
  dispatch_alert?: number;
  total: number;
}

const CATEGORY_STYLES: Record<string, { dot: string; badge: string; border: string }> = {
  low_stock:         { dot: 'bg-red-500',     badge: 'text-red-700 bg-red-50 border-red-200',         border: 'border-l-red-500' },
  stock_request:     { dot: 'bg-amber-500',   badge: 'text-amber-700 bg-amber-50 border-amber-200',     border: 'border-l-amber-500' },
  new_order:         { dot: 'bg-blue-500',    badge: 'text-blue-700 bg-blue-50 border-blue-200',       border: 'border-l-blue-500' },
  vendor:            { dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', border: 'border-l-emerald-500' },
  delivery_assigned: { dot: 'bg-emerald-600', badge: 'text-emerald-800 bg-emerald-100 border-emerald-300 font-bold', border: 'border-l-emerald-600' },
  new_delivery:      { dot: 'bg-cyan-500',    badge: 'text-cyan-800 bg-cyan-50 border-cyan-300 font-bold', border: 'border-l-cyan-500' },
  dispatch_alert:    { dot: 'bg-amber-600',   badge: 'text-amber-900 bg-amber-100 border-amber-300 font-bold', border: 'border-l-amber-600' },
};

function timeAgo(datastr: string) {
  const diff = Date.now() - new Date(datastr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const role = (user?.role || '').toLowerCase();
  const isDriver = role === 'delivery' || role === 'driver';
  const isStoreManager = role === 'store_manager';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [summary, setSummary]             = useState<Summary | null>(null);
  const [activeCategory, setCategory]     = useState<Category>('all');
  const [loading, setLoading]             = useState(true);
  const [since, setSince]                 = useState('7'); // days

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sinceDate = new Date(Date.now() - Number(since) * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const cat = activeCategory === 'all' ? '' : `&category=${activeCategory}`;
      const [notifRes, summRes] = await Promise.all([
        api.get<Notification[]>(`/api/notifications?since=${sinceDate}${cat}&limit=100`),
        api.get<Summary>(`/api/notifications/summary?since=${sinceDate}`),
      ]);
      if (notifRes.success && notifRes.data) setNotifications(notifRes.data);
      if (summRes.success && summRes.data)   setSummary(summRes.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [activeCategory, since]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Header Banner */}
        <div className="bg-white rounded-2xl border border-gray-200/90 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isDriver ? 'bg-emerald-100 text-[#1b4d24]' : 'bg-[#eaf4ec] text-[#1b4d24]'
            }`}>
              <span className="material-symbols-outlined text-2xl">
                {isDriver ? 'local_shipping' : 'notifications_active'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                  {isDriver ? 'Delivery Notification Channel' : 'Notification Center'}
                </h1>
                {isDriver && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="material-symbols-outlined text-xs">verified</span>
                    Fulfillment Live
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {isDriver
                  ? 'Real-time dispatch orders, assigned customer drop-offs, and administrative route alerts.'
                  : isStoreManager
                  ? 'Store-specific stock requests and order fulfillment notices.'
                  : 'Company-wide events, inventory threshold alerts, and customer orders.'}
              </p>
            </div>
          </div>

          {/* Controls: Date range & manual refresh */}
          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <select
              value={since}
              onChange={e => setSince(e.target.value)}
              className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg bg-white text-gray-700 outline-none hover:border-gray-400 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="1">Last 24 Hours</option>
              <option value="3">Last 3 Days</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition text-gray-600 active:scale-95"
              title="Refresh events"
              aria-label="Refresh events"
            >
              <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {isDriver ? (
              // ── Driver-specific KPI Cards ──────────────────────────────────
              [
                {
                  key: 'all',
                  label: 'Total Delivery Events',
                  icon: 'notifications',
                  value: summary.total ?? 0,
                  iconBg: 'bg-emerald-700 text-white',
                  accent: '#1b4d24',
                },
                {
                  key: 'delivery_assigned',
                  label: 'Assigned To Me',
                  icon: 'local_shipping',
                  value: summary.delivery_assigned ?? 0,
                  iconBg: 'bg-emerald-600 text-white',
                  accent: '#059669',
                },
                {
                  key: 'new_delivery',
                  label: 'Pending Dispatches',
                  icon: 'route',
                  value: summary.new_delivery ?? 0,
                  iconBg: 'bg-cyan-600 text-white',
                  accent: '#0891b2',
                },
                {
                  key: 'dispatch_alert',
                  label: 'Dispatch Alerts',
                  icon: 'campaign',
                  value: summary.dispatch_alert ?? 0,
                  iconBg: 'bg-amber-600 text-white',
                  accent: '#d97706',
                },
              ].map((item) => {
                const active = activeCategory === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setCategory(active && item.key !== 'all' ? 'all' : (item.key as Category))}
                    aria-pressed={active}
                    className="bg-white rounded-2xl border p-4 text-left transition hover:shadow-xs active:scale-[0.99] flex flex-col justify-between"
                    style={{
                      borderColor: active ? item.accent : '#e5e7eb',
                      boxShadow: active ? `0 0 0 2px ${item.accent}33` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}>
                        <span className="material-symbols-outlined text-sm">{item.icon}</span>
                      </div>
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between w-full">
                      <p className="text-2xl font-black text-gray-900">{item.value}</p>
                      <span className="text-[10px] font-mono text-gray-400">
                        {active ? 'Active Filter' : 'Filter'}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              // ── General Operations KPI Cards ───────────────────────────────
              [
                { key: 'low_stock',     label: 'Low Stock Alerts', icon: 'warning',        value: summary.low_stock ?? 0,     iconBg: 'bg-red-500 text-white',     accent: '#ef4444' },
                { key: 'stock_request', label: 'Stock Requests',   icon: 'assignment',     value: summary.stock_request ?? 0, iconBg: 'bg-amber-500 text-white',   accent: '#f59e0b' },
                { key: 'new_order',     label: 'Pending Orders',   icon: 'shopping_cart',  value: summary.new_order ?? 0,     iconBg: 'bg-blue-500 text-white',    accent: '#3b82f6' },
                { key: 'vendor',        label: 'Vendor Purchases', icon: 'local_shipping', value: summary.vendor ?? 0,        iconBg: 'bg-emerald-600 text-white', accent: '#059669' },
              ]
                .filter(item => !isStoreManager || item.key === 'stock_request' || item.key === 'new_order')
                .map((item) => {
                  const active = activeCategory === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setCategory(active ? 'all' : (item.key as Category))}
                      aria-pressed={active}
                      className="bg-white rounded-2xl border p-4 text-left transition hover:shadow-xs active:scale-[0.99] flex flex-col justify-between"
                      style={{
                        borderColor: active ? item.accent : '#e5e7eb',
                        boxShadow: active ? `0 0 0 2px ${item.accent}33` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}>
                          <span className="material-symbols-outlined text-sm">{item.icon}</span>
                        </div>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider truncate">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between w-full">
                        <p className="text-2xl font-black text-gray-900">{item.value}</p>
                        <span className="text-[10px] font-mono text-gray-400">
                          {active ? 'Filtering' : 'View'}
                        </span>
                      </div>
                    </button>
                  );
                })
            )}
          </div>
        )}

        {/* Notifications List Container */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
          {loading ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined animate-spin text-4xl text-emerald-600">sync</span>
              <p className="text-gray-500 mt-3 text-sm font-medium">Fetching notification channel stream…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                <span className="material-symbols-outlined text-3xl">notifications_off</span>
              </div>
              <h3 className="text-base font-bold text-gray-900">
                No {activeCategory === 'all' ? '' : `${activeCategory.replace('_', ' ')} `}notifications in this window
              </h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                {activeCategory === 'all'
                  ? 'All delivery and operational queues are clear. Adjust the date range filter above to review older logs.'
                  : 'Click the active filter card to reset and show all operational events.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n, i) => {
                const style = CATEGORY_STYLES[n.category] ?? CATEGORY_STYLES['new_order'];
                const meta = n.metadata || {};
                const orderId = meta.order_id || meta.id;

                return (
                  <div
                    key={`${n.id}-${i}`}
                    className={`flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-5 hover:bg-gray-50/80 transition border-l-4 ${style.border}`}
                  >
                    {/* Left: Icon, Dot & Content */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex flex-col items-center pt-1">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`inline-block text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${style.badge}`}>
                            {n.category.replace('_', ' ')}
                          </span>
                          <span className="text-[11px] font-medium text-gray-400">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-gray-900 leading-snug">
                          {n.title}
                        </h4>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                          {n.body}
                        </p>

                        {/* Metadata chips */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          {meta.city && (
                            <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">location_on</span>
                              {meta.city}
                            </span>
                          )}
                          {meta.phone && (
                            <span className="text-[10px] font-mono font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">call</span>
                              {meta.phone}
                            </span>
                          )}
                          {meta.total !== undefined && (
                            <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                              {Number(meta.total).toLocaleString()} ETB
                            </span>
                          )}
                          {meta.status && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
                              {meta.status}
                            </span>
                          )}
                          {meta.sender_name && (
                            <span className="text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">person</span>
                              {meta.sender_name} ({meta.sender_role || 'Staff'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Operational Action button */}
                    {orderId && (
                      <div className="shrink-0 self-end sm:self-center">
                        <Link
                          to={`/dashboard/tracking?search=${encodeURIComponent(orderId)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1b4d24] text-white hover:bg-[#133619] transition shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-sm">route</span>
                          Track Order
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer note */}
          {notifications.length > 0 && (
            <div className="px-5 py-3 bg-gray-50/90 border-t border-gray-100 text-[11px] font-medium text-gray-500 text-center flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-xs">sync</span>
              <span>Showing {notifications.length} events · Stream refreshes every 30 seconds</span>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
