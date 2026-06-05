/**
 * Sidebar.tsx — updated for combined Products page
 * Replaces "Inventory" + "Product Catalog" with a single "Products" entry
 */
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../store';
import { logout } from '../store/slices/authSlice';
import { api } from '../services/api';

const Sidebar: React.FC = () => {
  const dispatch  = useDispatch();
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useSelector((state: RootState) => state.auth);

  const [pendingCount, setPendingCount] = useState(0);
  const [notifCount,   setNotifCount]   = useState(0);

  const role        = user?.role ?? 'guest';
  const displayName = user?.name ?? 'Staff';
  const displayRole =
    role === 'admin'    ? 'Super Admin' :
    role === 'manager'  ? 'Manager'     :
    role === 'employee' ? 'Employee'    : role;

  useEffect(() => {
    const fetch = async () => {
      const res = await api.get<{ id: string }[]>('/api/orders?status=Pending&limit=200');
      if (res.success && res.data) setPendingCount(res.data.length);
    };
    void fetch();
    const t = setInterval(() => void fetch(), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (role !== 'admin' && role !== 'manager') return;
    const fetch = async () => {
      const res = await api.get<{ total: number }>('/api/notifications/summary');
      if (res.success && res.data) setNotifCount(res.data.total);
    };
    void fetch();
    const t = setInterval(() => void fetch(), 60_000);
    return () => clearInterval(t);
  }, [role]);

  const isActive = (path: string) => location.pathname === path;

  const link = (path: string) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg transition font-medium text-sm ${
      isActive(path)
        ? 'bg-[#E2F0D9] text-[#002C17] shadow-sm'
        : 'text-[#E2F0D9] hover:bg-[#E2F0D9]/10'
    }`;

  const icon = (path: string) =>
    `material-symbols-outlined w-6 text-center text-[20px] ${
      isActive(path) ? 'text-[#002C17]' : 'text-[#E2F0D9]'
    }`;

  const isStaffOrAbove   = ['employee', 'staff', 'admin', 'manager'].includes(role);
  const isManagerOrAbove = ['admin', 'manager'].includes(role);

  return (
    <aside className="w-72 bg-[#001803] flex-col justify-between z-20 flex-shrink-0 border-r border-[#E2F0D9]/20 max-md:hidden md:flex">
      <div className="flex-1 flex flex-col min-h-0">

        {/* Profile */}
        <div className="p-4 border-b border-[#E2F0D9]/20 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-11 h-11 rounded-full bg-[#355E3B] flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="font-bold text-white truncate">{displayName}</p>
              <p className="text-xs text-[#A0F399] truncate">{displayRole}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-6 overflow-y-auto flex-1">

          {/* Quick */}
          <ul className="space-y-1">
            <li>
              <Link to="/dashboard/new-order" className={link('/dashboard/new-order')}>
                <span className={icon('/dashboard/new-order')}>shopping_cart</span>
                New Sales Order
              </Link>
            </li>
          </ul>

          {/* Partners */}
          {isStaffOrAbove && (
            <div>
              <h3 className="text-[10px] font-bold text-[#A0F399] uppercase tracking-widest mb-2 px-4">Partners</h3>
              <ul className="space-y-1">
                <li>
                  <Link to="/dashboard/bulk-orders" className={link('/dashboard/bulk-orders')}>
                    <span className={icon('/dashboard/bulk-orders')}>inventory_2</span>
                    Bulk Orders
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard/vendor" className={link('/dashboard/vendor')}>
                    <span className={icon('/dashboard/vendor')}>local_shipping</span>
                    Vendor Purchase
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {/* Internal */}
          {isStaffOrAbove && (
            <div>
              <h3 className="text-[10px] font-bold text-[#A0F399] uppercase tracking-widest mb-2 px-4">Internal</h3>
              <ul className="space-y-1">
                <li>
                  <Link to="/dashboard/stock-alert" className={link('/dashboard/stock-alert')}>
                    <span className={icon('/dashboard/stock-alert')}>warning</span>
                    Stock Alert
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard/tracking" className={link('/dashboard/tracking')}>
                    <span className={icon('/dashboard/tracking')}>route</span>
                    Order Tracking
                    {pendingCount > 0 && (
                      <span className="ml-auto bg-amber-500 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full animate-pulse">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {/* Management — Inventory + Catalog merged into Products */}
          {isManagerOrAbove && (
            <div>
              <h3 className="text-[10px] font-bold text-[#A0F399] uppercase tracking-widest mb-2 px-4">Management</h3>
              <ul className="space-y-1">
                <li>
                  <Link to="/dashboard/products" className={link('/dashboard/products')}>
                    <span className={icon('/dashboard/products')}>category</span>
                    Products
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard/notifications" className={link('/dashboard/notifications')}>
                    <span className={icon('/dashboard/notifications')}>notifications</span>
                    Notifications
                    {notifCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                        {notifCount > 99 ? '99+' : notifCount}
                      </span>
                    )}
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard/change-password" className={link('/dashboard/change-password')}>
                    <span className={icon('/dashboard/change-password')}>key</span>
                    Change Password
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {/* Admin */}
          {role === 'admin' && (
            <div>
              <h3 className="text-[10px] font-bold text-[#A0F399] uppercase tracking-widest mb-2 px-4">Admin</h3>
              <ul className="space-y-1">
                <li>
                  <Link to="/dashboard/users" className={link('/dashboard/users')}>
                    <span className={icon('/dashboard/users')}>groups</span>
                    User Management
                  </Link>
                </li>
              </ul>
            </div>
          )}
        </nav>
      </div>

      {/* Logout */}
      <div className="p-4 shrink-0 border-t border-[#E2F0D9]/10">
        <button
          onClick={() => { dispatch(logout()); navigate('/login'); }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm w-full text-red-400 hover:bg-red-400/10 transition"
        >
          <span className="material-symbols-outlined w-6 text-center text-[20px] text-red-400">logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;