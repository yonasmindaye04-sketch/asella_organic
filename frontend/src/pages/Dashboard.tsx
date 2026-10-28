import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import KPICards from "../components/dashboard/KPICards";
import {
  RevenueChart,
  SalesDistribution,
  TopProducts,
} from "../components/dashboard/ChartsRow";
import EmployeePerformance from "../components/dashboard/EmployeePerformance";
import { Heatmap, Pipeline } from "../components/dashboard/HeatmapAndPipeline";
import SalesByLocation from "../components/dashboard/SalesByLocation";
import LowStockTable from "../components/dashboard/LowStockTable";
import AffiliateLeaderboard from "../components/dashboard/AffiliateLeaderboard";
import {
  TimeRangeSelector,
  getRangeDates,
} from "../components/dashboard/TimeRangeSelector";
import type { TimeRange } from "../components/dashboard/TimeRangeSelector";
import { api } from "../services/api";

const RANGE_LABELS: Record<TimeRange, string> = {
  day: "Today",
  week: "Last 7 Days",
  month: "Last 30 Days",
  custom: "Custom Range",
};

export default function DashboardPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeRange, setActiveRange] = useState<TimeRange>("month");
  const [dateRange, setDateRange] = useState(() => getRangeDates("month"));

  useEffect(() => {
    let cancelled = false;
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ limit: "1500" });
        if (dateRange.from) params.set("from", dateRange.from);
        if (dateRange.to) params.set("to", dateRange.to);
        const query = `?${params.toString()}`;

        const [ordersRes, expensesRes] = await Promise.all([
          api.get<any>(`/api/orders${query}`),
          api.get<any>(`/api/expenses${query}`),
        ]);

        if (cancelled) return;

        const orderList = ordersRes.data?.data || ordersRes.data;
        setOrders(Array.isArray(orderList) ? orderList : []);

        const expenseList = expensesRes.data?.data || expensesRes.data;
        setExpenses(Array.isArray(expenseList) ? expenseList : []);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDashboardData();
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  const handleRangeChange = (range: TimeRange, from: string, to: string) => {
    setActiveRange(range);
    setDateRange({ from, to });
  };

  // Compute accurate KPI metrics from filtered orders & expenses
  const kpiMetrics = useMemo(() => {
    const validOrders = orders.filter((o) => {
      const st = String(o.status || "").toLowerCase();
      return st !== "cancelled" && st !== "returned";
    });

    const totalRevenue = validOrders.reduce(
      (sum, o) => sum + Number(o.total || o.total_amount || 0),
      0
    );

    let totalCogs = 0;
    let totalUnitsSold = 0;

    validOrders.forEach((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length > 0) {
        items.forEach((item: any) => {
          const qty = Number(item.quantity || 1);
          totalUnitsSold += qty;
          const unitCost =
            item.unit_cost !== undefined && item.unit_cost !== null
              ? Number(item.unit_cost)
              : Number(item.unit_price || item.price || 0) * 0.52;
          totalCogs += qty * unitCost;
        });
      } else {
        totalUnitsSold += 1;
        totalCogs += Number(o.total || 0) * 0.52;
      }
    });

    const opExpenses = expenses
      .filter((e) => !e.voided_at && e.category !== "vendor_purchase")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const netProfit = Math.round(totalRevenue - totalCogs - opExpenses);
    const totalOrders = validOrders.length;
    const deliveredOrders = validOrders.filter(
      (o) => String(o.status || "").toLowerCase() === "delivered"
    ).length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const profitMargin =
      totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

    return {
      totalRevenue,
      netProfit,
      totalOrders,
      deliveredOrders,
      avgOrderValue,
      totalUnitsSold,
      totalExpenses: opExpenses,
      profitMargin,
    };
  }, [orders, expenses]);

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-5">
        {/* Top Executive Toolbar with Single Global Date Range Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Executive Analytics
            </h1>
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                Syncing
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time revenue, product sales velocity, and fulfillment performance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <TimeRangeSelector
            activeRange={activeRange}
            from={dateRange.from}
            to={dateRange.to}
            onRangeChange={handleRangeChange}
          />
          <Link
            to="/dashboard/analytics"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[15px] text-emerald-600 dark:text-emerald-400">
              request_quote
            </span>
            <span>P&amp;L Statement</span>
          </Link>
        </div>
      </div>

      {/* Row 1: KPI Summary Cards */}
      <KPICards metrics={kpiMetrics} rangeLabel={RANGE_LABELS[activeRange]} />

      {/* Row 2: Revenue & Profit Overview (2/3) + Sales by Channel Donut (1/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2">
          <RevenueChart
            orders={orders}
            expenses={expenses}
            activeRange={activeRange}
            from={dateRange.from}
            to={dateRange.to}
          />
        </div>
        <div className="xl:col-span-1">
          <SalesDistribution orders={orders} />
        </div>
      </div>

      {/* Row 3: Top Products Sales Trend with ETB/Qty Toggle (2/3) + Sales by Location (1/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="xl:col-span-2">
          <TopProducts
            orders={orders}
            activeRange={activeRange}
            from={dateRange.from}
            to={dateRange.to}
          />
        </div>
        <div className="xl:col-span-1">
          <SalesByLocation orders={orders} />
        </div>
      </div>

      {/* Row 4: Fulfillment Pipeline + Weekly Activity Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Pipeline orders={orders} />
        <Heatmap orders={orders} />
      </div>

      {/* Row 5: Staff Performance + Affiliate Leaderboard + Low Stock Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <EmployeePerformance from={dateRange.from} to={dateRange.to} />
        <AffiliateLeaderboard from={dateRange.from} to={dateRange.to} />
        <LowStockTable />
      </div>
      </div>
    </DashboardLayout>
  );
}
