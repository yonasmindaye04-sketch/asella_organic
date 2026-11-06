import React, { useState, useEffect, useCallback } from 'react';
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

interface KpiCardProps {
  label: string;
  icon: string;
  iconColor?: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  hint?: React.ReactNode;
  progress?: number;
  progressColor?: string;
  action?: {
    to: string;
    label: string;
    icon: string;
  };
}

function KpiCard({
  label,
  icon,
  iconColor = 'text-zinc-600 dark:text-zinc-400',
  value,
  subtitle,
  hint,
  progress,
  progressColor = 'bg-emerald-600 dark:bg-emerald-500',
  action,
}: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 p-4 sm:p-5 shadow-xs transition hover:border-zinc-300 dark:hover:border-zinc-700 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 truncate">
            {label}
          </span>
          <span className={`material-symbols-outlined text-xl sm:text-2xl shrink-0 ${iconColor}`}>
            {icon}
          </span>
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="text-2xl sm:text-3xl font-black font-mono text-zinc-900 dark:text-zinc-50 tracking-tight">
            {value}
          </div>
          {subtitle && (
            <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </div>
          )}
        </div>

        {progress !== undefined && (
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}

        {action && (
          <div className="mt-2.5">
            <Link
              to={action.to}
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <span className="material-symbols-outlined text-sm">{action.icon}</span>
              {action.label}
            </Link>
          </div>
        )}
      </div>

      {hint && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2.5 leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'AO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

  // Rule.md Section 2: Bold colored typography only (no background, no border)
  const roleTextColor = isDriver
    ? 'text-emerald-700 dark:text-emerald-400'
    : isStoreManager
    ? 'text-amber-700 dark:text-amber-400'
    : isCallCenter
    ? 'text-cyan-700 dark:text-cyan-400'
    : isManagerOrAdmin
    ? 'text-purple-700 dark:text-purple-400'
    : 'text-blue-700 dark:text-blue-400';

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
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 p-5 sm:p-6 shadow-xs relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            <div className="flex items-start gap-4">
              {/* Staff Initials Avatar */}
              <div className="w-12 h-12 rounded-xl bg-[#1b4d24] dark:bg-emerald-800 flex items-center justify-center text-amber-300 font-black text-lg shrink-0 shadow-xs">
                {getInitials(user?.name || user?.full_name || user?.username || 'Staff')}
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
                    {user?.name || user?.full_name || user?.username || 'Staff Member'}
                  </h1>
                  <span className="text-zinc-400 dark:text-zinc-600">/</span>
                  <span className={`text-xs font-black uppercase tracking-wider ${roleTextColor}`}>
                    {roleLabel}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-300">
                    <span className="material-symbols-outlined text-[15px] text-emerald-700 dark:text-emerald-400">badge</span>
                    @{user?.username || 'staff'}
                  </span>
                  {(data?.user?.location || (user as any)?.location) && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-zinc-400 dark:text-zinc-500">location_on</span>
                      {data?.user?.location || (user as any)?.location}
                    </span>
                  )}
                  {lifetime && (
                    <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                      <span className="material-symbols-outlined text-[15px]">verified</span>
                      Career: {lifetime.delivered.toLocaleString()} delivered ({lifetime.completion_rate}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Time Range Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 self-start lg:self-center">
              <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/80 dark:border-zinc-700 flex-wrap">
                {(
                  [
                    { key: 'today',   label: 'Today' },
                    { key: 'week',    label: '7D' },
                    { key: 'month',   label: '30D' },
                    { key: 'quarter', label: '90D' },
                    { key: 'all',     label: 'All Time' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTimeRange(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      timeRange === tab.key
                        ? 'bg-[#1b4d24] dark:bg-emerald-700 text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/80 dark:hover:bg-zinc-700/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {data?.range && (
                <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 px-1 whitespace-nowrap">
                  {data.range.from} {data.range.to ? `→ ${data.range.to}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 text-xs text-red-800 dark:text-red-400 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">error</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => void fetchPerformance(timeRange)}
              className="underline font-bold hover:text-red-900 dark:hover:text-red-300 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Operational Indicators Grid */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 p-4 sm:p-5 h-32 animate-pulse flex flex-col justify-between"
              >
                <div className="flex justify-between">
                  <div className="h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3" />
                  <div className="h-6 w-6 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </div>
                <div className="h-7 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
                <div className="h-3 bg-zinc-100 dark:bg-zinc-800/60 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* 1. CALL CENTER OPERATIONAL INDICATORS */}
            {isCallCenter && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Orders Booked"
                  icon="add_task"
                  iconColor="text-emerald-700 dark:text-emerald-400"
                  value={kpis.orders_booked ?? 0}
                  subtitle={`(${kpis.delivered ?? 0} delivered)`}
                  hint="Customer orders successfully created"
                />

                <KpiCard
                  label="Customer Calls Handled"
                  icon="call"
                  iconColor="text-blue-700 dark:text-blue-400"
                  value={kpis.total_calls_received ?? 0}
                  subtitle={`(${kpis.total_calls_ordered ?? 0} conv.)`}
                  hint={`Conversion Rate: ${kpis.call_conversion_rate ?? 0}%`}
                />

                <KpiCard
                  label="Fulfillment Success Rate"
                  icon="verified"
                  iconColor="text-indigo-700 dark:text-indigo-400"
                  value={`${kpis.success_rate ?? 100}%`}
                  progress={kpis.success_rate ?? 100}
                  hint={`${kpis.cancelled ?? 0} cancelled (${kpis.cancellation_rate ?? 0}%)`}
                />

                <KpiCard
                  label="Delivery vs Pickup Mix"
                  icon="pie_chart"
                  iconColor="text-teal-700 dark:text-teal-400"
                  value={`${kpis.delivery_orders ?? 0} / ${kpis.pickup_orders ?? 0}`}
                  subtitle="Deliv. / Pickup"
                  hint={`Addis: ${kpis.addis_orders ?? 0} · Regional: ${kpis.regional_orders ?? 0}`}
                />

                <KpiCard
                  label="Throughput Per Shift"
                  icon="speed"
                  iconColor="text-purple-700 dark:text-purple-400"
                  value={kpis.avg_orders_per_shift ?? 0}
                  hint="Average orders booked per active shift"
                />

                <KpiCard
                  label="Shift Reporting Status"
                  icon="assignment"
                  iconColor="text-amber-700 dark:text-amber-400"
                  value={kpis.today_report_submitted ? 'Filed' : 'Pending'}
                  hint={`${kpis.ontime_reports ?? 0} on-time · ${kpis.backdated_reports ?? 0} backdated`}
                  action={
                    !kpis.today_report_submitted
                      ? {
                          to: '/dashboard/call-center',
                          label: 'File Shift Report',
                          icon: 'pending_actions',
                        }
                      : undefined
                  }
                />

                <KpiCard
                  label="Pipeline Open Orders"
                  icon="hourglass_top"
                  iconColor="text-orange-700 dark:text-orange-400"
                  value={kpis.pending ?? 0}
                  hint="Active orders awaiting fulfillment"
                />

                <KpiCard
                  label="Call Rejection Rate"
                  icon="phone_missed"
                  iconColor="text-rose-700 dark:text-rose-400"
                  value={`${kpis.call_rejection_rate ?? 0}%`}
                  hint={`${kpis.total_calls_rejected ?? 0} inquiries rejected/dropped`}
                />
              </div>
            )}

            {/* 2. DRIVER OPERATIONAL INDICATORS */}
            {isDriver && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Delivered Packages"
                  icon="task_alt"
                  iconColor="text-emerald-700 dark:text-emerald-400"
                  value={kpis.delivered ?? 0}
                  subtitle={`/ ${kpis.total_assigned ?? 0} trips`}
                  progress={
                    kpis.total_assigned
                      ? (kpis.delivered / kpis.total_assigned) * 100
                      : 0
                  }
                  hint="Packages successfully dropped off"
                />

                <KpiCard
                  label="Fulfillment Rate"
                  icon="verified"
                  iconColor="text-blue-700 dark:text-blue-400"
                  value={`${kpis.completion_rate ?? 100}%`}
                  progress={kpis.completion_rate ?? 100}
                  hint="Trips successfully handed over to customers"
                />

                <KpiCard
                  label="First-Attempt Success"
                  icon="schedule"
                  iconColor="text-amber-700 dark:text-amber-400"
                  value={`${kpis.first_attempt_rate ?? 100}%`}
                  hint="Delivered on initial arrival without return"
                />

                <KpiCard
                  label="On-Time Delivery Rate"
                  icon="alarm_on"
                  iconColor="text-teal-700 dark:text-teal-400"
                  value={`${kpis.on_time_rate ?? 100}%`}
                  hint={`${kpis.on_time ?? 0} packages delivered on target date`}
                />

                <KpiCard
                  label="Active In-Transit"
                  icon="local_shipping"
                  iconColor="text-indigo-700 dark:text-indigo-400"
                  value={kpis.in_transit ?? 0}
                  hint="Packages currently out for delivery"
                />

                <KpiCard
                  label="Delivery Issues / Returns"
                  icon="report_problem"
                  iconColor="text-rose-700 dark:text-rose-400"
                  value={kpis.issues ?? 0}
                  hint="Failed drop-offs or address issues"
                />

                <KpiCard
                  label="Trip Cancellation Rate"
                  icon="cancel"
                  iconColor="text-zinc-600 dark:text-zinc-400"
                  value={`${kpis.cancellation_rate ?? 0}%`}
                  hint={`${kpis.cancelled ?? 0} cancelled delivery trips`}
                />

                <KpiCard
                  label="Career Deliveries"
                  icon="workspace_premium"
                  iconColor="text-purple-700 dark:text-purple-400"
                  value={lifetime?.delivered ?? kpis.delivered ?? 0}
                  hint="Total lifetime parcels delivered"
                />
              </div>
            )}

            {/* 3. SUBSTORE MANAGER OPERATIONAL INDICATORS */}
            {isStoreManager && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Counter Pickups Handed Over"
                  icon="shopping_bag"
                  iconColor="text-emerald-700 dark:text-emerald-400"
                  value={kpis.pickups_delivered ?? 0}
                  subtitle={`/ ${kpis.total_pickups ?? 0} pickups`}
                  progress={
                    kpis.total_pickups
                      ? (kpis.pickups_delivered / kpis.total_pickups) * 100
                      : 0
                  }
                  hint="Customer collections fulfilled without issue"
                />

                <KpiCard
                  label="Pickup Success Rate"
                  icon="verified"
                  iconColor="text-blue-700 dark:text-blue-400"
                  value={`${kpis.pickup_success_rate ?? 100}%`}
                  progress={kpis.pickup_success_rate ?? 100}
                  hint="Customer collections completed"
                />

                <KpiCard
                  label="Pending In-Store Pickups"
                  icon="hourglass_top"
                  iconColor="text-amber-700 dark:text-amber-400"
                  value={kpis.pickups_pending ?? 0}
                  hint="Orders ready at counter awaiting collection"
                />

                <KpiCard
                  label="Walk-in Assisted"
                  icon="storefront"
                  iconColor="text-indigo-700 dark:text-indigo-400"
                  value={kpis.walkin_orders ?? 0}
                  hint="Walk-in counter transactions served"
                />

                <KpiCard
                  label="Branch Low-Stock Warnings"
                  icon="warning"
                  iconColor="text-rose-700 dark:text-rose-400"
                  value={kpis.low_stock_count ?? 0}
                  subtitle={`(${kpis.out_of_stock_count ?? 0} out of stock)`}
                  hint="SKUs nearing or at zero inventory"
                />

                <KpiCard
                  label="Restock Requests Filed"
                  icon="sync_alt"
                  iconColor="text-teal-700 dark:text-teal-400"
                  value={kpis.stock_requests_total ?? 0}
                  subtitle={`(${kpis.stock_requests_pending ?? 0} pending)`}
                  hint="Replenishment orders raised for branch"
                />

                <KpiCard
                  label="Total Orders Handled"
                  icon="hub"
                  iconColor="text-purple-700 dark:text-purple-400"
                  value={kpis.total_handled ?? 0}
                  hint="Branch volume across pickup & counter orders"
                />

                <KpiCard
                  label="Order Issue & Return Rate"
                  icon="rule"
                  iconColor="text-zinc-600 dark:text-zinc-400"
                  value={`${kpis.cancellation_rate ?? 0}%`}
                  hint={`${kpis.cancelled ?? 0} cancelled · ${kpis.issues ?? 0} issues`}
                />
              </div>
            )}

            {/* 4. COUNTER STAFF / EMPLOYEE OPERATIONAL INDICATORS */}
            {isEmployee && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Transactions Processed"
                  icon="point_of_sale"
                  iconColor="text-emerald-700 dark:text-emerald-400"
                  value={kpis.transactions ?? 0}
                  hint="Orders processed through store counter"
                />

                <KpiCard
                  label="Successfully Completed"
                  icon="task_alt"
                  iconColor="text-blue-700 dark:text-blue-400"
                  value={kpis.delivered ?? 0}
                  hint="Orders delivered and handed over"
                />

                <KpiCard
                  label="Customer Profile Capture"
                  icon="person_add"
                  iconColor="text-purple-700 dark:text-purple-400"
                  value={`${kpis.capture_rate ?? 100}%`}
                  progress={kpis.capture_rate ?? 100}
                  hint={`${kpis.captured_customers ?? 0} customer contacts recorded`}
                />

                <KpiCard
                  label="Total Units Handled"
                  icon="inventory_2"
                  iconColor="text-teal-700 dark:text-teal-400"
                  value={kpis.items_handled ?? 0}
                  hint={`Avg ${kpis.avg_items_per_order ?? 0} units per order`}
                />

                <KpiCard
                  label="Pickup Orders Assisted"
                  icon="store"
                  iconColor="text-amber-700 dark:text-amber-400"
                  value={kpis.pickup_orders ?? 0}
                  hint="In-store collections handled"
                />

                <KpiCard
                  label="Dispatched Deliveries"
                  icon="local_shipping"
                  iconColor="text-indigo-700 dark:text-indigo-400"
                  value={kpis.delivery_orders ?? 0}
                  hint="Delivery packages initiated"
                />

                <KpiCard
                  label="Pending Action"
                  icon="hourglass_top"
                  iconColor="text-orange-700 dark:text-orange-400"
                  value={kpis.pending ?? 0}
                  hint="Orders awaiting completion"
                />

                <KpiCard
                  label="Cancellation Rate"
                  icon="cancel"
                  iconColor="text-rose-700 dark:text-rose-400"
                  value={`${kpis.cancellation_rate ?? 0}%`}
                  hint={`${kpis.cancelled ?? 0} cancelled counter orders`}
                />
              </div>
            )}

            {/* 5. MANAGER / ADMIN OPERATIONAL INDICATORS */}
            {isManagerOrAdmin && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                  label="Total Pipeline Volume"
                  icon="sync_alt"
                  iconColor="text-blue-700 dark:text-blue-400"
                  value={kpis.total_orders ?? 0}
                  hint="All orders flowing through the platform"
                />

                <KpiCard
                  label="Global Fulfillment Rate"
                  icon="verified"
                  iconColor="text-emerald-700 dark:text-emerald-400"
                  value={`${kpis.fulfillment_rate ?? 100}%`}
                  progress={kpis.fulfillment_rate ?? 100}
                  hint={`${kpis.delivered ?? 0} successfully delivered orders`}
                />

                <KpiCard
                  label="Delayed Bottlenecks"
                  icon="timer"
                  iconColor="text-amber-700 dark:text-amber-400"
                  value={(kpis.stuck_pending ?? 0) + (kpis.stuck_transit ?? 0)}
                  hint={`${kpis.stuck_pending ?? 0} pending >2h · ${kpis.stuck_transit ?? 0} transit >24h`}
                />

                <KpiCard
                  label="Catalog Stock Risk"
                  icon="inventory_2"
                  iconColor="text-rose-700 dark:text-rose-400"
                  value={kpis.low_stock_count ?? 0}
                  subtitle={`(${kpis.out_of_stock_count ?? 0} zero)`}
                  hint="Products at or below low stock threshold"
                />

                <KpiCard
                  label="Active Operational Team"
                  icon="groups"
                  iconColor="text-purple-700 dark:text-purple-400"
                  value={kpis.active_staff_count ?? 0}
                  hint="Staff members with logged orders"
                />

                <KpiCard
                  label="Channel Breakdown"
                  icon="alt_route"
                  iconColor="text-teal-700 dark:text-teal-400"
                  value={
                    (Number(kpis.channel_web) || 0) +
                    (Number(kpis.channel_telegram) || 0) +
                    (Number(kpis.channel_call_center) || 0) +
                    (Number(kpis.channel_pos) || 0)
                  }
                  subtitle="Multi-channel"
                  hint={`Web: ${kpis.channel_web ?? 0} · TMA: ${kpis.channel_telegram ?? 0} · CC: ${kpis.channel_call_center ?? 0} · POS: ${kpis.channel_pos ?? 0}`}
                />

                <KpiCard
                  label="Fulfillment Mode Split"
                  icon="local_shipping"
                  iconColor="text-indigo-700 dark:text-indigo-400"
                  value={`${kpis.delivery_orders ?? 0} / ${kpis.pickup_orders ?? 0}`}
                  subtitle="Deliv. / Pickup"
                  hint="Delivery vs store collection"
                />

                <KpiCard
                  label="System Cancellation Rate"
                  icon="cancel"
                  iconColor="text-rose-700 dark:text-rose-400"
                  value={`${kpis.cancellation_rate ?? 0}%`}
                  hint={`${kpis.cancelled ?? 0} total cancelled orders`}
                />
              </div>
            )}

            {/* Daily Operational Activity Chart */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Daily Operational Throughput
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Activity volume across the selected time period.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">task_alt</span>
                    Completed / Delivered
                  </span>
                  <span className="font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">bar_chart</span>
                    Total Handled
                  </span>
                </div>
              </div>

              {trend.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 dark:text-zinc-500 text-xs">
                  No activity recorded for this date window.
                </div>
              ) : (
                <div className="flex items-end gap-2 sm:gap-4 h-48 pt-6 pb-2 border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto custom-scrollbar">
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
                        <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 dark:bg-zinc-800 text-white text-[10px] font-mono py-1 px-2.5 rounded-lg pointer-events-none whitespace-nowrap z-20 shadow-md border border-zinc-700">
                          Completed: {compVal} | Total: {topVal}
                        </div>

                        <div className="w-full max-w-[28px] h-36 flex items-end justify-center relative">
                          <div
                            className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-t-md transition-all absolute bottom-0"
                            style={{ height: `${topHeight}px` }}
                          />
                          <div
                            className="w-full bg-[#1b4d24] dark:bg-emerald-600 rounded-t-md transition-all relative z-10"
                            style={{ height: `${compHeight}px` }}
                          />
                        </div>

                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-[44px]">
                          {day.date.length > 5 ? day.date.slice(5) : day.date}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Operational Shortcuts */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-700 dark:text-emerald-400 text-xl">
                    speed
                  </span>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Operational Actions &amp; Navigation
                  </h4>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Access live workflows directly to fulfill customer tasks and process orders.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                <Link
                  to="/dashboard/tracking"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1b4d24] hover:bg-[#133619] dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white text-xs font-bold transition text-center shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm">route</span>
                  Order Tracking
                </Link>
                {isCallCenter && (
                  <Link
                    to="/dashboard/call-center"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition text-center"
                  >
                    <span className="material-symbols-outlined text-sm">summarize</span>
                    Daily Shift Report
                  </Link>
                )}
                {isStoreManager && (
                  <Link
                    to="/dashboard/products?tab=stock"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition text-center"
                  >
                    <span className="material-symbols-outlined text-sm">inventory_2</span>
                    Stock &amp; Inventory
                  </Link>
                )}
                {!isCallCenter && !isStoreManager && (
                  <Link
                    to="/dashboard/pos"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition text-center"
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
