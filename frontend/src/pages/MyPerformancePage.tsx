import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

type TimeRangeKey = 'today' | 'week' | 'month';

interface TrendItem {
  date: string;
  assigned?: number;
  delivered?: number;
  total?: number;
  pickups?: number;
  orders_booked?: number;
  transactions?: number;
  completed?: number;
}

interface PerformanceResponse {
  role: string;
  range: { from: string; to: string };
  user: {
    id: string;
    name: string;
    username: string;
    location?: string;
    role: string;
  };
  kpis: Record<string, any>;
}

export default function MyPerformancePage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerformanceResponse | null>(null);

  // Compute date strings based on selected range
  const getDateRange = (range: TimeRangeKey) => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const fromDate = new Date();
    if (range === 'today') {
      // today
    } else if (range === 'week') {
      fromDate.setDate(now.getDate() - 6);
    } else {
      fromDate.setDate(now.getDate() - 29);
    }
    const from = fromDate.toISOString().slice(0, 10);
    return { from, to };
  };

  const fetchPerformance = useCallback(async (rangeKey: TimeRangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getDateRange(rangeKey);
      const res = await api.get<PerformanceResponse>(`/api/performance/me?from=${from}&to=${to}`);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to load performance metrics.');
      }
    } catch {
      setError('An error occurred while fetching your operational performance.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPerformance(timeRange);
  }, [timeRange, fetchPerformance]);

  const rawRole = (user?.role || data?.role || 'staff').toLowerCase();
  const isDriver = rawRole === 'delivery' || rawRole === 'driver';
  const isStoreManager = rawRole === 'store_manager';
  const isCallCenter = rawRole === 'call_center';
  const isManagerOrAdmin = rawRole === 'manager' || rawRole === 'admin';
  const isEmployee = !isDriver && !isStoreManager && !isCallCenter && !isManagerOrAdmin;

  const roleLabel = isDriver
    ? 'Delivery Fleet Associate'
    : isStoreManager
    ? 'Substore Operations Manager'
    : isCallCenter
    ? 'Customer Care & Sales Agent'
    : isManagerOrAdmin
    ? 'Operations & Quality Lead'
    : 'Store & Counter Specialist';

  const roleBadgeColor = isDriver
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : isStoreManager
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : isCallCenter
    ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
    : isManagerOrAdmin
    ? 'bg-purple-100 text-purple-800 border-purple-300'
    : 'bg-blue-100 text-blue-800 border-blue-300';

  const kpis = data?.kpis || {};
  const trend: TrendItem[] = kpis.trend || [];

  // Calculate highest volume in trend for SVG bar scaling
  const maxTrendVal = Math.max(
    ...trend.map(
      (t) =>
        t.total ??
        t.assigned ??
        t.orders_booked ??
        t.transactions ??
        t.delivered ??
        t.completed ??
        0
    ),
    5
  );

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 sm:p-6 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#1b4d24]/5 to-transparent rounded-bl-full pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="material-symbols-outlined text-2xl text-[#1b4d24]">
                  monitoring
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                  My Operational Performance
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${roleBadgeColor}`}
                >
                  {roleLabel}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Real-time personal throughput, completion rates, and service efficiency metrics.
              </p>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center gap-1.5 p-1 bg-[#f1f8f1] rounded-xl border border-[#d4ecd4] self-start md:self-auto">
              {(
                [
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'Last 7 Days' },
                  { key: 'month', label: 'Last 30 Days' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setTimeRange(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    timeRange === tab.key
                      ? 'bg-[#1b4d24] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Sub-Banner: Member & Location */}
          <div className="mt-4 pt-4 border-t border-[#edf5ed] flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-semibold text-gray-800">
                <span className="material-symbols-outlined text-sm text-[#1b4d24]">badge</span>
                {user?.name || user?.full_name || user?.username || 'Staff Member'}
              </span>
              {(data?.user?.location || (user as any)?.location) && (
                <span className="flex items-center gap-1 text-gray-600">
                  <span className="material-symbols-outlined text-sm text-[#1b4d24]">store</span>
                  {data?.user?.location || (user as any)?.location}
                </span>
              )}
            </div>
            {data?.range && (
              <span className="font-mono text-[11px] text-gray-400">
                Window: {data.range.from} → {data.range.to}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500">error</span>
            <span>{error}</span>
            <button
              onClick={() => void fetchPerformance(timeRange)}
              className="ml-auto underline font-bold hover:text-red-900"
            >
              Retry
            </button>
          </div>
        )}

        {/* KPI Grid (Role Specialized, Strictly Non-Financial) */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-[#d4ecd4] p-5 h-32 animate-pulse flex flex-col justify-between"
              >
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-8 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* 1. DRIVER DASHBOARD VIEW */}
            {isDriver && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Delivered Packages
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">task_alt</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 font-mono">
                      {kpis.delivered ?? 0}
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      / {kpis.total_assigned ?? 0} trips
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          kpis.total_assigned
                            ? (kpis.delivered / kpis.total_assigned) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Fulfillment Rate
                    </span>
                    <span className="material-symbols-outlined text-blue-600">verified</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.completion_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Trips successfully handed over to customers
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      First-Attempt Success
                    </span>
                    <span className="material-symbols-outlined text-amber-600">schedule</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.first_attempt_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Delivered on initial arrival without return
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Active In-Transit
                    </span>
                    <span className="material-symbols-outlined text-indigo-600">local_shipping</span>
                  </div>
                  <div className="text-2xl font-black text-indigo-700 font-mono">
                    {kpis.in_transit ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Packages currently out for delivery
                  </p>
                </div>
              </div>
            )}

            {/* 2. SUBSTORE MANAGER DASHBOARD VIEW */}
            {isStoreManager && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Counter Pickups Handed Over
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">shopping_bag</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 font-mono">
                      {kpis.pickups_delivered ?? 0}
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      / {kpis.total_pickups ?? 0} pickups
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          kpis.total_pickups
                            ? (kpis.pickups_delivered / kpis.total_pickups) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Pending In-Store Pickups
                    </span>
                    <span className="material-symbols-outlined text-amber-600">hourglass_top</span>
                  </div>
                  <div className="text-2xl font-black text-amber-700 font-mono">
                    {kpis.pickups_pending ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Orders ready at counter awaiting customer visit
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Walk-in Assisted
                    </span>
                    <span className="material-symbols-outlined text-blue-600">storefront</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.walkin_orders ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Walk-in counter transactions created
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Branch Low-Stock Warnings
                    </span>
                    <span className="material-symbols-outlined text-rose-600">warning</span>
                  </div>
                  <div className="text-2xl font-black text-rose-600 font-mono">
                    {kpis.low_stock_count ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    SKUs needing replenishment requests
                  </p>
                </div>
              </div>
            )}

            {/* 3. CALL CENTER AGENT VIEW */}
            {isCallCenter && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Orders Booked
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">add_task</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.orders_booked ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Customer orders entered into the system
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Delivery vs Pickup Mix
                    </span>
                    <span className="material-symbols-outlined text-blue-600">pie_chart</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-emerald-700 font-mono">
                      {kpis.delivery_orders ?? 0} Deliv.
                    </span>
                    <span className="text-xs font-mono text-gray-400">/</span>
                    <span className="text-lg font-bold text-amber-700 font-mono">
                      {kpis.pickup_orders ?? 0} Pickup
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Fulfillment choice distribution</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Delivered Success Rate
                    </span>
                    <span className="material-symbols-outlined text-indigo-600">trending_up</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.success_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Booked orders successfully completed
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Today's Shift Report
                    </span>
                    <span className="material-symbols-outlined text-purple-600">assignment</span>
                  </div>
                  <div className="mt-1">
                    {kpis.today_report_submitted ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Submitted
                      </span>
                    ) : (
                      <Link
                        to="/dashboard/call-center"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold hover:bg-amber-200 transition"
                      >
                        <span className="material-symbols-outlined text-sm">pending_actions</span>
                        Pending Notes — File Now
                      </Link>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.reports_submitted ?? 0} total reports filed in period
                  </p>
                </div>
              </div>
            )}

            {/* 4. COUNTER STAFF / EMPLOYEE VIEW */}
            {isEmployee && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Transactions Processed
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">point_of_sale</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.transactions ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">POS orders processed through counter</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Successfully Completed
                    </span>
                    <span className="material-symbols-outlined text-blue-600">task_alt</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.delivered ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Orders marked as delivered</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Customer Profile Capture
                    </span>
                    <span className="material-symbols-outlined text-purple-600">person_add</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.capture_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.captured_customers ?? 0} profiles recorded for loyalty
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Pickup Orders Assisted
                    </span>
                    <span className="material-symbols-outlined text-amber-600">store</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.pickup_orders ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Store collections assisted</p>
                </div>
              </div>
            )}

            {/* 5. MANAGER / ADMIN OPERATIONAL OVERVIEW */}
            {isManagerOrAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Total Pipeline Volume
                    </span>
                    <span className="material-symbols-outlined text-blue-600">sync_alt</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.total_orders ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Orders flowing through operations
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Fulfillment Rate
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">verified</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.fulfillment_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.delivered ?? 0} completed orders
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Delayed Bottlenecks
                    </span>
                    <span className="material-symbols-outlined text-amber-600">timer</span>
                  </div>
                  <div className="text-2xl font-black text-amber-600 font-mono">
                    {(kpis.stuck_pending ?? 0) + (kpis.stuck_transit ?? 0)}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.stuck_pending ?? 0} pending &gt;2h, {kpis.stuck_transit ?? 0} in-transit &gt;24h
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Critical Stock Warnings
                    </span>
                    <span className="material-symbols-outlined text-rose-600">inventory_2</span>
                  </div>
                  <div className="text-2xl font-black text-rose-600 font-mono">
                    {kpis.low_stock_count ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Catalog items nearing zero inventory</p>
                </div>
              </div>
            )}

            {/* Daily Operational Throughput Chart */}
            <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Daily Operational Activity
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Activity volume over the selected period.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1b4d24]" /> Completed / Delivered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-200" /> Handled / Assigned
                  </span>
                </div>
              </div>

              {trend.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No activity logged yet for this period.
                </div>
              ) : (
                <div className="flex items-end gap-2 sm:gap-4 h-48 pt-6 pb-2 border-b border-gray-100 overflow-x-auto custom-scrollbar">
                  {trend.map((day, idx) => {
                    const topVal =
                      day.total ??
                      day.assigned ??
                      day.orders_booked ??
                      day.transactions ??
                      day.delivered ??
                      0;
                    const compVal = day.delivered ?? day.completed ?? 0;
                    const topHeight = Math.max(8, (topVal / maxTrendVal) * 140);
                    const compHeight = Math.max(4, (compVal / maxTrendVal) * 140);

                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center gap-2 min-w-[36px] group relative"
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-mono py-1 px-2 rounded pointer-events-none whitespace-nowrap z-20 shadow-lg">
                          Completed: {compVal} | Total: {topVal}
                        </div>

                        <div className="w-full max-w-[28px] h-36 flex items-end justify-center relative">
                          {/* Background bar: total/assigned */}
                          <div
                            className="w-full bg-emerald-100 rounded-t-md transition-all absolute bottom-0"
                            style={{ height: `${topHeight}px` }}
                          />
                          {/* Foreground bar: completed */}
                          <div
                            className="w-full bg-[#1b4d24] rounded-t-md transition-all relative z-10"
                            style={{ height: `${compHeight}px` }}
                          />
                        </div>

                        <span className="text-[10px] font-mono text-gray-400 truncate max-w-[40px]">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Row: Operational Excellence Badges & Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Operational Quality Badges */}
              <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-amber-600 text-xl">
                    workspace_premium
                  </span>
                  <h4 className="text-sm font-bold text-gray-900">
                    Operational Highlights &amp; Badges
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#f8faf8] rounded-xl border border-[#d4ecd4]/60">
                    <span className="text-[10px] font-mono uppercase font-bold text-gray-500 block mb-0.5">
                      Fulfillment Purity
                    </span>
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-emerald-600">verified</span>
                      High Completion
                    </span>
                  </div>
                  <div className="p-3 bg-[#f8faf8] rounded-xl border border-[#d4ecd4]/60">
                    <span className="text-[10px] font-mono uppercase font-bold text-gray-500 block mb-0.5">
                      Data Integrity
                    </span>
                    <span className="text-xs font-bold text-blue-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-blue-600">fingerprint</span>
                      Accurate Tracking
                    </span>
                  </div>
                  <div className="p-3 bg-[#f8faf8] rounded-xl border border-[#d4ecd4]/60">
                    <span className="text-[10px] font-mono uppercase font-bold text-gray-500 block mb-0.5">
                      Service Speed
                    </span>
                    <span className="text-xs font-bold text-purple-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-purple-600">bolt</span>
                      Prompt Turnaround
                    </span>
                  </div>
                  <div className="p-3 bg-[#f8faf8] rounded-xl border border-[#d4ecd4]/60">
                    <span className="text-[10px] font-mono uppercase font-bold text-gray-500 block mb-0.5">
                      Shift Reliability
                    </span>
                    <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-amber-600">military_tech</span>
                      Active Contributor
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Operational Shortcuts */}
              <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[#1b4d24] text-xl">
                      speed
                    </span>
                    <h4 className="text-sm font-bold text-gray-900">Operational Actions</h4>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Jump directly to your active workflows to process tasks and boost your completion rate.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    to="/dashboard/tracking"
                    className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-[#1b4d24] text-white text-xs font-bold hover:bg-[#143e1c] transition text-center shadow-xs"
                  >
                    <span className="material-symbols-outlined text-sm">route</span>
                    Order Tracking
                  </Link>
                  {isCallCenter ? (
                    <Link
                      to="/dashboard/call-center"
                      className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-[#1b4d24] text-[#1b4d24] text-xs font-bold hover:bg-[#eef6ee] transition text-center"
                    >
                      <span className="material-symbols-outlined text-sm">summarize</span>
                      Daily Shift Report
                    </Link>
                  ) : (
                    <Link
                      to="/dashboard/pos"
                      className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-[#1b4d24] text-[#1b4d24] text-xs font-bold hover:bg-[#eef6ee] transition text-center"
                    >
                      <span className="material-symbols-outlined text-sm">point_of_sale</span>
                      POS Terminal
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
