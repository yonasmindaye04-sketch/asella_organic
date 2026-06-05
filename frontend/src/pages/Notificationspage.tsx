/**
 * NotificationsPage.tsx
 * Asella Organic — In-App Notification Center
 *
 * Shows aggregated events from all parts of the system in one place.
 * Categories: Low Stock, Stock Requests, New Orders, Vendor Movements.
 * Admin/Manager only.
 */
import { useState, useEffect, useCallback } from 'react';
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

const CATEGORIES: { key: Category; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'all',           label: 'All',            icon: 'notifications',  color: 'text-gray-600',   bg: 'bg-gray-100' },
  { key: 'low_stock',     label: 'Low Stock',      icon: 'warning',        color: 'text-red-600',    bg: 'bg-red-50' },
  { key: 'stock_request', label: 'Stock Requests', icon: 'assignment',     color: 'text-amber-600',  bg: 'bg-amber-50' },
  { key: 'new_order',     label: 'New Orders',     icon: 'shopping_cart',  color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'vendor',        label: 'Vendor',         color: 'text-green-600', bg: 'bg-green-50', icon: 'local_shipping' },
];

const CATEGORY_STYLES: Record<string, { dot: string; badge: string; border: string }> = {
  low_stock:     { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',    border: 'border-red-200' },
  stock_request: { dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700',border: 'border-amber-200' },
  new_order:     { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',  border: 'border-blue-200' },
  vendor:        { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700',border: 'border-green-200' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
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
        api.get<Summary>('/api/notifications/summary'),
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
      <div className="max-w-5xl mx-auto py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#112415]">Notification Center</h1>
            <p className="text-sm text-gray-500 mt-0.5">All system events in one place.</p>
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
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { key: 'low_stock',     label: 'Low Stock Alerts', icon: '⚠️', value: summary.low_stock,     color: 'border-red-200 bg-red-50' },
              { key: 'stock_request', label: 'Stock Requests',   icon: '📋', value: summary.stock_request,  color: 'border-amber-200 bg-amber-50' },
              { key: 'new_order',     label: 'Pending Orders',   icon: '🛒', value: summary.new_order,      color: 'border-blue-200 bg-blue-50' },
              { key: 'vendor',        label: 'Vendor Movements', icon: '🚚', value: summary.vendor,         color: 'border-green-200 bg-green-50' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setCategory(item.key as Category)}
                className={`border rounded-xl p-4 text-left transition hover:shadow-md ${item.color} ${activeCategory === item.key ? 'ring-2 ring-[#112415]' : ''}`}
              >
                <div className="text-2xl mb-1">{item.icon}</div>
                <div className="text-2xl font-bold text-[#112415]">{item.value}</div>
                <div className="text-xs text-gray-600 font-medium">{item.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Last 24h</div>
              </button>
            ))}
          </div>
        )}

        {/* Category filter tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition
                ${activeCategory === cat.key
                  ? 'bg-[#112415] text-white shadow-sm'
                  : `${cat.bg} ${cat.color} hover:shadow-sm`
                }`}
            >
              <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
              {cat.label}
              {cat.key !== 'all' && summary && summary[cat.key] > 0 && (
                <span className="bg-white/30 text-current text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {summary[cat.key as keyof Summary]}
                </span>
              )}
            </button>
          ))}
        </div>

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
              <p className="text-gray-400 mt-3 font-medium">No notifications in this period.</p>
              <p className="text-gray-300 text-sm mt-1">Try expanding the date range above.</p>
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
                              <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                                n.metadata.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                n.metadata.status === 'received' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-600'
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
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                              n.metadata.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
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
              Showing {notifications.length} events · Auto-refreshes every 60 seconds
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}