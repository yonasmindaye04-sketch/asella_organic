/**
 * Sidebar.tsx — bundui/shadcn-ui-kit inspired collapsible workspace sidebar
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

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => (
  <span className={`material-symbols-outlined text-[19px] leading-none shrink-0 ${className}`}>{name}</span>
);

const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const dispatch   = useDispatch();
  const location   = useLocation();
  const navigate   = useNavigate();
  const { user }   = useSelector((state: RootState) => state.auth);

  const [pendingCount, setPendingCount] = useState(0);
  const [notifCount,   setNotifCount]   = useState(0);

  const role        = (user?.role || 'guest').toLowerCase();
  const displayName = user?.name || user?.full_name || user?.username || 'Staff';
  const displayRole = role === 'delivery' ? 'Driver' : role.charAt(0).toUpperCase() + role.slice(1);

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

  const handleMobileNav = () => {
    if (window.innerWidth < 768) {
      onClose?.();
    }
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
          title={!isOpen ? label : undefined}
          className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap ${
            !isOpen ? 'justify-center px-2' : ''
          } ${
            active
              ? 'bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/20'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 border border-transparent'
          }`}
        >
          <Icon
            name={icon}
            className={active ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-zinc-200'}
          />
          {isOpen && <span className="truncate flex-1">{label}</span>}
          {isOpen && badge !== undefined && badge > 0 && (
            <span
              className={`ml-auto text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                badgeVariant === 'rose'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    isOpen ? (
      <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold text-zinc-500 tracking-tight">
        {children}
      </div>
    ) : (
      <div className="my-2 mx-2 h-px bg-zinc-800/80" />
    );

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:relative top-0 left-0 bottom-0 z-50 flex flex-col bg-[#09090b] text-zinc-100 border-r border-zinc-800/80 transition-all duration-200 shrink-0 ${
          isOpen
            ? 'w-[256px] translate-x-0'
            : 'w-[256px] -translate-x-full md:w-[68px] md:translate-x-0'
        }`}
      >
        {/* Workspace Brand Header */}
        <div className={`h-14 flex items-center border-b border-zinc-800/80 px-3.5 shrink-0 ${!isOpen ? 'justify-center' : 'justify-between'}`}>
          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0">
              A
            </div>
            {isOpen && (
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-zinc-100 leading-tight truncate">
                  Asella Organic
                </p>
                <p className="text-[11px] text-zinc-400 leading-tight truncate">
                  Enterprise Console
                </p>
              </div>
            )}
          </Link>
          {isOpen && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              aria-label="Collapse sidebar"
            >
              <Icon name="left_panel_close" className="text-[18px]" />
            </button>
          )}
        </div>

        {!isOpen && (
          <div className="hidden md:flex justify-center pt-2">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <Icon name="left_panel_open" className="text-[18px]" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 space-y-0.5">
          <SectionLabel>Overview</SectionLabel>
          <ul className="space-y-0.5">
            <NavItem to="/dashboard" icon="space_dashboard" label="Analytics Dashboard" />
            {isAdminOrManager && (
              <NavItem to="/dashboard/analytics" icon="monitoring" label="P&L Financial Report" />
            )}
            <NavItem to="/dashboard/new-order" icon="add_shopping_cart" label="New Sales Order" />
          </ul>

          {isStaffOrAdmin && (
            <>
              <SectionLabel>Partners & Supply</SectionLabel>
              <ul className="space-y-0.5">
                <NavItem to="/dashboard/bulk-orders" icon="inventory_2" label="Bulk Orders" />
                <NavItem to="/dashboard/vendor" icon="local_shipping" label="Vendor Purchase" />
              </ul>
            </>
          )}

          {(isStaffOrAdmin || role === 'driver' || role === 'delivery') && (
            <>
              <SectionLabel>Catalog & Fulfillment</SectionLabel>
              <ul className="space-y-0.5">
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
              <SectionLabel>CRM & Operations</SectionLabel>
              <ul className="space-y-0.5">
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
              <SectionLabel>Administration</SectionLabel>
              <ul className="space-y-0.5">
                <NavItem to="/dashboard/users" icon="manage_accounts" label="Staff & Roles" />
                <NavItem to="/dashboard/affiliates" icon="handshake" label="Affiliate Control" />
                <NavItem to="/dashboard/videos" icon="smart_display" label="Community Videos" />
              </ul>
            </>
          )}
        </nav>

        {/* Bottom User Profile */}
        <div className="p-2.5 border-t border-zinc-800/80 shrink-0">
          <div className={`flex items-center gap-2.5 p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 ${!isOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-md bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-semibold text-xs shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            {isOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-100 truncate">{displayName}</p>
                <p className="text-[11px] text-zinc-400 truncate">{displayRole}</p>
              </div>
            )}
            {isOpen && (
              <button
                onClick={async () => {
                  await authApi.logout();
                  dispatch(logout());
                  navigate('/login');
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                title="Sign out"
              >
                <Icon name="logout" className="text-[17px]" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
