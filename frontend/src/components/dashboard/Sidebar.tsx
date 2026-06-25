/**
 * Sidebar.tsx — YouTube-style dark sidebar
 *
 * Features:
 * - Collapsible: icon-only rail (72px) ↔ expanded (260px) on desktop
 * - Mobile: overlay drawer with backdrop
 * - Always dark background regardless of app theme
 * - Rounded pill active states
 * - Decorative traffic light dots
 * - Bottom user profile section
 * - Preserves all role-based nav, badges, and logout
 */
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { api, auth as authApi } from '../../services/api';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

/* ─── Icon helper (Material Symbols) ─── */
const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined sidebar-icon ${className}`}>{name}</span>
);

const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const dispatch   = useDispatch();
  const location   = useLocation();
  const navigate   = useNavigate();
  const { user }   = useSelector((state: RootState) => state.auth);

  const [pendingCount, setPendingCount]     = useState(0);
  const [notifCount,   setNotifCount]       = useState(0);

  const role        = user?.role || 'guest';
  const displayName = user?.name || user?.full_name || user?.username || 'Staff';
  const displayRole = role.charAt(0).toUpperCase() + role.slice(1);

  // Fetch pending order count
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

  // Fetch notification summary for admin/manager
  useEffect(() => {
    if (role !== 'admin' && role !== 'manager') return;
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

  const isStaffOrAdmin   = role === 'employee' || role === 'staff' || role === 'admin' || role === 'manager';
  const isAdminOrManager = role === 'admin' || role === 'manager';

  /* ─── Nav item renderer ─── */
  const NavItem: React.FC<{
    to: string;
    icon: string;
    label: string;
    badge?: number;
    badgeColor?: string;
    pulse?: boolean;
  }> = ({ to, icon, label, badge, badgeColor = 'bg-amber-500', pulse = false }) => {
    const active = isActive(to);
    return (
      <li>
        <Link
          to={to}
          onClick={() => onClose?.()}
          className={`sidebar-nav-item ${active ? 'active' : ''}`}
          title={!isOpen ? label : undefined}
        >
          <Icon name={icon} />
          <span className="sidebar-nav-label">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`sidebar-badge ${badgeColor} ${pulse ? 'animate-pulse' : ''}`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside
        className={`sidebar-root ${isOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}
      >
        {/* ── Hamburger Toggle (Desktop & Mobile Close) ── */}
        <div className="sidebar-header-toggle">
          <button
            onClick={onClose}
            className="sidebar-hamburger-btn"
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" />
          </button>
        </div>

        {/* ── Navigation ── */}
        <nav className="sidebar-nav">
          {/* Quick links */}
          <ul className="sidebar-nav-group">
            <NavItem to="/dashboard" icon="dashboard" label="Dashboard" />
            <NavItem to="/dashboard/new-order" icon="shopping_cart" label="New Sales Order" />
          </ul>

          {/* Partners */}
          {isStaffOrAdmin && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Partners</div>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Orders" />
                <NavItem to="/dashboard/vendor" icon="local_shipping" label="Vendor Purchase" />
              </ul>
            </>
          )}

          {/* Internal */}
          {isStaffOrAdmin && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Internal</div>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/products" icon="category" label="Products & Inventory" />
                <NavItem to="/dashboard/stock-alert" icon="warning" label="Stock Alert" />
                <NavItem
                  to="/dashboard/tracking"
                  icon="route"
                  label="Order Tracking"
                  badge={pendingCount}
                  badgeColor="bg-amber-500"
                  pulse
                />
              </ul>
            </>
          )}

          {/* Management */}
          {isAdminOrManager && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Management</div>
              <ul className="sidebar-nav-group">
                <NavItem
                  to="/dashboard/notifications"
                  icon="notifications"
                  label="Notifications"
                  badge={notifCount}
                  badgeColor="bg-red-500"
                />
                <NavItem to="/dashboard/expenses" icon="payments" label="Expenses" />
                <NavItem to="/dashboard/change-password" icon="security" label="Security Settings" />
              </ul>
            </>
          )}

          {/* Admin only */}
          {role === 'admin' && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Admin</div>
              <ul className="sidebar-nav-group">
                <NavItem to="/dashboard/users" icon="groups" label="User Management" />
                <NavItem to="/dashboard/affiliates" icon="handshake" label="Affiliate Control" />
                <NavItem to="/dashboard/access-db" icon="database" label="Access Database" />
              </ul>
            </>
          )}
        </nav>

        {/* ── Bottom section ── */}
        <div className="sidebar-bottom">
          {/* Settings row */}
          <div className="sidebar-divider" />
          <div className="sidebar-settings-row">
            <Link
              to="/dashboard/change-password"
              onClick={() => onClose?.()}
              className="sidebar-settings-btn"
              title={!isOpen ? 'Settings' : undefined}
            >
              <Icon name="settings" />
            </Link>
          </div>

          {/* User profile */}
          <div className="sidebar-user-row">
            <div className="sidebar-user-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
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
