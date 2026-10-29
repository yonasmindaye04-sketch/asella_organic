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

  const role = (user?.role || 'guest').toLowerCase();
  const displayName = user?.name || user?.full_name || user?.username || 'Staff';
  const displayRole =
    role === 'delivery' ? 'Driver' :
    role === 'store_manager' ? 'Sub Store Manager' :
    role === 'call_center' ? 'Call Center Agent' :
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
    if (role !== 'admin' && role !== 'manager' && role !== 'store_manager') return;
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

  const isActive = (path: string) => location.pathname === path;

  const isStoreManager = role === 'store_manager';
  const isCallCenter = role === 'call_center';
  const isStaffOrAdmin = role === 'employee' || role === 'staff' || role === 'admin' || role === 'manager';
  const isAdminOrManager = role === 'admin' || role === 'manager';

  /** Only close the drawer on mobile; desktop keeps the rail open. */
  const handleMobileNav = () => {
    if (window.innerWidth < 768) onClose?.();
  };

  const NavItem: React.FC<{
    to: string;
    icon: string;
    label: string;
    badge?: number;
    badgeVariant?: 'amber' | 'rose';
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
            <span className={`sidebar-badge ${badgeVariant === 'rose' ? 'bg-rose-500' : 'bg-amber-500'}`}>
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
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar-root ${isOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        <div className="sidebar-header-toggle">
          <button
            onClick={onClose}
            className="sidebar-hamburger-btn"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <Icon name="menu" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {isStoreManager ? (
            <>
              <SectionLabel>Store Operations</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/new-order" icon="add_shopping_cart" label="New Sales Order" />
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Sales Order" />
                <NavItem to="/dashboard/stock-request" icon="assignment" label="Stock Request" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
              </ul>

              <Divider />
              <SectionLabel>Reporting</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/store-report" icon="summarize" label="Reporting Channel" />
                <NavItem
                  to="/dashboard/notifications"
                  icon="notifications"
                  label="Notifications"
                  badge={notifCount}
                  badgeVariant="rose"
                />
              </ul>
            </>
          ) : isCallCenter ? (
            <>
              <SectionLabel>Call Center</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/new-order" icon="add_shopping_cart" label="New Sales Order" />
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Sales Order" />
                <NavItem to="/dashboard/stock-request" icon="assignment" label="Stock Request" />
              </ul>

              <Divider />
              <SectionLabel>Fulfillment</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
              </ul>

              <Divider />
              <SectionLabel>Reporting</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/call-center" icon="summarize" label="Reporting Channel" />
              </ul>
            </>
          ) : (
            <>
          <SectionLabel>Overview</SectionLabel>
          <ul className="sidebar-nav-group">
            <NavItem to="/dashboard" icon="space_dashboard" label="Analytics Dashboard" />
            {isAdminOrManager && (
              <NavItem to="/dashboard/analytics" icon="monitoring" label="P&L Financial Report" />
            )}
            {isAdminOrManager && (
              <NavAction
                icon="team_dashboard"
                label="Team Performance"
                onClick={() => {
                  openTeamPerformance();
                  handleMobileNav();
                }}
              />
            )}
            <NavItem to="/dashboard/new-order" icon="add_shopping_cart" label="New Sales Order" />
          </ul>

          {isStaffOrAdmin && (
            <>
              <Divider />
              <SectionLabel>Partners &amp; Supply</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Orders" />
                {isAdminOrManager && (
                  <NavItem to="/dashboard/vendor" icon="local_shipping" label="Vendor Purchase" />
                )}
              </ul>
            </>
          )}

          {(isStaffOrAdmin || role === 'driver' || role === 'delivery') && (
            <>
              <Divider />
              <SectionLabel>Catalog &amp; Fulfillment</SectionLabel>
              <ul className="sidebar-nav-group">
                {isStaffOrAdmin && (
                  <>
                    <NavItem to="/dashboard/products" icon="package_2" label="Products & Inventory" />
                    <NavItem to="/dashboard/stock-alert" icon="warning" label="Stock Alerts" />
                  </>
                )}
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeVariant="amber"
                />
              </ul>
            </>
          )}

          {isAdminOrManager && (
            <>
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
                {role === 'admin' && (
                  <NavItem to="/dashboard/expenses" icon="receipt_long" label="Expenses" />
                )}
                <NavItem to="/dashboard/change-password" icon="shield_lock" label="Security Settings" />
              </ul>
            </>
          )}

          {role === 'admin' && (
            <>
              <Divider />
              <SectionLabel>Administration</SectionLabel>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/users" icon="manage_accounts" label="Staff & Roles" />
                <NavItem to="/dashboard/affiliates" icon="handshake" label="Affiliate Control" />
                <NavItem to="/dashboard/videos" icon="smart_display" label="Community Videos" />
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
