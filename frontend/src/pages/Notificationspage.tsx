/**
 * NotificationsPage.tsx
 * Asella Organic — In-App Notification Center
 *
 * Shows aggregated events from all parts of the system in one place.
 * Categories: Low Stock, Stock Requests, New Orders, Vendor Movements.
 * Admin/Manager only.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

type Category = 'all' | 'low_stock' | 'stock_request' | 'new_order' | 'vendor';

interface Notification {
  id: string;
  category: Category;
  title: string;
  body: string;
  created_at: string;
  metadata: Record<string, any>;
}

interface Summary {
  low_stock: number; stock_request: number;
  new_order: number; vendor: number; total: number;
}

const CATEGORY_STYLES: Record<string, { dot: string; badge: string; border: string }> = {
  low_stock:     { dot: 'bg-red-500',    badge: 'text-red-600',    border: 'border-red-200' },
  stock_request: { dot: 'bg-amber-500',  badge: 'text-amber-600',  border: 'border-amber-200' },
  new_order:     { dot: 'bg-blue-500',   badge: 'text-blue-600',   border: 'border-blue-200' },
  vendor:        { dot: 'bg-green-500',  badge: 'text-green-700',  border: 'border-green-200' },
};

function timeAgo(datastr:string){
  const diff = Date.now()-new Date(datastr).getTime();
  const mins =Math.floor(diff/60000);
  if (mins < 1) return 'just now';
 if (mins < 60)return `${mins}m ago`;
 const hrs = Math.floor(mins/60);
 if (hrs <24 ) return `${hrs}h ago`;
 return `${Math.floor(hrs/24)}d ago`
}


export default function NotificationsPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const isStoreManager = user?.role === 'store_manager';
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
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [activeCategory, since]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const t = setInterval(fetchData, 60_000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#112415]">Notification Center</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isStoreManager ? 'Your stock requests and order updates.' : 'All system events in one place.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={since}
              onChange={e => setSince(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white outline-none"
            >
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <button onClick={fetchData}
              className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition"
              title="Refresh"
            >
              <span className="material-symbols-outlined text-gray-500">refresh</span>
            </button>
          </div>
        </div>

        {/* Summary KPI row */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { key: 'low_stock',     label: 'Low Stock Alerts', icon: 'warning',        value: summary.low_stock,     iconBg: 'bg-red-500 shadow-sm shadow-red-500/20',     iconColor: 'text-white', accent: '#ef4444' },
              { key: 'stock_request', label: 'Stock Requests',   icon: 'assignment',     value: summary.stock_request, iconBg: 'bg-amber-500 shadow-sm shadow-amber-500/20', iconColor: 'text-white', accent: '#f59e0b' },
              { key: 'new_order',     label: 'Pending Orders',   icon: 'shopping_cart',  value: summary.new_order,     iconBg: 'bg-blue-500 shadow-sm shadow-blue-500/20',   iconColor: 'text-white', accent: '#3b82f6' },
              { key: 'vendor',        label: 'Vendor Movements', icon: 'local_shipping', value: summary.vendor,        iconBg: 'bg-emerald-600 shadow-sm shadow-emerald-500/20', iconColor: 'text-white', accent: '#059669' },
            ].filter((item) => !isStoreManager || item.key === 'stock_request' || item.key === 'new_order').map((item, i) => {
              const active = activeCategory === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setCategory(active ? 'all' : item.key as Category)}
                  aria-pressed={active}
                  title={active ? 'Show all notifications' : `Filter by ${item.label}`}
                  className="card p-4 text-left transition animate-in hover:scale-[1.02] duration-200 flex flex-col justify-center border"
                  style={{
                    animationDelay: `${0.05 * i}s`,
                    borderColor: active ? item.accent : undefined,
                    boxShadow: active ? `0 0 0 3px ${item.accent}26` : undefined,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2 relative z-[2]">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 hover:scale-110 ${item.iconBg}`}>
                      <span className={`material-symbols-outlined text-[16px] ${item.iconColor}`}>{item.icon}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between w-full">
                    <p className="text-2xl font-extrabold text-[var(--fg)] relative z-[2]">{item.value}</p>
                    <p
                      className="text-[10px] font-medium"
                      style={{ color: active ? item.accent : 'var(--muted)' }}
                    >
                      {active ? 'Filtering' : since === '1' ? 'Last 24h' : `Last ${since} days`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Notification list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">sync</span>
              <p className="text-gray-400 mt-3 text-sm">Loading notifications…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-5xl text-gray-200">notifications_off</span>
              <p className="text-gray-400 mt-3 font-medium">
                No {activeCategory === 'all' ? '' : `${activeCategory.replace('_', ' ')} `}notifications in this period.
              </p>
              <p className="text-gray-300 text-sm mt-1">
                {activeCategory === 'all'
                  ? 'Try expanding the date range above.'
                  : 'Click the active card again to show all events.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n, i) => {
                const style = CATEGORY_STYLES[n.category] ?? CATEGORY_STYLES['new_order'];
                return (
                  <div key={`${n.id}-${i}`}
                    className={`flex gap-4 px-6 py-4 hover:bg-gray-50 transition border-l-4 ${style.border}`}
                  >
                    {/* Dot */}
                    <div className="flex flex-col items-center pt-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#112415] truncate">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${style.badge}`}>
                            {n.category.replace('_', ' ')}
                          </span>
                          <p className="text-[11px] text-gray-400 mt-1 whitespace-nowrap">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>

                      {/* Metadata chips */}
                      {n.metadata && Object.keys(n.metadata).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {n.category === 'low_stock' && n.metadata.quantity_after !== undefined && (
                            <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              Qty: {n.metadata.quantity_after} / {n.metadata.threshold}
                            </span>
                          )}
                          {n.category === 'stock_request' && (
                            <>
                              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                Need: {n.metadata.qty_needed} units
                              </span>
                              {n.metadata.package_size && (
                                <span className="text-[11px] bg-highland-gold/10 text-highland-gold border border-highland-gold/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                                   {n.metadata.package_size}
                                </span>
                              )}
                              <span className={`text-[11px] font-bold ${
                                n.metadata.status === 'pending' ? 'text-amber-700 dark:text-amber-400' :
                                n.metadata.status === 'received' ? 'text-green-700 dark:text-green-400' :
                                'text-gray-600 dark:text-gray-400'
                              }`}>
                                {n.metadata.status}
                              </span>
                            </>
                          )}
                          {n.category === 'new_order' && (
                            <>
                              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {n.metadata.source}
                              </span>
                              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {n.metadata.city}
                              </span>
                              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                                {Number(n.metadata.total || 0).toFixed(0)} ETB
                              </span>
                            </>
                          )}
                          {n.category === 'vendor' && (
                            <span className={`text-[11px] font-bold ${
                              n.metadata.status === 'completed' || n.metadata.status === 'received' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'
                            }`}>
                              {n.metadata.status}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
              Showing {notifications.length} events
              {activeCategory !== 'all' && ` · ${activeCategory.replace('_', ' ')} only`}
              {' '}· Auto-refreshes every 60 seconds
              {activeCategory !== 'all' && ' · Click the active card to show all'}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}