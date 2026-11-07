/**
 * Sidebar.tsx — restored legacy workspace sidebar.
 *
 * Keeps the original deep-charcoal palette (#1a1a1a), pill-shaped active
 * states, uppercase section labels and the bottom profile row. The only
 * functional additions are the global Team Performance drawer trigger and
 * the current role-based navigation list.
 */
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { api, auth as authApi } from '../../services/api';
import { useTeamPerformance } from '../../context/TeamPerformanceContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined sidebar-icon ${className}`}>{name}</span>
);

const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const { openPanel: openTeamPerformance } = useTeamPerformance();

  const [pendingCount, setPendingCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [hasNewIncoming, setHasNewIncoming] = useState(false);

  const role = (user?.role || 'guest').toLowerCase();
  const displayName = user?.name || user?.full_name || user?.username || 'Staff';
  const displayRole =
    role === 'delivery' ? 'Driver' :
    role === 'store_manager' ? 'Sub Store Manager' :
    role === 'call_center' ? 'Call Center Agent' :
    role === 'tech_support' ? 'Tech Support' :
    role.charAt(0).toUpperCase() + role.slice(1);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await api.get<Array<{ id: string }>>('/api/orders?status=Pending&limit=200');
        if (res.success && res.data) setPendingCount(res.data.length);
      } catch { /* ignore */ }
    };
    fetchPending();
    const t = setInterval(fetchPending, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (role !== 'admin' && role !== 'manager' && role !== 'store_manager' && role !== 'delivery' && role !== 'driver' && role !== 'tech_support' && role !== 'call_center') return;
    const fetchNotifs = async () => {
      try {
        const res = await api.get<{ total: number }>('/api/notifications/summary');
        if (res.success && res.data) setNotifCount(res.data.total);
      } catch { /* ignore */ }
    };
    fetchNotifs();
    const t = setInterval(fetchNotifs, 60_000);
    return () => clearInterval(t);
  }, [role]);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const channelReadsRaw = localStorage.getItem('asella_channel_reads') || '{}';
        const res = await api.get<{
          unread: number;
          channel_unreads?: Record<string, number>;
          latest?: any;
        }>(`/api/messages/unread?channel_reads=${encodeURIComponent(channelReadsRaw)}`);
        if (res.success && res.data) {
          const count = res.data.unread || 0;
          setUnreadMsgCount(count);
          if (count > 0) {
            setHasNewIncoming(true);
          } else {
            setHasNewIncoming(false);
          }
        }
      } catch {
        /* ignore */
      }
    };

    fetchUnread();
    const t = setInterval(fetchUnread, 10_000);

    const handleChannelRead = () => {
      fetchUnread();
    };

    const handleMessagesRead = () => {
      fetchUnread();
    };

    const handleNewMessage = () => {
      setUnreadMsgCount((prev) => prev + 1);
      setHasNewIncoming(true);
    };

    window.addEventListener('asella:channel-read', handleChannelRead);
    window.addEventListener('asella:messages-read', handleMessagesRead);
    window.addEventListener('asella:new-message-received', handleNewMessage);

    return () => {
      clearInterval(t);
      window.removeEventListener('asella:channel-read', handleChannelRead);
      window.removeEventListener('asella:messages-read', handleMessagesRead);
      window.removeEventListener('asella:new-message-received', handleNewMessage);
    };
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const isDriver = role === 'delivery' || role === 'driver';
  const isEmployee = role === 'employee' || role === 'staff';
  const isStoreManager = role === 'store_manager';
  const isCallCenter = role === 'call_center';

  /** Only close the drawer on mobile / small window; desktop keeps the rail open. */
  const handleMobileNav = () => {
    if (window.innerWidth < 1024) onClose?.();
  };

  const NavItem: React.FC<{
    to: string;
    icon: string;
    label: string;
    badge?: number;
    badgeVariant?: 'amber' | 'rose' | 'emerald' | 'red';
  }> = ({ to, icon, label, badge, badgeVariant = 'amber' }) => {
    const active = isActive(to);
    return (
      <li>
        <Link
          to={to}
          onClick={handleMobileNav}
          className={`sidebar-nav-item ${active ? 'active' : ''}`}
          title={!isOpen ? label : undefined}
        >
          <Icon name={icon} />
          <span className="sidebar-nav-label">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`sidebar-badge ${(badgeVariant === 'rose' || badgeVariant === 'red') ? 'bg-red-600 text-white font-bold' : badgeVariant === 'emerald' ? 'bg-[#1b4d24]' : 'bg-amber-500'} ${hasNewIncoming && (badgeVariant === 'rose' || badgeVariant === 'red') ? 'animate-pulse ring-2 ring-red-400' : ''}`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const NavAction: React.FC<{ icon: string; label: string; onClick: () => void }> = ({
    icon,
    label,
    onClick,
  }) => (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={!isOpen ? label : undefined}
        className="sidebar-nav-item w-full border-0 bg-transparent text-left"
      >
        <Icon name={icon} />
        <span className="sidebar-nav-label">{label}</span>
      </button>
    </li>
  );

  const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="sidebar-section-label">{children}</div>
  );

  const Divider = () => <div className="sidebar-divider" />;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar-root ${isOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        <div className="sidebar-header-toggle flex items-center justify-between">
          <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="sidebar-hamburger-btn"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Icon name="menu" />
          </button>
            <span className="font-heading font-black text-xs sm:text-sm text-white tracking-wide lg:hidden pl-1 select-none">
              ASELLA ORGANIC
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer mr-1"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {isDriver ? (
            <>
              <SectionLabel>Fulfillment</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/my-performance" icon="monitoring" label="My Performance" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
                <NavItem
                  to="/dashboard/notifications"
                  icon="notifications"
                  label="Notifications"
                  badge={notifCount}
                  badgeVariant="rose"
                />
                <NavItem to="/dashboard/messages" icon="forum" label="Internal Messaging" badge={unreadMsgCount} badgeVariant="red" />
              </ul>
            </>
          ) : isStoreManager ? (
            <>
              <SectionLabel>Store Operations</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/pos" icon="point_of_sale" label="POS Terminal" />
                <NavItem to="/dashboard/my-performance" icon="monitoring" label="My Performance" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
                <NavItem
                  to="/dashboard/notifications"
                  icon="notifications"
                  label="Notifications"
                  badge={notifCount}
                  badgeVariant="rose"
                />
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Ordering" />
                <NavItem to="/dashboard/store-report" icon="summarize" label="Reporting Channel" />
                <NavItem to="/dashboard/stock-request" icon="assignment" label="Stock Request" />
                <NavItem to="/dashboard/messages" icon="forum" label="Internal Messaging" badge={unreadMsgCount} badgeVariant="red" />
              </ul>
            </>
          ) : isCallCenter ? (
            <>
              <SectionLabel>Call Center Operations</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/pos" icon="point_of_sale" label="POS Terminal" />
                <NavItem to="/dashboard/my-performance" icon="monitoring" label="My Performance" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
                <NavItem
                  to="/dashboard/notifications"
                  icon="notifications"
                  label="Notifications"
                  badge={notifCount}
                  badgeVariant="rose"
                />
                <NavItem to="/dashboard/call-center" icon="summarize" label="Reporting Channel" />
                <NavItem to="/dashboard/products" icon="inventory_2" label="Stock & Inventory" />
                <NavItem to="/dashboard/stock-request" icon="assignment" label="Stock Request" />
                <NavItem to="/dashboard/messages" icon="forum" label="Internal Messaging" badge={unreadMsgCount} badgeVariant="red" />
              </ul>
            </>
          ) : isEmployee ? (
            <>
              <SectionLabel>Store Operations</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/pos" icon="point_of_sale" label="POS Terminal" />
                <NavItem to="/dashboard/my-performance" icon="monitoring" label="My Performance" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
                <NavItem to="/dashboard/stock-alert" icon="warning" label="Stock Alerts" />
                <NavItem to="/dashboard/messages" icon="forum" label="Internal Messaging" badge={unreadMsgCount} badgeVariant="red" />
              </ul>
            </>
          ) : (
            <>
              <SectionLabel>Overview</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/pos" icon="point_of_sale" label="POS Terminal" />
                <NavItem to="/dashboard" icon="space_dashboard" label="Analytics Dashboard" />
                <NavItem to="/dashboard/my-performance" icon="monitoring" label="Operational Performance" />
                <NavItem to="/dashboard/analytics" icon="finance" label="P&L Financial Report" />
                <NavAction
                  icon="team_dashboard"
                  label="Team Performance"
                  onClick={() => {
                    openTeamPerformance();
                    handleMobileNav();
                  }}
                />
              </ul>

              <Divider />
              <SectionLabel>Partners &amp; Supply</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Orders" />
                <NavItem to="/dashboard/vendor" icon="local_shipping" label="Vendor Purchase" />
              </ul>

              <Divider />
              <SectionLabel>Catalog &amp; Fulfillment</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/products" icon="package_2" label="Products & Inventory" />
                <NavItem to="/dashboard/stock-alert" icon="warning" label="Stock Alerts" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
              </ul>

              <Divider />
              <SectionLabel>CRM &amp; Operations</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem
                  to="/dashboard/notifications"
                  icon="notifications"
                  label="Notifications"
                  badge={notifCount}
                  badgeVariant="rose"
                />
                <NavItem to="/dashboard/customers" icon="groups" label="Customers" />
                <NavItem to="/dashboard/sms" icon="sms" label="SMS Campaigns" />
                <NavItem to="/dashboard/media" icon="perm_media" label="Media Library" />
                {(role === 'admin' || role === 'tech_support') && (
                  <NavItem to="/dashboard/expenses" icon="receipt_long" label="Expenses" />
                )}
                <NavItem to="/dashboard/messages" icon="forum" label="Internal Messaging" badge={unreadMsgCount} badgeVariant="red" />
                <NavItem to="/dashboard/change-password" icon="shield_lock" label="Security Settings" />
              </ul>

              {(role === 'admin' || role === 'tech_support') && (
                <>
                  <Divider />
                  <SectionLabel>Administration</SectionLabel>
                  <ul className="sidebar-nav-group">
                    <NavItem to="/dashboard/users" icon="manage_accounts" label="Staff & Roles" />
                    <NavItem to="/dashboard/affiliates" icon="handshake" label="Affiliate Control" />
                    <NavItem to="/dashboard/videos" icon="smart_display" label="Community Videos" />
                    <NavItem to="/dashboard/audit-log" icon="history" label="System Audit Log" />
                  </ul>
                </>
              )}
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-divider" />
          <div className="sidebar-user-row">
            <div className="sidebar-user-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{displayName}</p>
              <p className="sidebar-user-role">{displayRole}</p>
            </div>
            <button
              onClick={async () => {
                await authApi.logout();
                dispatch(logout());
                navigate('/login');
              }}
              className="sidebar-logout-btn"
              title="Logout"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
