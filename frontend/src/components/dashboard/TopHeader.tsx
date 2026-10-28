import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { api, auth as authApi } from '../../services/api';

interface TopHeaderProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview & Analytics',
  '/dashboard/analytics': 'Profit & Loss Report',
  '/dashboard/new-order': 'New Sales Order',
  '/dashboard/bulk-orders': 'Bulk Orders',
  '/dashboard/vendor': 'Vendor Purchases',
  '/dashboard/products': 'Products & Inventory',
  '/dashboard/stock-alert': 'Stock Alerts',
  '/dashboard/tracking': 'Order Tracking',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/customers': 'Customer Intelligence',
  '/dashboard/sms': 'SMS Campaigns',
  '/dashboard/media': 'Media Library',
  '/dashboard/expenses': 'Operating Expenses',
  '/dashboard/change-password': 'Security Settings',
  '/dashboard/users': 'Staff & Roles',
  '/dashboard/affiliates': 'Affiliate Control',
  '/dashboard/videos': 'Community Videos',
};

export default function TopHeader({ onToggleSidebar }: TopHeaderProps = {}) {
  const { user } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role ?? 'guest';
  const displayName = user?.name || user?.full_name || user?.username || 'Staff Member';

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentLabel = ROUTE_LABELS[location.pathname] || 'Workspace';

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const res = await api.get<{ total: number }>(`/api/notifications/unread-counts?since=${sinceDate}`);
        if (res.success && res.data) setNotifCount(res.data.total);
      } catch { /* silently ignore */ }
    };
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent<{ total?: number }>).detail;
      if (detail && typeof detail.total === 'number') {
        setNotifCount(detail.total);
      } else {
        fetchNotifications();
      }
    };
    fetchNotifications();
    window.addEventListener('asella:notifications-updated', handleSync);
    const interval = setInterval(fetchNotifications, 60_000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('asella:notifications-updated', handleSync);
    };
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 flex items-center justify-between gap-4 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-xs border-b border-zinc-200 dark:border-zinc-800">
      {/* Left: Mobile Sidebar Trigger + Breadcrumb Trail */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Toggle navigation"
          >
            <span className="material-symbols-outlined text-[18px]">menu</span>
          </button>
        )}

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
          <span className="text-zinc-400 dark:text-zinc-500 font-medium hidden sm:inline whitespace-nowrap">
            Asella Console
          </span>
          <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {currentLabel}
          </span>
        </nav>
      </div>

      {/* Right: Primary Workspace Actions & Account */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[15px] text-zinc-500">storefront</span>
          <span className="hidden sm:inline">View Storefront</span>
        </button>

        <button
          onClick={() => navigate('/dashboard/new-order')}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-2xs whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[15px]">add</span>
          <span>New Order</span>
        </button>

        <button
          onClick={() => navigate('/dashboard/notifications')}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-[17px]">notifications</span>
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-rose-600 text-white text-[10px] font-semibold tabular-nums rounded-full">
              {notifCount > 99 ? '99+' : notifCount}
            </span>
          )}
        </button>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-zinc-900 dark:bg-emerald-600 flex items-center justify-center text-white font-semibold text-xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                {displayName}
              </p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight capitalize">
                {role}
              </p>
            </div>
            <span className={`material-symbols-outlined text-[16px] text-zinc-400 transition-transform ${profileOpen ? "rotate-180" : ""}`}>
              expand_more
            </span>
          </button>

          {profileOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-48 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg py-1.5 z-50">
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{displayName}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize">{role}</p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); navigate('/dashboard/analytics'); }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[15px] text-zinc-500">monitoring</span>
                P&L Financial Report
              </button>
              <button
                onClick={() => { setProfileOpen(false); navigate('/dashboard/change-password'); }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[15px] text-zinc-500">settings</span>
                Security Settings
              </button>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
              <button
                onClick={async () => {
                  setProfileOpen(false);
                  await authApi.logout();
                  dispatch(logout());
                  navigate('/login');
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[15px]">logout</span>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
