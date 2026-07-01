import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute       from './components/ui/ProtectedRoute';
import { ToastProvider }    from './components/ui/ToastProvider';
import { LanguageProvider } from './LanguageContext';
import LoadingSpinner       from './components/ui/LoadingSpinner';

const Storefront           = lazy(() => import('./pages/Storefront'));
const Checkout             = lazy(() => import('./pages/Checkout'));
const Dashboard            = lazy(() => import('./pages/Dashboard'));
const OrderTracking        = lazy(() => import('./pages/OrderTracking'));
const Login                = lazy(() => import('./pages/Login'));
const CommunityVideos      = lazy(() => import('./pages/CommunityVideos'));
const ProductsPage         = lazy(() => import('./pages/ProductsPage'));
const BulkOrdersPage       = lazy(() => import('./pages/BulkOrdersPage'));
const VendorPurchasePage   = lazy(() => import('./pages/VendorPurchasePage'));
const StockAlertPage       = lazy(() => import('./pages/StockAlertPage'));
const AnalyticsPage        = lazy(() => import('./pages/AnalyticsPage'));
const NotificationsPage    = lazy(() => import('./pages/Notificationspage'));
const ChangePasswordPage   = lazy(() => import('./pages/ChangePasswordPage'));
const UserManagementPage   = lazy(() => import('./pages/UserManagementPage'));
const AffiliateControlPage = lazy(() => import('./pages/AffiliateControlPage'));
const NewOrderPage         = lazy(() => import('./pages/NewOrderPage'));
const CustomerOrderTracking = lazy(() => import('./pages/CustomerOrderTracking'));
const ExpensesPage         = lazy(() => import('./pages/ExpensesPage'));
const VideoManagementPage  = lazy(() => import('./pages/VideoManagementPage'));

function App() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
  }, []);

  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[var(--cream)]">
        <LanguageProvider>
          <ToastProvider>
            <Suspense fallback={<LoadingSpinner />}>
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
                <Route path="/dashboard/videos"        element={<ProtectedRoute><VideoManagementPage /></ProtectedRoute>} />

                {/* Combined Products page — replaces /dashboard/catalog and /dashboard/inventory */}
                <Route path="/dashboard/products"     element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </LanguageProvider>
      </main>
    </BrowserRouter>
  );
}

export default App;
