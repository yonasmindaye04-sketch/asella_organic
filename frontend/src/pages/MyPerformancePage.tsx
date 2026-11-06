import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

type TimeRangeKey = 'today' | 'week' | 'month' | 'quarter' | 'all';

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

interface LifetimeStats {
  total_orders: number;
  delivered: number;
  regional_orders: number;
  completion_rate: number;
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
  lifetime?: LifetimeStats;
  kpis: Record<string, any>;
}

export default function MyPerformancePage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerformanceResponse | null>(null);

  // Compute date query parameter based on selected range
  const getDateQuery = (range: TimeRangeKey): string => {
    if (range === 'all') return 'range=all';
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const fromDate = new Date();
    if (range === 'today') {
      // from date equals today
    } else if (range === 'week') {
      fromDate.setDate(now.getDate() - 6);
    } else if (range === 'month') {
      fromDate.setDate(now.getDate() - 29);
    } else if (range === 'quarter') {
      fromDate.setDate(now.getDate() - 89);
    }
    const from = fromDate.toISOString().slice(0, 10);
    return `from=${from}&to=${to}`;
  };

  const fetchPerformance = useCallback(async (rangeKey: TimeRangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const query = getDateQuery(rangeKey);
      const res = await api.get<PerformanceResponse>(`/api/performance/me?${query}`);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to load operational performance metrics.');
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
  const lifetime = data?.lifetime;

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
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 overflow-x-hidden">
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
                Real-time personal throughput, service quality, and operational efficiency metrics.
              </p>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center gap-1 p-1 bg-[#f1f8f1] rounded-xl border border-[#d4ecd4] self-start md:self-auto flex-wrap">
              {(
                [
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'Last 7 Days' },
                  { key: 'month', label: 'Last 30 Days' },
                  { key: 'quarter', label: 'Last 90 Days' },
                  { key: 'all', label: 'All Time' },
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

          {/* Member Details & Career Lifetime Ribbons */}
          <div className="mt-4 pt-4 border-t border-[#edf5ed] flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 font-semibold text-gray-800">
                <span className="material-symbols-outlined text-sm text-[#1b4d24]">person</span>
                {user?.name || user?.full_name || user?.username || 'Staff Member'}
              </span>
              {(data?.user?.location || (user as any)?.location) && (
                <span className="flex items-center gap-1 text-gray-600">
                  <span className="material-symbols-outlined text-sm text-[#1b4d24]">store</span>
                  {data?.user?.location || (user as any)?.location}
                </span>
              )}
              {lifetime && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#eaf4ea] text-[#1b4d24] font-medium text-[11px]">
                  <span className="material-symbols-outlined text-xs">verified</span>
                  Career: {lifetime.delivered} delivered ({lifetime.completion_rate}%)
                </span>
              )}
            </div>
            {data?.range && (
              <span className="font-mono text-[11px] text-gray-400">
                Window: {data.range.from} {data.range.to ? `→ ${data.range.to}` : ''}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">error</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => void fetchPerformance(timeRange)}
              className="underline font-bold hover:text-red-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Operational Indicators Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
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
            {/* 1. CALL CENTER OPERATIONAL INDICATORS */}
            {isCallCenter && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Orders Booked
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">add_task</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 font-mono">
                      {kpis.orders_booked ?? 0}
                    </span>
                    <span className="text-xs font-mono text-emerald-700">
                      ({kpis.delivered ?? 0} delivered)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Customer orders successfully created</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Customer Calls Handled
                    </span>
                    <span className="material-symbols-outlined text-blue-600">call</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 font-mono">
                      {kpis.total_calls_received ?? 0}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      ({kpis.total_calls_ordered ?? 0} converted)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Conversion Rate: <span className="font-bold text-gray-800">{kpis.call_conversion_rate ?? 0}%</span>
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Fulfillment Success Rate
                    </span>
                    <span className="material-symbols-outlined text-indigo-600">verified</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.success_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.cancelled ?? 0} cancelled ({kpis.cancellation_rate ?? 0}%)
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Delivery vs Pickup Mix
                    </span>
                    <span className="material-symbols-outlined text-teal-600">pie_chart</span>
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
                  <p className="text-[11px] text-gray-500 mt-2">
                    Addis: <span className="font-semibold">{kpis.addis_orders ?? 0}</span> · Regional: <span className="font-semibold">{kpis.regional_orders ?? 0}</span>
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Throughput Per Shift
                    </span>
                    <span className="material-symbols-outlined text-purple-600">speed</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.avg_orders_per_shift ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Average orders booked per active shift
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Shift Reporting Status
                    </span>
                    <span className="material-symbols-outlined text-amber-600">assignment</span>
                  </div>
                  <div className="mt-1">
                    {kpis.today_report_submitted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Today Filed
                      </span>
                    ) : (
                      <Link
                        to="/dashboard/call-center"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold hover:bg-amber-200 transition"
                      >
                        <span className="material-symbols-outlined text-sm">pending_actions</span>
                        File Shift Report
                      </Link>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.ontime_reports ?? 0} on-time · {kpis.backdated_reports ?? 0} backdated
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Pipeline Open Orders
                    </span>
                    <span className="material-symbols-outlined text-orange-600">hourglass_top</span>
                  </div>
                  <div className="text-2xl font-black text-orange-700 font-mono">
                    {kpis.pending ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Active orders awaiting fulfillment</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Call Rejection Rate
                    </span>
                    <span className="material-symbols-outlined text-rose-600">phone_missed</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.call_rejection_rate ?? 0}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.total_calls_rejected ?? 0} inquiries rejected/dropped
                  </p>
                </div>
              </div>
            )}

            {/* 2. DRIVER OPERATIONAL INDICATORS */}
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
                          kpis.total_assigned ? (kpis.delivered / kpis.total_assigned) * 100 : 0
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
                      On-Time Delivery Rate
                    </span>
                    <span className="material-symbols-outlined text-teal-600">alarm_on</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.on_time_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.on_time ?? 0} packages delivered on target date
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

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Delivery Issues / Returns
                    </span>
                    <span className="material-symbols-outlined text-rose-600">report_problem</span>
                  </div>
                  <div className="text-2xl font-black text-rose-600 font-mono">
                    {kpis.issues ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Failed drop-offs or customer address issues
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Trip Cancellation Rate
                    </span>
                    <span className="material-symbols-outlined text-gray-500">cancel</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.cancellation_rate ?? 0}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.cancelled ?? 0} cancelled delivery trips
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Career Deliveries
                    </span>
                    <span className="material-symbols-outlined text-purple-600">local_shipping</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {lifetime?.delivered ?? kpis.delivered ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Total lifetime parcels delivered
                  </p>
                </div>
              </div>
            )}

            {/* 3. SUBSTORE MANAGER OPERATIONAL INDICATORS */}
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
                          kpis.total_pickups ? (kpis.pickups_delivered / kpis.total_pickups) * 100 : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Pickup Success Rate
                    </span>
                    <span className="material-symbols-outlined text-blue-600">verified</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.pickup_success_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Customer collections fulfilled without issue
                  </p>
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
                    Orders ready at counter awaiting collection
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Walk-in Assisted
                    </span>
                    <span className="material-symbols-outlined text-indigo-600">storefront</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.walkin_orders ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Walk-in counter transactions served
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Branch Low-Stock Warnings
                    </span>
                    <span className="material-symbols-outlined text-rose-600">warning</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-rose-600 font-mono">
                      {kpis.low_stock_count ?? 0}
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      ({kpis.out_of_stock_count ?? 0} out of stock)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    SKUs nearing or at zero inventory
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Restock Requests Filed
                    </span>
                    <span className="material-symbols-outlined text-teal-600">sync_alt</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 font-mono">
                      {kpis.stock_requests_total ?? 0}
                    </span>
                    <span className="text-xs font-mono text-amber-600">
                      ({kpis.stock_requests_pending ?? 0} pending)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Replenishment orders raised for branch
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Total Orders Handled
                    </span>
                    <span className="material-symbols-outlined text-purple-600">hub</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.total_handled ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Branch volume across pickup & counter orders
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Order Issue & Return Rate
                    </span>
                    <span className="material-symbols-outlined text-gray-600">rule</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.cancellation_rate ?? 0}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.cancelled ?? 0} cancelled · {kpis.issues ?? 0} issues
                  </p>
                </div>
              </div>
            )}

            {/* 4. COUNTER STAFF / EMPLOYEE OPERATIONAL INDICATORS */}
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
                  <p className="text-[11px] text-gray-500 mt-2">Orders processed through store counter</p>
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
                  <p className="text-[11px] text-gray-500 mt-2">Orders delivered and handed over</p>
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
                    {kpis.captured_customers ?? 0} customer contacts recorded
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Total Units Handled
                    </span>
                    <span className="material-symbols-outlined text-teal-600">inventory_2</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.items_handled ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Avg {kpis.avg_items_per_order ?? 0} units per order
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
                  <p className="text-[11px] text-gray-500 mt-2">In-store collections handled</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Dispatched Deliveries
                    </span>
                    <span className="material-symbols-outlined text-indigo-600">local_shipping</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.delivery_orders ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Delivery packages initiated</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Pending Action
                    </span>
                    <span className="material-symbols-outlined text-orange-600">hourglass_top</span>
                  </div>
                  <div className="text-2xl font-black text-orange-700 font-mono">
                    {kpis.pending ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Orders awaiting completion</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Cancellation Rate
                    </span>
                    <span className="material-symbols-outlined text-rose-600">cancel</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.cancellation_rate ?? 0}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.cancelled ?? 0} cancelled counter orders
                  </p>
                </div>
              </div>
            )}

            {/* 5. MANAGER / ADMIN OPERATIONAL INDICATORS */}
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
                    All orders flowing through the platform
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Global Fulfillment Rate
                    </span>
                    <span className="material-symbols-outlined text-emerald-600">verified</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.fulfillment_rate ?? 100}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.delivered ?? 0} successfully delivered orders
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
                    {kpis.stuck_pending ?? 0} pending &gt;2h · {kpis.stuck_transit ?? 0} in-transit &gt;24h
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Catalog Stock Risk
                    </span>
                    <span className="material-symbols-outlined text-rose-600">inventory_2</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-rose-600 font-mono">
                      {kpis.low_stock_count ?? 0}
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      ({kpis.out_of_stock_count ?? 0} zero inventory)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Products at or below low stock threshold</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Active Operational Team
                    </span>
                    <span className="material-symbols-outlined text-purple-600">groups</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.active_staff_count ?? 0}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">Staff members with logged orders</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Channel Breakdown
                    </span>
                    <span className="material-symbols-outlined text-teal-600">alt_route</span>
                  </div>
                  <div className="text-xs font-mono font-bold text-gray-800 space-y-0.5">
                    <div>Web: {kpis.channel_web ?? 0} · TMA: {kpis.channel_telegram ?? 0}</div>
                    <div>Call Center: {kpis.channel_call_center ?? 0} · POS: {kpis.channel_pos ?? 0}</div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Multi-channel order origin</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Fulfillment Mode Split
                    </span>
                    <span className="material-symbols-outlined text-indigo-600">local_shipping</span>
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
                  <p className="text-[11px] text-gray-500 mt-2">Delivery vs store collection</p>
                </div>

                <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-2xs">
                  <div className="flex items-center justify-between text-gray-500 mb-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      System Cancellation Rate
                    </span>
                    <span className="material-symbols-outlined text-rose-600">cancel</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900 font-mono">
                    {kpis.cancellation_rate ?? 0}%
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {kpis.cancelled ?? 0} total cancelled orders
                  </p>
                </div>
              </div>
            )}

            {/* Daily Operational Activity Chart */}
            <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Daily Operational Throughput
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Activity volume across the selected time period.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1b4d24]" /> Completed / Delivered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-200" /> Total Handled
                  </span>
                </div>
              </div>

              {trend.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No activity recorded for this date window.
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
                        <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-mono py-1 px-2 rounded pointer-events-none whitespace-nowrap z-20 shadow-lg">
                          Completed: {compVal} | Total: {topVal}
                        </div>

                        <div className="w-full max-w-[28px] h-36 flex items-end justify-center relative">
                          <div
                            className="w-full bg-emerald-100 rounded-t-md transition-all absolute bottom-0"
                            style={{ height: `${topHeight}px` }}
                          />
                          <div
                            className="w-full bg-[#1b4d24] rounded-t-md transition-all relative z-10"
                            style={{ height: `${compHeight}px` }}
                          />
                        </div>

                        <span className="text-[10px] font-mono text-gray-400 truncate max-w-[44px]">
                          {day.date.length > 5 ? day.date.slice(5) : day.date}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Operational Shortcuts */}
            <div className="bg-white rounded-2xl border border-[#d4ecd4] p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1b4d24] text-xl">
                    speed
                  </span>
                  <h4 className="text-sm font-bold text-gray-900">Operational Actions &amp; Navigation</h4>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Access live workflows directly to fulfill customer tasks and process orders.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <Link
                  to="/dashboard/tracking"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1b4d24] text-white text-xs font-bold hover:bg-[#143e1c] transition text-center shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">route</span>
                  Order Tracking
                </Link>
                {isCallCenter && (
                  <Link
                    to="/dashboard/call-center"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1b4d24] text-[#1b4d24] text-xs font-bold hover:bg-[#eef6ee] transition text-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">summarize</span>
                    Daily Shift Report
                  </Link>
                )}
                {isStoreManager && (
                  <Link
                    to="/dashboard/products"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1b4d24] text-[#1b4d24] text-xs font-bold hover:bg-[#eef6ee] transition text-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">inventory_2</span>
                    Stock &amp; Inventory
                  </Link>
                )}
                {!isCallCenter && !isStoreManager && (
                  <Link
                    to="/dashboard/pos"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1b4d24] text-[#1b4d24] text-xs font-bold hover:bg-[#eef6ee] transition text-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">point_of_sale</span>
                    POS Terminal
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
