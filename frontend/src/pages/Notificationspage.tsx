/**
 * Notificationspage.tsx
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

interface ActionConfig {
  label: string;
  icon: string;
  to: string;
}

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  low_stock:         'text-rose-600 dark:text-rose-400',
  stock_request:     'text-amber-600 dark:text-amber-400',
  new_order:         'text-blue-600 dark:text-blue-400',
  vendor:            'text-emerald-700 dark:text-emerald-400',
  delivery_assigned: 'text-emerald-700 dark:text-emerald-400',
  new_delivery:      'text-cyan-700 dark:text-cyan-400',
  dispatch_alert:    'text-amber-700 dark:text-amber-400',
};

function getStatusTextColor(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('deliver') || s.includes('complet') || s.includes('paid')) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (s.includes('transit') || s.includes('dispatch')) {
    return 'text-blue-600 dark:text-blue-400';
  }
  if (s.includes('pend') || s.includes('request')) {
    return 'text-amber-600 dark:text-amber-400';
  }
  if (s.includes('cancel') || s.includes('reject') || s.includes('fail') || s.includes('void')) {
    return 'text-rose-600 dark:text-rose-400';
  }
  if (s.includes('confirm') || s.includes('process')) {
    return 'text-teal-600 dark:text-teal-400';
  }
  return 'text-zinc-700 dark:text-zinc-300';
}

function getNotificationAction(n: Notification): ActionConfig | null {
  const meta = n.metadata || {};

  switch (n.category) {
    case 'new_order':
    case 'delivery_assigned':
    case 'new_delivery': {
      const orderId = meta.order_id || (n.id && n.id.startsWith('ORD-') ? n.id : null);
      if (!orderId) return null;
      return {
        label: 'Track Order',
        icon: 'route',
        to: `/dashboard/tracking?search=${encodeURIComponent(orderId)}&orderId=${encodeURIComponent(orderId)}`,
      };
    }

    case 'low_stock': {
      const pName = meta.product_name;
      return {
        label: 'View Stock',
        icon: 'inventory_2',
        to: pName
          ? `/dashboard/products?tab=stock&search=${encodeURIComponent(pName)}`
          : '/dashboard/products?tab=stock',
      };
    }

    case 'stock_request': {
      return {
        label: 'View Request',
        icon: 'assignment',
        to: '/dashboard/products?tab=stock&section=requests',
      };
    }

    case 'vendor': {
      return {
        label: 'Vendor Orders',
        icon: 'local_shipping',
        to: '/dashboard/vendor',
      };
    }

    case 'dispatch_alert': {
      return {
        label: 'Open Messages',
        icon: 'forum',
        to: '/dashboard/messages',
      };
    }

    default:
      return null;
  }
}

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
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/90 dark:border-zinc-800 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-[#1b4d24] dark:text-emerald-400">
              <span className="material-symbols-outlined text-3xl">
                {isDriver ? 'local_shipping' : 'notifications_active'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-zinc-50 tracking-tight">
                  {isDriver ? 'Delivery Notification Channel' : 'Notification Center'}
                </h1>
                {isDriver && (
                  <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    Fulfillment Live
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-zinc-400 mt-1">
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
              className="px-3 py-2 text-xs font-semibold border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 outline-none hover:border-gray-400 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="1">Last 24 Hours</option>
              <option value="3">Last 3 Days</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 transition text-gray-600 dark:text-zinc-300 active:scale-95"
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
                  accent: '#1b4d24',
                },
                {
                  key: 'delivery_assigned',
                  label: 'Assigned To Me',
                  icon: 'local_shipping',
                  value: summary.delivery_assigned ?? 0,
                  accent: '#059669',
                },
                {
                  key: 'new_delivery',
                  label: 'Pending Dispatches',
                  icon: 'route',
                  value: summary.new_delivery ?? 0,
                  accent: '#0891b2',
                },
                {
                  key: 'dispatch_alert',
                  label: 'Dispatch Alerts',
                  icon: 'campaign',
                  value: summary.dispatch_alert ?? 0,
                  accent: '#d97706',
                },
              ].map((item) => {
                const active = activeCategory === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setCategory(active && item.key !== 'all' ? 'all' : (item.key as Category))}
                    aria-pressed={active}
                    className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 text-left transition hover:shadow-xs active:scale-[0.99] flex flex-col justify-between"
                    style={{
                      borderColor: active ? item.accent : undefined,
                      boxShadow: active ? `0 0 0 2px ${item.accent}33` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-2xl shrink-0" style={{ color: item.accent }}>
                        {item.icon}
                      </span>
                      <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between w-full">
                      <p className="text-2xl font-black text-gray-900 dark:text-zinc-50">{item.value}</p>
                      <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-500">
                        {active ? 'Active Filter' : 'Filter'}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              // ── General Operations KPI Cards ───────────────────────────────
              [
                { key: 'low_stock',     label: 'Low Stock Alerts', icon: 'warning',        value: summary.low_stock ?? 0,     accent: '#e11d48' },
                { key: 'stock_request', label: 'Stock Requests',   icon: 'assignment',     value: summary.stock_request ?? 0, accent: '#d97706' },
                { key: 'new_order',     label: 'Pending Orders',   icon: 'shopping_cart',  value: summary.new_order ?? 0,     accent: '#2563eb' },
                { key: 'vendor',        label: 'Vendor Purchases', icon: 'local_shipping', value: summary.vendor ?? 0,        accent: '#059669' },
              ]
                .filter(item => !isStoreManager || item.key === 'stock_request' || item.key === 'new_order')
                .map((item) => {
                  const active = activeCategory === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setCategory(active ? 'all' : (item.key as Category))}
                      aria-pressed={active}
                      className="bg-white dark:bg-zinc-900 rounded-2xl border p-4 text-left transition hover:shadow-xs active:scale-[0.99] flex flex-col justify-between"
                      style={{
                        borderColor: active ? item.accent : undefined,
                        boxShadow: active ? `0 0 0 2px ${item.accent}33` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-2xl shrink-0" style={{ color: item.accent }}>
                          {item.icon}
                        </span>
                        <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider truncate">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between w-full">
                        <p className="text-2xl font-black text-gray-900 dark:text-zinc-50">{item.value}</p>
                        <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-500">
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
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-xs">
          {loading ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined animate-spin text-4xl text-emerald-600 dark:text-emerald-400">sync</span>
              <p className="text-gray-500 dark:text-zinc-400 mt-3 text-sm font-medium">Fetching notification channel stream…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3 text-gray-400 dark:text-zinc-500">
                <span className="material-symbols-outlined text-3xl">notifications_off</span>
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100">
                No {activeCategory === 'all' ? '' : `${activeCategory.replace('_', ' ')} `}notifications in this window
              </h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {activeCategory === 'all'
                  ? 'All delivery and operational queues are clear. Adjust the date range filter above to review older logs.'
                  : 'Click the active filter card to reset and show all operational events.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {notifications.map((n, i) => {
                const meta = n.metadata || {};
                const action = getNotificationAction(n);

                return (
                  <div
                    key={`${n.id}-${i}`}
                    className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 sm:p-5 hover:bg-gray-50/80 dark:hover:bg-zinc-800/50 transition"
                  >
                    {/* Content Section (no vertical bar, no dot indicator) */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                        <span className={`text-xs font-black uppercase tracking-wider ${CATEGORY_TEXT_COLORS[n.category] ?? 'text-gray-700 dark:text-gray-300'}`}>
                          {n.category.replace('_', ' ')}
                        </span>
                        <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-gray-900 dark:text-zinc-100 leading-snug">
                        {n.title}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 mt-1 leading-relaxed">
                        {n.body}
                      </p>

                      {/* Metadata row: clean typography without low-opacity pill backgrounds */}
                      <div className="flex flex-wrap items-center gap-3 mt-2.5">
                        {meta.city && (
                          <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-gray-400 dark:text-zinc-500">location_on</span>
                            {meta.city}
                          </span>
                        )}
                        {meta.phone && (
                          <span className="text-xs font-mono font-semibold text-gray-700 dark:text-zinc-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-gray-400 dark:text-zinc-500">call</span>
                            {meta.phone}
                          </span>
                        )}
                        {meta.total !== undefined && (
                          <span className="text-xs font-mono font-black text-emerald-700 dark:text-emerald-400">
                            {Number(meta.total).toLocaleString()} ETB
                          </span>
                        )}
                        {meta.status && (
                          <span className={`text-xs font-black uppercase tracking-wider ${getStatusTextColor(meta.status)}`}>
                            {meta.status}
                          </span>
                        )}
                        {meta.sender_name && (
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-amber-500">person</span>
                            {meta.sender_name} ({meta.sender_role || 'Staff'})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Operational Action button: properly wired per category */}
                    {action && (
                      <div className="shrink-0 self-end sm:self-center">
                        <Link
                          to={action.to}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1b4d24] text-white hover:bg-[#133619] dark:bg-emerald-700 dark:hover:bg-emerald-600 transition shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-sm">{action.icon}</span>
                          {action.label}
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
            <div className="px-5 py-3 bg-gray-50/90 dark:bg-zinc-800/80 border-t border-gray-100 dark:border-zinc-800 text-[11px] font-medium text-gray-500 dark:text-zinc-400 text-center flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-xs">sync</span>
              <span>Showing {notifications.length} events · Stream refreshes every 30 seconds</span>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
