import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import type { RootState } from './store';
import { setResolvedTheme } from './store/slices/uiSlice';
import Storefront           from './pages/Storefront';
import Checkout             from './pages/Checkout';
import Dashboard            from './pages/Dashboard';
import OrderTracking        from './pages/OrderTracking';
import Login                from './pages/Login';
import CommunityVideos      from './pages/CommunityVideos';
import ProductsPage         from './pages/ProductsPage';
import BulkOrdersPage       from './pages/BulkOrdersPage';
import VendorPurchasePage   from './pages/VendorPurchasePage';
import StockAlertPage       from './pages/StockAlertPage';
import AnalyticsPage        from './pages/AnalyticsPage';
import NotificationsPage    from './pages/Notificationspage';
import ChangePasswordPage   from './pages/ChangePasswordPage';
import UserManagementPage   from './pages/UserManagementPage';
import AffiliateControlPage from './pages/AffiliateControlPage';
import NewOrderPage         from './pages/NewOrderPage';
import CustomerOrderTracking from './pages/CustomerOrderTracking';
import AccessDatabasePage   from './pages/AccessDatabasePage';
import ExpensesPage         from './pages/ExpensesPage';
import ProtectedRoute       from './components/ui/ProtectedRoute';
import { ToastProvider }    from './components/ui/ToastProvider';
import { LanguageProvider } from './LanguageContext';

function App() {
  const dispatch = useDispatch();
  const resolvedTheme = useSelector((state: RootState) => state.ui.resolvedTheme);
  const theme = useSelector((state: RootState) => state.ui.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      dispatch(setResolvedTheme(e.matches ? 'dark' : 'light'));
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, dispatch]);

  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[var(--cream)]">
        <LanguageProvider>
          <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/"                 element={<Storefront />} />
            <Route path="/checkout"         element={<Checkout />} />
            <Route path="/community-videos" element={<CommunityVideos />} />
            <Route path="/login"            element={<Login />} />
            <Route path="/track"            element={<CustomerOrderTracking />} />
            <Route path="/track/:orderId"   element={<CustomerOrderTracking />} />

            {/* Dashboard */}
            <Route path="/dashboard"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/new-order"    element={<ProtectedRoute><NewOrderPage /></ProtectedRoute>} />
            <Route path="/dashboard/tracking"     element={<ProtectedRoute><OrderTracking /></ProtectedRoute>} />
            <Route path="/dashboard/bulk-orders"  element={<ProtectedRoute><BulkOrdersPage /></ProtectedRoute>} />
            <Route path="/dashboard/vendor"       element={<ProtectedRoute><VendorPurchasePage /></ProtectedRoute>} />
            <Route path="/dashboard/stock-alert"  element={<ProtectedRoute><StockAlertPage /></ProtectedRoute>} />
            <Route path="/dashboard/expenses"     element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
            <Route path="/dashboard/analytics"    element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/dashboard/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/dashboard/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="/dashboard/users"        element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
            <Route path="/dashboard/affiliates"   element={<ProtectedRoute><AffiliateControlPage /></ProtectedRoute>} />

            {/* Combined Products page — replaces /dashboard/catalog and /dashboard/inventory */}
            <Route path="/dashboard/products"     element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
            <Route path="/dashboard/access-db"   element={<ProtectedRoute><AccessDatabasePage /></ProtectedRoute>} />
          </Routes>
        </ToastProvider>
        </LanguageProvider>
      </main>
    </BrowserRouter>
  );
}

export default App;
