/**
 * NotificationsPage.tsx
 * Asella Organic — In-App Notification Center
 *
 * Displays aggregated system events and unread notification summary metrics
 * fetched from /api/notifications/unread-counts and /api/notifications.
 * Categories: Low Stock, Stock Requests, New Orders, Vendor Movements.
 * Admin/Manager only.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  notificationsApi,
  type NotificationCategory,
  type NotificationItem,
  type NotificationSummary,
} from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

type Category = NotificationCategory;

const CATEGORIES: {
  key: Category;
  label: string;
  icon: string;
  badgeClass: string;
}[] = [
  {
    key: 'all',
    label: 'All Events',
    icon: 'notifications',
    badgeClass: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200',
  },
  {
    key: 'low_stock',
    label: 'Low Stock',
    icon: 'warning',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  },
  {
    key: 'stock_request',
    label: 'Stock Requests',
    icon: 'assignment',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  {
    key: 'new_order',
    label: 'Pending Orders',
    icon: 'shopping_cart',
    badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  },
  {
    key: 'vendor',
    label: 'Vendor Purchases',
    icon: 'local_shipping',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
];

const CATEGORY_STYLES: Record<
  string,
  { dot: string; badge: string; border: string; icon: string }
> = {
  low_stock: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20',
    border: 'border-l-rose-500',
    icon: 'warning',
  },
  stock_request: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
    border: 'border-l-amber-500',
    icon: 'assignment',
  },
  new_order: {
    dot: 'bg-sky-500',
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20',
    border: 'border-l-sky-500',
    icon: 'shopping_cart',
  },
  vendor: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
    border: 'border-l-emerald-500',
    icon: 'local_shipping',
  },
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

const DEFAULT_SUMMARY: NotificationSummary = {
  low_stock: 0,
  stock_request: 0,
  new_order: 0,
  vendor: 0,
  total: 0,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>(DEFAULT_SUMMARY);
  const [activeCategory, setCategory] = useState<Category>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [since, setSince] = useState('7'); // days

  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  const getSinceDateStr = useCallback(() => {
    return new Date(Date.now() - Number(since) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }, [since]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sinceDate = getSinceDateStr();
      const [notifRes, summRes] = await Promise.all([
        notificationsApi.list({
          since: sinceDate,
          category: activeCategory === 'all' ? undefined : activeCategory,
          limit: 100,
          unread: unreadOnly ? true : undefined,
        }),
        notificationsApi.unreadCounts(sinceDate),
      ]);
      if (notifRes.success && Array.isArray(notifRes.data)) {
        setNotifications(notifRes.data);
      }
      if (summRes.success && summRes.data) {
        setSummary(summRes.data);
        window.dispatchEvent(
          new CustomEvent('asella:notifications-updated', { detail: summRes.data })
        );
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [activeCategory, getSinceDateStr, unreadOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const t = setInterval(fetchData, 60_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const unreadFeedCount = notifications.filter((n) => !n.read).length;
  const activeUnreadCount =
    activeCategory === 'all'
      ? Math.max(summary.total, unreadFeedCount)
      : Math.max(summary[activeCategory] ?? 0, unreadFeedCount);
  const hasAnyUnread = summary.total > 0 || unreadFeedCount > 0;

  const handleMarkItemRead = async (item: NotificationItem) => {
    if (item.read) return;
    try {
      const sinceDate = getSinceDateStr();
      const res = await notificationsApi.markRead({
        id: item.id,
        category: item.category,
        since: sinceDate,
      });
      setNotifications((prev) =>
        unreadOnly
          ? prev.filter((n) => !(n.id === item.id && n.category === item.category))
          : prev.map((n) =>
              n.id === item.id && n.category === item.category ? { ...n, read: true } : n
            )
      );
      if (res.success && res.data) {
        setSummary(res.data);
        window.dispatchEvent(
          new CustomEvent('asella:notifications-updated', { detail: res.data })
        );
      }
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    setBulkSuccessMsg(null);
    try {
      const sinceDate = getSinceDateStr();
      const unreadItems = notifications.filter((n) => !n.read);
      const targetCategory = activeCategory === 'all' ? undefined : activeCategory;

      const res = await notificationsApi.markAllRead({
        category: targetCategory,
        since: sinceDate,
        ids: unreadItems.map((n) => `${n.category}:${n.id}`),
        items: unreadItems.map((n) => ({ id: n.id, category: n.category })),
      });

      setNotifications((prev) =>
        unreadOnly ? [] : prev.map((n) => ({ ...n, read: true }))
      );

      const nextSummary: NotificationSummary =
        res.success && res.data
          ? res.data
          : targetCategory
          ? {
              ...summary,
              [targetCategory]: 0,
              total: Math.max(0, summary.total - (summary[targetCategory] ?? 0)),
            }
          : DEFAULT_SUMMARY;

      setSummary(nextSummary);
      window.dispatchEvent(
        new CustomEvent('asella:notifications-updated', { detail: nextSummary })
      );

      const categoryLabel =
        activeCategory === 'all'
          ? 'All notifications'
          : CATEGORIES.find((c) => c.key === activeCategory)?.label ?? 'Notifications';
      setBulkSuccessMsg(`${categoryLabel} marked as read.`);
      setTimeout(() => setBulkSuccessMsg(null), 4000);
    } finally {
      setMarkingAll(false);
    }
  };

  const summaryCards = [
    {
      key: 'low_stock' as const,
      label: 'Unread Low Stock',
      subtext: 'Inventory below threshold',
      icon: 'warning',
      value: summary.low_stock,
      accentClass: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
      activeRing: 'border-rose-500 ring-1 ring-rose-500/40',
    },
    {
      key: 'stock_request' as const,
      label: 'Unread Stock Requests',
      subtext: 'Pending branch requests',
      icon: 'assignment',
      value: summary.stock_request,
      accentClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
      activeRing: 'border-amber-500 ring-1 ring-amber-500/40',
    },
    {
      key: 'new_order' as const,
      label: 'Unread Pending Orders',
      subtext: 'Awaiting fulfillment',
      icon: 'shopping_cart',
      value: summary.new_order,
      accentClass: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
      activeRing: 'border-sky-500 ring-1 ring-sky-500/40',
    },
    {
      key: 'vendor' as const,
      label: 'Unread Vendor Events',
      subtext: 'Supplier shipments & POs',
      icon: 'local_shipping',
      value: summary.vendor,
      accentClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      activeRing: 'border-emerald-600 ring-1 ring-emerald-600/40',
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Notification Center
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 tabular-nums">
                {summary.total} unread
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Real-time alerts across inventory thresholds, stock requests, customer orders, and vendor deliveries
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Unread-only toggle */}
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                unreadOnly
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">mark_email_unread</span>
              <span>Unread Only</span>
            </button>

            {/* Primary Bulk Mark All as Read Button */}
            <button
              type="button"
              data-testid="mark-all-read-btn"
              disabled={markingAll || !hasAnyUnread}
              onClick={handleMarkAllRead}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                hasAnyUnread
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {markingAll ? 'progress_activity' : 'done_all'}
              </span>
              <span>
                {markingAll
                  ? 'Marking all as read…'
                  : activeCategory === 'all'
                  ? 'Mark all as read'
                  : `Mark ${
                      CATEGORIES.find((c) => c.key === activeCategory)?.label ?? 'category'
                    } as read`}
              </span>
              {hasAnyUnread && !markingAll && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded bg-white/20 text-[10px] font-bold tabular-nums">
                  {activeUnreadCount}
                </span>
              )}
            </button>

            {/* Time window selector */}
            <select
              value={since}
              onChange={(e) => setSince(e.target.value)}
              aria-label="Notification time range"
              className="px-3 py-1.5 text-xs font-semibold border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>

            <button
              type="button"
              onClick={fetchData}
              className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 transition cursor-pointer"
              title="Refresh notifications"
            >
              <span className="material-symbols-outlined text-[17px]">refresh</span>
            </button>
          </div>
        </div>

        {/* Bulk Update Confirmation Banner */}
        {bulkSuccessMsg && (
          <div
            role="status"
            className="mb-4 px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
                check_circle
              </span>
              <span>{bulkSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setBulkSuccessMsg(null)}
              className="text-emerald-700 dark:text-emerald-400 hover:opacity-75 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <span className="material-symbols-outlined text-[15px]">close</span>
            </button>
          </div>
        )}

        {/* Unread Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {summaryCards.map((item, i) => {
            const isSelected = activeCategory === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  setCategory((prev) => (prev === item.key ? 'all' : item.key))
                }
                className={`card p-4 text-left transition-all animate-in cursor-pointer flex flex-col justify-between ${
                  isSelected ? item.activeRing : ''
                }`}
                style={{ animationDelay: `${0.04 * i}s` }}
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {item.label}
                    </p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mt-1 tabular-nums">
                      {item.value}
                    </p>
                  </div>
                  <div
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${item.accentClass}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between w-full text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>{item.subtext}</span>
                  <span className="font-semibold tabular-nums">
                    {since === '1' ? '24h window' : `${since}d window`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            const countValue =
              cat.key === 'all' ? summary.total : summary[cat.key as keyof NotificationSummary];

            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategory(cat.key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-2xs'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${
                    isActive
                      ? 'bg-white/20 dark:bg-zinc-900/20 text-current'
                      : cat.badgeClass
                  }`}
                >
                  {countValue}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notification Feed */}
        <div className="card overflow-hidden">
          {/* Feed Header Bar with Bulk Action */}
          {!loading && notifications.length > 0 && (
            <div className="px-5 py-3 bg-zinc-50/80 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {notifications.length} {notifications.length === 1 ? 'event' : 'events'}
                </span>
                <span>·</span>
                <span className="tabular-nums">
                  {unreadFeedCount} unread in current list
                </span>
              </div>
              {unreadFeedCount > 0 && (
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">done_all</span>
                  <span>{markingAll ? 'Updating…' : 'Mark all as read'}</span>
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined animate-spin text-3xl text-emerald-600">
                progress_activity
              </span>
              <p className="text-zinc-500 dark:text-zinc-400 mt-3 text-xs font-medium">
                Loading notifications…
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-4xl text-zinc-300 dark:text-zinc-700">
                notifications_off
              </span>
              <p className="text-zinc-600 dark:text-zinc-300 mt-3 text-sm font-semibold">
                {unreadOnly
                  ? 'All caught up! No unread notifications in this period.'
                  : 'No notifications in this period.'}
              </p>
              <p className="text-zinc-400 text-xs mt-1">
                Try expanding the date range filter above.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {notifications.map((n, i) => {
                const style = CATEGORY_STYLES[n.category] ?? CATEGORY_STYLES['new_order'];
                const isRead = Boolean(n.read);

                return (
                  <div
                    key={`${n.category}-${n.id}-${i}`}
                    onClick={() => handleMarkItemRead(n)}
                    className={`flex gap-4 px-5 py-4 transition-colors border-l-4 ${style.border} ${
                      isRead
                        ? 'bg-white dark:bg-zinc-900/40 opacity-75'
                        : 'bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer'
                    }`}
                  >
                    {/* Unread status dot */}
                    <div className="flex flex-col items-center pt-1.5">
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isRead ? 'bg-zinc-300 dark:bg-zinc-700' : style.dot
                        }`}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-sm truncate ${
                                isRead
                                  ? 'font-medium text-zinc-600 dark:text-zinc-400'
                                  : 'font-semibold text-zinc-900 dark:text-zinc-100'
                              }`}
                            >
                              {n.title}
                            </p>
                            {!isRead && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                Unread
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                            {n.body}
                          </p>
                        </div>

                        <div className="shrink-0 text-right flex flex-col items-end gap-1">
                          <span
                            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide ${style.badge}`}
                          >
                            {n.category.replace('_', ' ')}
                          </span>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] text-zinc-400 whitespace-nowrap tabular-nums">
                              {timeAgo(n.created_at)}
                            </p>
                            {!isRead && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkItemRead(n);
                                }}
                                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Metadata chips */}
                      {n.metadata && Object.keys(n.metadata).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {n.category === 'low_stock' &&
                            n.metadata.quantity_after !== undefined && (
                              <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-md tabular-nums">
                                Remaining: {n.metadata.quantity_after} / Threshold:{' '}
                                {n.metadata.threshold}
                              </span>
                            )}
                          {n.category === 'stock_request' && (
                            <>
                              <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-md tabular-nums">
                                Needed: {n.metadata.qty_needed} units
                              </span>
                              {n.metadata.package_size && (
                                <span className="text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-mono font-semibold">
                                  {n.metadata.package_size}
                                </span>
                              )}
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-md font-medium capitalize ${
                                  n.metadata.status === 'pending'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                    : n.metadata.status === 'received'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                }`}
                              >
                                {n.metadata.status}
                              </span>
                            </>
                          )}
                          {n.category === 'new_order' && (
                            <>
                              <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-md">
                                {n.metadata.source}
                              </span>
                              <span className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-md">
                                {n.metadata.city}
                              </span>
                              <span className="text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md font-mono font-semibold tabular-nums">
                                {Number(n.metadata.total || 0).toLocaleString()} ETB
                              </span>
                            </>
                          )}
                          {n.category === 'vendor' && (
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-md font-medium capitalize ${
                                String(n.metadata.status || '').toLowerCase() === 'received' ||
                                String(n.metadata.status || '').toLowerCase() === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              }`}
                            >
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
            <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
              <span>Showing {notifications.length} events</span>
              <span className="tabular-nums">
                {summary.total} unread in {since === '1' ? 'last 24h' : `last ${since} days`} · Auto-refreshes every 60s
              </span>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}