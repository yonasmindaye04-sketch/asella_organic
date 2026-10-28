import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute       from './components/ui/ProtectedRoute';
import { ToastProvider }    from './components/ui/ToastProvider';
import { LanguageProvider } from './LanguageContext';
import { TelegramProvider } from './context/TelegramContext';
import { SiteAssetsProvider } from './context/SiteAssetsContext';
import LoadingSpinner       from './components/ui/LoadingSpinner';
import TopProgressBar       from './components/ui/TopProgressBar';
import './telegram/miniApp.css';

import Dashboard            from './pages/Dashboard';
import Login                from './pages/Login';
import AnalyticsPage        from './pages/AnalyticsPage';
import NotificationsPage    from './pages/Notificationspage';
import AffiliateRoute       from './components/ui/AffiliateRoute';

const Storefront            = lazy(() => import('./pages/Storefront'));
const Checkout              = lazy(() => import('./pages/Checkout'));
const TelegramStore         = lazy(() => import('./pages/TelegramStore'));
const OrderTracking         = lazy(() => import('./pages/OrderTracking'));
const CommunityVideos       = lazy(() => import('./pages/CommunityVideos'));
const ProductsPage          = lazy(() => import('./pages/ProductsPage'));
const BulkOrdersPage        = lazy(() => import('./pages/BulkOrdersPage'));
const VendorPurchasePage    = lazy(() => import('./pages/VendorPurchasePage'));
const StockAlertPage        = lazy(() => import('./pages/StockAlertPage'));
const ChangePasswordPage    = lazy(() => import('./pages/ChangePasswordPage'));
const UserManagementPage    = lazy(() => import('./pages/UserManagementPage'));
const AffiliateControlPage  = lazy(() => import('./pages/AffiliateControlPage'));
const AffiliateDashboard    = lazy(() => import('./pages/AffiliateDashboard'));
const NewOrderPage          = lazy(() => import('./pages/NewOrderPage'));
const CustomerOrderTracking = lazy(() => import('./pages/CustomerOrderTracking'));
const ExpensesPage          = lazy(() => import('./pages/ExpensesPage'));
const VideoManagementPage   = lazy(() => import('./pages/VideoManagementPage'));
const MediaLibraryPage      = lazy(() => import('./pages/MediaLibraryPage'));
const AuditLogPage          = lazy(() => import('./pages/AuditLogPage'));
const CustomersPage         = lazy(() => import('./pages/CustomersPage'));
const PrivacyPolicy         = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService        = lazy(() => import('./pages/TermsOfService'));
const SmsDashboard          = lazy(() => import('./pages/SmsDashboard'));


function App() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
  }, []);

  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[var(--cream)]">
        <LanguageProvider>
          <TelegramProvider>
            <SiteAssetsProvider>
            <ToastProvider>
              <TopProgressBar />
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  {/* Public */}
                  <Route path="/"                 element={<Storefront />} />
                  <Route path="/checkout"         element={<Checkout />} />
                  {/* Fallback only. The canonical Mini App is the standalone
                      tma.html document; Apache (.htaccess) and Vite both
                      rewrite /tma and /telegram-store to it. These routes
                      exist for hosts without those rewrites. */}
                  <Route path="/telegram-store"   element={<TelegramStore />} />
                  <Route path="/tma"              element={<TelegramStore />} />
                  <Route path="/community-videos" element={<CommunityVideos />} />
                  <Route path="/login"            element={<Login />} />

                  {/* Affiliate portal — own layout, role 'affiliate' only */}
                  <Route path="/affiliate"        element={<AffiliateRoute><AffiliateDashboard /></AffiliateRoute>} />
                  <Route path="/privacy"          element={<PrivacyPolicy />} />
                  <Route path="/terms"            element={<TermsOfService />} />
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
                <Route path="/dashboard/customers"    element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
                <Route path="/dashboard/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
                <Route path="/dashboard/users"        element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
                <Route path="/dashboard/affiliates"   element={<ProtectedRoute><AffiliateControlPage /></ProtectedRoute>} />
                <Route path="/dashboard/videos"        element={<ProtectedRoute><VideoManagementPage /></ProtectedRoute>} />
                <Route path="/dashboard/media"         element={<ProtectedRoute><MediaLibraryPage /></ProtectedRoute>} />

                {/* Combined Products page — replaces /dashboard/catalog and /dashboard/inventory */}
                <Route path="/dashboard/products"     element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
                <Route path="/dashboard/audit-log"    element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
                <Route path="/dashboard/sms"          element={<ProtectedRoute><SmsDashboard /></ProtectedRoute>} />
              </Routes>
            </Suspense>
</ToastProvider>
            </SiteAssetsProvider>
          </TelegramProvider>
        </LanguageProvider>
      </main>
    </BrowserRouter>
  );
}

export default App;
