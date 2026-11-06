import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'manager' | 'store_manager' | 'staff';
}

/**
 * The only surfaces a Sub Store Front Manager may reach. Both the sidebar
 * and the router enforce this list; the backend independently rejects every
 * other endpoint, so this is defence-in-depth rather than the real boundary.
 */
const STORE_MANAGER_ALLOWED_PATHS = [
  '/dashboard/pos',
  '/dashboard/my-performance',
  '/dashboard/tracking',
  '/dashboard/notifications',
  '/dashboard/bulk-orders',
  '/dashboard/store-report',
  '/dashboard/stock-request',
  '/dashboard/messages',
];

/** Call center agents have access to POS, Tracking, Notifications, and Reporting Channel. */
const CALL_CENTER_ALLOWED_PATHS = [
  '/dashboard/pos',
  '/dashboard/my-performance',
  '/dashboard/tracking',
  '/dashboard/notifications',
  '/dashboard/call-center',
  '/dashboard/products',
  '/dashboard/stock-alert',
  '/dashboard/stock-request',
  '/dashboard/messages',
];

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();

  // When an API refresh fails, services/api.ts clears the stored session and
  // announces it. Only a mounted guard should react -- redirecting from the
  // fetch wrapper would yank public visitors (storefront, checkout, order
  // tracking) to /login on any 401.
  useEffect(() => {
    const onExpired = () => navigate('/login', { replace: true });
    window.addEventListener('asella:session-expired', onExpired);
    return () => window.removeEventListener('asella:session-expired', onExpired);
  }, [navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Affiliates hold a real session in staff_users, so isAuthenticated is true
  // for them too. Without this branch an affiliate rendering /dashboard saw
  // the entire admin shell -- sidebar, page names and layout -- with every
  // panel erroring on 403. The API rejects them regardless; this stops the
  // UI from advertising a surface they cannot use.
  if (user?.role === 'affiliate') {
    return <Navigate to="/affiliate" replace />;
  }

  if (user?.role === 'call_center') {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (!CALL_CENTER_ALLOWED_PATHS.includes(path)) {
      return <Navigate to="/dashboard/pos" replace />;
    }
  }

  // Sub Store Front Managers are restricted to operational screens.
  if (user?.role === 'store_manager') {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (!STORE_MANAGER_ALLOWED_PATHS.includes(path)) {
      return <Navigate to="/dashboard/pos" replace />;
    }
  }

  // Delivery drivers only have access to Order Tracking and My Performance
  if (user?.role === 'delivery' || user?.role === 'driver') {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const DRIVER_ALLOWED_PATHS = [
      '/dashboard/tracking',
      '/dashboard/my-performance',
      '/dashboard/notifications',
      '/dashboard/messages',
    ];
    if (!DRIVER_ALLOWED_PATHS.includes(path)) {
      return <Navigate to="/dashboard/tracking" replace />;
    }
  }

  // Employees/staff have access to POS, Tracking, and Stock Alerts (no financial reports)
  if (user?.role === 'employee' || user?.role === 'staff') {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const EMPLOYEE_ALLOWED_PATHS = [
      '/dashboard/pos',
      '/dashboard/my-performance',
      '/dashboard/tracking',
      '/dashboard/stock-alert',
      '/dashboard/stock-request',
  '/dashboard/messages',
    ];
    if (!EMPLOYEE_ALLOWED_PATHS.includes(path)) {
      return <Navigate to="/dashboard/pos" replace />;
    }
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin' && user?.role !== 'tech_support') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
