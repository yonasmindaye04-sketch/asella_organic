/**
 * src/pages/CallCenterDashboard.tsx
 * Asella Organic — Call Center Agent Dashboard
 *
 * Shows personal KPIs (calls logged, orders placed, delivered, cancelled)
 * and a log-call button. Accessible only to call_center role.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';
import { TimeRangeSelector, getRangeDates } from '../components/dashboard/TimeRangeSelector';
import type { TimeRange } from '../components/dashboard/TimeRangeSelector';

interface CallCenterStats {
  total_orders: number;
  delivered:    number;
  cancelled:    number;
  pending:      number;
  call_count:   number;
}

interface CCOrder {
  id:             string;
  customer_name:  string;
  phone:          string;
  city:           string;
  source:         string;
  status:         string;
  payment_status: string;
  total:          number;
  created_at:     string;
}

const STATUS_COLORS: Record<string, string> = {
  Delivered:  'text-green-700 dark:text-green-400',
  Cancelled:  'text-red-700 dark:text-red-400',
  CANCELLED:  'text-red-700 dark:text-red-400',
  Pending:    'text-amber-700 dark:text-amber-400',
  Confirmed:  'text-blue-700 dark:text-blue-400',
  Processing: 'text-purple-700 dark:text-purple-400',
  'In Transit': 'text-cyan-700 dark:text-cyan-400',
};

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color = 'text-green-600' }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
    <div className={`text-3xl ${color}`}>
      <span className="material-symbols-outlined text-[36px]">{icon}</span>
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  </div>
);

const CallCenterDashboard: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [stats, setStats] = useState<CallCenterStats | null>(null);
  const [orders, setOrders] = useState<CCOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [activeRange, setActiveRange] = useState<TimeRange>('month');
  const [dateRange, setDateRange] = useState(() => getRangeDates('month'));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `?from=${dateRange.from}&to=${dateRange.to}`;
      const [statsRes, ordersRes] = await Promise.all([
        api.get<CallCenterStats>(`/api/callcenter/me/stats${qs}`),
        api.get<CCOrder[]>(`/api/callcenter/me/orders${qs}&limit=20`),
      ]);
      if (statsRes.success && statsRes.data)  setStats(statsRes.data);
      if (ordersRes.success && ordersRes.data) setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleLogCall = async () => {
    setLogging(true);
    try {
      const res = await api.post<{ message: string }>('/api/callcenter/log-call', {});
      if (res.success) {
        setLogSuccess(true);
        setTimeout(() => setLogSuccess(false), 2000);
        void fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLogging(false);
    }
  };

  const handleRangeChange = (range: TimeRange, from: string, to: string) => {
    setActiveRange(range);
    setDateRange({ from, to });
  };

  const displayName = user?.full_name ?? user?.name ?? user?.username ?? 'Agent';

  return (
    <DashboardLayout>
      <main className="p-6 space-y-5 max-w-[1440px] mx-auto">

        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-2 gap-4">
          <div>
            <h1 className="text-2xl font-semibold">My Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Welcome back, {displayName}</p>
          </div>
          <TimeRangeSelector
            activeRange={activeRange}
            from={dateRange.from}
            to={dateRange.to}
            onRangeChange={handleRangeChange}
          />
        </div>

        {/* Log Call Panel */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-3xl font-bold text-green-700">
              {loading ? '—' : (stats?.call_count ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-green-600 mt-0.5">Calls logged this period</p>
          </div>
          <button
            onClick={handleLogCall}
            disabled={logging}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition ${
              logSuccess
                ? 'bg-emerald-500'
                : logging
                ? 'bg-green-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined">
              {logSuccess ? 'check_circle' : 'add_call'}
            </span>
            {logSuccess ? 'Call Logged!' : logging ? 'Logging…' : 'Log Incoming Call'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Orders Placed"
            value={loading ? 0 : (stats?.total_orders ?? 0)}
            icon="shopping_cart"
            color="text-blue-600"
          />
          <StatCard
            label="Delivered"
            value={loading ? 0 : (stats?.delivered ?? 0)}
            icon="check_circle"
            color="text-green-600"
          />
          <StatCard
            label="Declined / Cancelled"
            value={loading ? 0 : (stats?.cancelled ?? 0)}
            icon="cancel"
            color="text-red-500"
          />
          <StatCard
            label="In Progress"
            value={loading ? 0 : (stats?.pending ?? 0)}
            icon="hourglass_top"
            color="text-amber-500"
          />
        </div>

        {/* Delivery rate banner */}
        {!loading && stats && stats.total_orders > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
            <span className="material-symbols-outlined text-green-600 text-[28px]">insights</span>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-semibold text-gray-700">Delivery Rate: </span>
                <span className="text-green-600 font-bold">
                  {((stats.delivered / stats.total_orders) * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Cancellation Rate: </span>
                <span className="text-red-500 font-bold">
                  {((stats.cancelled / stats.total_orders) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">My Recent Orders</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No orders in this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Order ID</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-right">Total (ETB)</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{order.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{order.customer_name}</td>
                      <td className="px-4 py-3 text-gray-600">{order.city}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{order.source}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {Number(order.total).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex text-xs font-bold ${STATUS_COLORS[order.status] ?? 'text-gray-600 dark:text-gray-400'}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>
    </DashboardLayout>
  );
};

export default CallCenterDashboard;
