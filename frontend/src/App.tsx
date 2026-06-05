import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Storefront           from './pages/Storefront';
import Dashboard            from './pages/Dashboard';
import OrderTracking        from './pages/OrderTracking';
import Login                from './pages/Login';
import CommunityVideos      from './pages/CommunityVideos';
import ProductsPage         from './pages/ProductsPage';       // ← combined Products + Stock
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
import ProtectedRoute       from './components/ui/ProtectedRoute';
import { ToastProvider }    from './components/ui/ToastProvider';
import { LanguageProvider } from './LanguageContext';

// Removed: InventoryPage, ProductCatalogPage, PackagingLogPage
// All replaced by the combined ProductsPage at /dashboard/products

function App() {
  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[var(--cream)]">
        <LanguageProvider>
          <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/"                 element={<Storefront />} />
            <Route path="/community-videos" element={<CommunityVideos />} />
            <Route path="/login"            element={<Login />} />
            <Route path="/track"            element={<CustomerOrderTracking />} />

            {/* Dashboard */}
            <Route path="/dashboard"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/new-order"    element={<ProtectedRoute><NewOrderPage /></ProtectedRoute>} />
            <Route path="/dashboard/tracking"     element={<ProtectedRoute><OrderTracking /></ProtectedRoute>} />
            <Route path="/dashboard/bulk-orders"  element={<ProtectedRoute><BulkOrdersPage /></ProtectedRoute>} />
            <Route path="/dashboard/vendor"       element={<ProtectedRoute><VendorPurchasePage /></ProtectedRoute>} />
            <Route path="/dashboard/stock-alert"  element={<ProtectedRoute><StockAlertPage /></ProtectedRoute>} />
            <Route path="/dashboard/analytics"    element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/dashboard/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="/dashboard/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="/dashboard/users"        element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
            <Route path="/dashboard/affiliates"   element={<ProtectedRoute><AffiliateControlPage /></ProtectedRoute>} />

            {/* Combined Products page — replaces /dashboard/catalog and /dashboard/inventory */}
            <Route path="/dashboard/products"     element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
          </Routes>
        </ToastProvider>
        </LanguageProvider>
      </main>
    </BrowserRouter>
  );
}

export default App;
