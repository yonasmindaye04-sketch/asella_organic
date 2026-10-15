import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'staff';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();

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

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
