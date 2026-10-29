import { useState, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import type { TimeRange } from "./TimeRangeSelector";
import { CHART, CHART_AXIS, CHART_SERIES, CHART_TOOLTIP } from "./chartTheme";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

ChartJS.defaults.color = CHART_AXIS.tick;
ChartJS.defaults.font.family = "'Inter', -apple-system, sans-serif";
ChartJS.defaults.font.size = 11;

const tooltipStyle = CHART_TOOLTIP;

interface TimeBucket {
  label: string;
  startMs: number;
  endMs: number;
}

function parseLocalDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function parseLocalDayEnd(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildDynamicBuckets(
  activeRange: TimeRange,
  fromStr?: string,
  toStr?: string
): TimeBucket[] {
  const now = new Date();
  const endDate = toStr ? parseLocalDayEnd(toStr) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let startDate: Date;

  if (fromStr) {
    startDate = parseLocalDayStart(fromStr);
  } else if (activeRange === "day") {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 0, 0, 0, 0);
  } else if (activeRange === "week") {
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 29);
    startDate.setHours(0, 0, 0, 0);
  }

  const diffDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // 1. Single-day view -> 2-hour intraday slots (08:00 to 20:00)
  if (activeRange === "day" || diffDays <= 1) {
    const slots = [
      { label: "08:00–10:00", startH: 0, endH: 10 },
      { label: "10:00–12:00", startH: 10, endH: 12 },
      { label: "12:00–14:00", startH: 12, endH: 14 },
      { label: "14:00–16:00", startH: 14, endH: 16 },
      { label: "16:00–18:00", startH: 16, endH: 18 },
      { label: "18:00–24:00", startH: 18, endH: 24 },
    ];
    return slots.map((s) => {
      const sDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), s.startH, 0, 0, 0);
      const eDate =
        s.endH === 24
          ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999)
          : new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), s.endH, 0, 0, -1);
      return {
        label: s.label,
        startMs: sDate.getTime(),
        endMs: eDate.getTime(),
      };
    });
  }

  // 2. Week or up to 10 days -> Daily buckets
  if (activeRange === "week" || diffDays <= 10) {
    const buckets: TimeBucket[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999);
      const label = `${SHORT_DAYS[dayStart.getDay()]} ${dayStart.getDate()}`;
      buckets.push({
        label,
        startMs: dayStart.getTime(),
        endMs: dayEnd.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return buckets;
  }

  // 3. 1M or Custom > 10 days -> Divide into 6 to 8 clean intervals
  const bucketCount = Math.min(8, Math.max(5, Math.ceil(diffDays / 5)));
  const totalMs = endDate.getTime() - startDate.getTime();
  const stepMs = totalMs / bucketCount;
  const buckets: TimeBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bStart = Math.round(startDate.getTime() + i * stepMs);
    const bEnd = i === bucketCount - 1 ? endDate.getTime() : Math.round(startDate.getTime() + (i + 1) * stepMs - 1);
    const dStart = new Date(bStart);
    const dEnd = new Date(bEnd);
    const label =
      dStart.getMonth() === dEnd.getMonth() && dStart.getDate() === dEnd.getDate()
        ? `${SHORT_MONTHS[dStart.getMonth()]} ${dStart.getDate()}`
        : `${SHORT_MONTHS[dStart.getMonth()]} ${dStart.getDate()}–${dEnd.getDate()}`;
    buckets.push({ label, startMs: bStart, endMs: bEnd });
  }
  return buckets;
}

// ─── 1. Revenue & Profit Overview ───
export function RevenueChart({
  orders,
  expenses = [],
  activeRange = "month",
  from,
  to,
}: {
  orders: any[];
  expenses?: any[];
  activeRange?: TimeRange;
  from?: string;
  to?: string;
}) {
  const [chartType, setChartType] = useState<"area" | "bar">("area");

  const { labels, revenueData, profitData, totalRev, totalProfit, marginPct } = useMemo(() => {
    const rawBuckets = buildDynamicBuckets(activeRange, from, to);
    const revArr = new Array(rawBuckets.length).fill(0);
    const costArr = new Array(rawBuckets.length).fill(0);

    // Aggregate non-cancelled orders into buckets
    orders.forEach((o) => {
      if (!o.created_at) return;
      const status = String(o.status || "").toLowerCase();
      if (status === "cancelled" || status === "returned") return;

      const t = new Date(o.created_at).getTime();
      const idx = rawBuckets.findIndex((b) => t >= b.startMs && t <= b.endMs);
      if (idx !== -1) {
        const orderRev = Number(o.total || o.total_amount || 0);
        revArr[idx] += orderRev;

        // Calculate COGS from order items if available
        if (Array.isArray(o.items) && o.items.length > 0) {
          const orderCogs = o.items.reduce((sum: number, item: any) => {
            const qty = Number(item.quantity || 1);
            const unitCost =
              item.unit_cost !== undefined && item.unit_cost !== null
                ? Number(item.unit_cost)
                : Number(item.unit_price || item.price || 0) * 0.52;
            return sum + qty * unitCost;
          }, 0);
          costArr[idx] += orderCogs;
        } else {
          costArr[idx] += orderRev * 0.52;
        }
      }
    });

    // Aggregate operating expenses into buckets
    expenses.forEach((e) => {
      if (!e.created_at || e.voided_at) return;
      if (e.category === "vendor_purchase") return; // COGS already accounted per item
      const t = new Date(e.created_at).getTime();
      const idx = rawBuckets.findIndex((b) => t >= b.startMs && t <= b.endMs);
      if (idx !== -1) {
        costArr[idx] += Number(e.amount || 0);
      }
    });

    const profArr = revArr.map((r, i) => Math.round(r - costArr[i]));

    // Trim leading & trailing empty buckets so the chart starts directly at the first real data point
    let firstActive = revArr.findIndex((v, i) => v > 0 || costArr[i] > 0);
    let lastActive = -1;
    for (let i = revArr.length - 1; i >= 0; i--) {
      if (revArr[i] > 0 || costArr[i] > 0) {
        lastActive = i;
        break;
      }
    }

    if (firstActive === -1) {
      firstActive = 0;
      lastActive = rawBuckets.length - 1;
    }

    const trimmedBuckets = rawBuckets.slice(firstActive, lastActive + 1);
    const trimmedRev = revArr.slice(firstActive, lastActive + 1);
    const trimmedProf = profArr.slice(firstActive, lastActive + 1);

    const sumRev = trimmedRev.reduce((a, b) => a + b, 0);
    const sumProf = trimmedProf.reduce((a, b) => a + b, 0);
    const margin = sumRev > 0 ? Math.round((sumProf / sumRev) * 100) : 0;

    return {
      labels: trimmedBuckets.map((b) => b.label),
      revenueData: trimmedRev,
      profitData: trimmedProf,
      totalRev: sumRev,
      totalProfit: sumProf,
      marginPct: margin,
    };
  }, [orders, expenses, activeRange, from, to]);

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          label: (ctx: any) =>
            ` ${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toLocaleString()} ETB`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: CHART_AXIS.tick, font: { size: 11, weight: 500 } },
      },
      y: {
        beginAtZero: false,
        grace: "10%",
        grid: { color: CHART_AXIS.grid },
        border: { display: false },
        ticks: {
          color: CHART_AXIS.tick,
          callback: (v: any) => {
            const num = Number(v);
            if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
            return `${num}`;
          },
        },
      },
    },
  };

  return (
    <div className="card p-5 flex flex-col justify-between animate-in">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Revenue & Profit Overview
              </h3>
              <span className={`text-[13px] font-bold tabular-nums ${
                marginPct >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
              }`}>
                {marginPct}% Net Margin
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Gross revenue vs. net profit after COGS & operating expenses (ETB)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#2e7d32] inline-block" />
                Revenue
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#8b6932] inline-block" />
                Net Profit
              </span>
            </div>

            <div className="inline-flex p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/80">
              <button
                type="button"
                onClick={() => setChartType("area")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  chartType === "area"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                Area
              </button>
              <button
                type="button"
                onClick={() => setChartType("bar")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  chartType === "bar"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                Bar
              </button>
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800">
          <div>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Period Revenue</p>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-0.5">
              {totalRev.toLocaleString()} ETB
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Period Net Profit</p>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {totalProfit.toLocaleString()} ETB
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Active Intervals</p>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-0.5">
              {labels.length} {labels.length === 1 ? "bucket" : "buckets"}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[235px] relative">
        {chartType === "area" ? (
          <Line
            data={{
              labels,
              datasets: [
                {
                  label: "Gross Revenue",
                  data: revenueData,
                  borderColor: CHART.green700,
                  backgroundColor: (ctx: any) => {
                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 230);
                    g.addColorStop(0, "rgba(46, 125, 50, 0.22)");
                    g.addColorStop(1, "rgba(46, 125, 50, 0.01)");
                    return g;
                  },
                  borderWidth: 2.5,
                  fill: true,
                  tension: 0.35,
                  pointRadius: 4,
                  pointBackgroundColor: CHART.green700,
                  pointBorderColor: CHART.cream,
                  pointBorderWidth: 1.5,
                  pointHoverRadius: 6,
                },
                {
                  label: "Net Profit",
                  data: profitData,
                  borderColor: CHART.gold,
                  backgroundColor: (ctx: any) => {
                    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 230);
                    g.addColorStop(0, "rgba(139, 105, 50, 0.16)");
                    g.addColorStop(1, "rgba(139, 105, 50, 0.0)");
                    return g;
                  },
                  borderWidth: 2,
                  fill: true,
                  tension: 0.35,
                  pointRadius: 3.5,
                  pointBackgroundColor: CHART.gold,
                  pointBorderColor: CHART.cream,
                  pointBorderWidth: 1.5,
                  pointHoverRadius: 5,
                },
              ],
            }}
            options={commonOptions}
          />
        ) : (
          <Bar
            data={{
              labels,
              datasets: [
                {
                  label: "Gross Revenue",
                  data: revenueData,
                  backgroundColor: CHART.green700,
                  borderRadius: 6,
                  maxBarThickness: 28,
                },
                {
                  label: "Net Profit",
                  data: profitData,
                  backgroundColor: CHART.gold,
                  borderRadius: 6,
                  maxBarThickness: 28,
                },
              ],
            }}
            options={{
              ...commonOptions,
              scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, beginAtZero: true },
              },
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── 2. Sales Distribution (Donut + Revenue & Count Breakdown) ───
const CHANNEL_COLORS = CHART_SERIES;

export function SalesDistribution({ orders }: { orders: any[] }) {
  const { channels, totalOrders, totalRevenue } = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    let sumRev = 0;

    orders.forEach((o) => {
      const status = String(o.status || "").toLowerCase();
      if (status === "cancelled") return;
      const rawSrc = String(o.source || "Direct").trim();
      const src = rawSrc.charAt(0).toUpperCase() + rawSrc.slice(1);
      const rev = Number(o.total || o.total_amount || 0);
      if (!map[src]) map[src] = { count: 0, revenue: 0 };
      map[src].count += 1;
      map[src].revenue += rev;
      sumRev += rev;
    });

    const list = Object.entries(map)
      .map(([name, stats], idx) => ({
        name,
        count: stats.count,
        revenue: stats.revenue,
        sharePct: sumRev > 0 ? Math.round((stats.revenue / sumRev) * 100) : 0,
        color: CHANNEL_COLORS[idx % CHANNEL_COLORS.length],
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      channels: list,
      totalOrders: list.reduce((s, c) => s + c.count, 0),
      totalRevenue: sumRev,
    };
  }, [orders]);

  return (
    <div className="card p-5 flex flex-col justify-between animate-in">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Sales by Channel
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Revenue & order volume across acquisition sources
            </p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-zinc-400">donut_large</span>
        </div>

        <div className="relative h-[175px] flex items-center justify-center my-2">
          {channels.length > 0 ? (
            <>
              <Doughnut
                data={{
                  labels: channels.map((c) => c.name),
                  datasets: [
                    {
                      data: channels.map((c) => c.revenue),
                      backgroundColor: channels.map((c) => c.color),
                      borderWidth: 2,
                      borderColor: "transparent",
                      hoverOffset: 6,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "70%",
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...tooltipStyle,
                      callbacks: {
                        label: (ctx: any) => {
                          const ch = channels[ctx.dataIndex];
                          return ` ${ch.name}: ${ch.revenue.toLocaleString()} ETB (${ch.count} orders)`;
                        },
                      },
                    },
                  },
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {totalOrders}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Orders
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-400">No channel data in selected period</div>
          )}
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
        {channels.slice(0, 4).map((ch) => (
          <div key={ch.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: ch.color }}
              />
              <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
                {ch.name}
              </span>
              <span className="text-[11px] text-zinc-400 tabular-nums">({ch.count})</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 tabular-nums">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {ch.revenue.toLocaleString()} ETB
              </span>
              <span className="text-[11px] font-medium text-zinc-500 w-9 text-right">
                {ch.sharePct}%
              </span>
            </div>
          </div>
        ))}
        {totalRevenue > 0 && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Total Channel Revenue</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {totalRevenue.toLocaleString()} ETB
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 3. Top Products Sales Trend (Interactive ETB / Qty Toggle + Ranked Summary) ───
const PRODUCT_COLORS = CHART_SERIES.slice(0, 4);

export function TopProducts({
  orders,
  activeRange = "month",
  from,
  to,
}: {
  orders: any[];
  activeRange?: TimeRange;
  from?: string;
  to?: string;
}) {
  const [metricMode, setMetricMode] = useState<"etb" | "qty">("etb");

  const { labels, topProductsList, datasets, grandTotalEtb, grandTotalQty } = useMemo(() => {
    const rawBuckets = buildDynamicBuckets(activeRange, from, to);

    // Track per-product totals and per-bucket arrays
    const productStats: Record<
      string,
      {
        name: string;
        totalQty: number;
        totalEtb: number;
        bucketQty: number[];
        bucketEtb: number[];
      }
    > = {};

    const bucketHasActivity = new Array(rawBuckets.length).fill(false);

    orders.forEach((o) => {
      if (!o.created_at) return;
      const status = String(o.status || "").toLowerCase();
      if (status === "cancelled" || status === "returned") return;

      const t = new Date(o.created_at).getTime();
      const bIdx = rawBuckets.findIndex((b) => t >= b.startMs && t <= b.endMs);
      if (bIdx === -1) return;

      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length > 0) {
        items.forEach((item: any) => {
          const baseName = item.item_name || item.product_name || item.name || "Organic Product";
          const pkg = item.package_size ? ` (${item.package_size})` : "";
          const fullName = `${baseName}${pkg}`;
          const qty = Number(item.quantity || 1);
          const unitPrice = Number(item.unit_price ?? item.price ?? 0);
          const lineEtb =
            unitPrice > 0
              ? qty * unitPrice
              : items.length === 1
              ? Number(o.total || 0)
              : Math.round(Number(o.total || 0) / items.length);

          if (!productStats[fullName]) {
            productStats[fullName] = {
              name: fullName,
              totalQty: 0,
              totalEtb: 0,
              bucketQty: new Array(rawBuckets.length).fill(0),
              bucketEtb: new Array(rawBuckets.length).fill(0),
            };
          }
          productStats[fullName].totalQty += qty;
          productStats[fullName].totalEtb += lineEtb;
          productStats[fullName].bucketQty[bIdx] += qty;
          productStats[fullName].bucketEtb[bIdx] += lineEtb;
          bucketHasActivity[bIdx] = true;
        });
      }
    });

    // Trim leading/trailing empty buckets so chart starts directly with real data
    let firstIdx = bucketHasActivity.findIndex(Boolean);
    let lastIdx = -1;
    for (let i = bucketHasActivity.length - 1; i >= 0; i--) {
      if (bucketHasActivity[i]) {
        lastIdx = i;
        break;
      }
    }
    if (firstIdx === -1) {
      firstIdx = 0;
      lastIdx = rawBuckets.length - 1;
    }

    const trimmedLabels = rawBuckets.slice(firstIdx, lastIdx + 1).map((b) => b.label);

    const allSorted = Object.values(productStats).sort((a, b) =>
      metricMode === "etb" ? b.totalEtb - a.totalEtb : b.totalQty - a.totalQty
    );

    const top5 = allSorted.slice(0, 5).map((p, idx) => ({
      ...p,
      color: PRODUCT_COLORS[idx % PRODUCT_COLORS.length],
      seriesEtb: p.bucketEtb.slice(firstIdx, lastIdx + 1),
      seriesQty: p.bucketQty.slice(firstIdx, lastIdx + 1),
    }));

    const totalEtbAll = allSorted.reduce((s, p) => s + p.totalEtb, 0);
    const totalQtyAll = allSorted.reduce((s, p) => s + p.totalQty, 0);

    const chartDatasets = top5.map((p) => ({
      label: p.name,
      data: metricMode === "etb" ? p.seriesEtb : p.seriesQty,
      backgroundColor: p.color,
      borderRadius: 6,
      maxBarThickness: 28,
      barPercentage: 0.7,
      categoryPercentage: 0.8,
    }));

    return {
      labels: trimmedLabels,
      topProductsList: top5,
      datasets: chartDatasets,
      grandTotalEtb: totalEtbAll,
      grandTotalQty: totalQtyAll,
    };
  }, [orders, activeRange, from, to, metricMode]);

  return (
    <div className="card p-5 flex flex-col justify-between animate-in">
      <div>
        {/* Header with interactive ETB / Qty toggle */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Top Products Sales Trend
              </h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 tabular-nums">
                {grandTotalQty.toLocaleString()} units · {grandTotalEtb.toLocaleString()} ETB
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Compare best-selling products by revenue (ETB) or unit volume (Qty)
            </p>
          </div>

          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/80">
            <button
              type="button"
              onClick={() => setMetricMode("etb")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                metricMode === "etb"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              Birr (ETB)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode("qty")}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                metricMode === "qty"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              Items (Qty)
            </button>
          </div>
        </div>

        {/* Multi-line Trend Chart */}
        <div className="h-[195px] relative">
          {topProductsList.length > 0 ? (
            <Bar
              data={{
                labels,
                datasets,
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "nearest" as const, intersect: true },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    ...tooltipStyle,
                    callbacks: {
                      label: (ctx: any) => {
                        const val = Number(ctx.parsed.y || 0);
                        return metricMode === "etb"
                          ? ` ${ctx.dataset.label}: ${val.toLocaleString()} ETB`
                          : ` ${ctx.dataset.label}: ${val.toLocaleString()} units`;
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: CHART_AXIS.tick, font: { size: 11, weight: 500 } },
                  },
                  y: {
                    beginAtZero: true,
                    grid: { color: CHART_AXIS.grid },
                    border: { display: false },
                    ticks: {
                      color: CHART_AXIS.tick,
                      callback: (v: any) => {
                        const num = Number(v);
                        if (metricMode === "etb" && num >= 1000) {
                          return `${(num / 1000).toFixed(1)}k`;
                        }
                        return `${num}`;
                      },
                    },
                  },
                },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-zinc-400">
              No product sales recorded in this date window
            </div>
          )}
        </div>
      </div>

      {/* Ranked Summary Breakdown showing BOTH Qty and Birr (ETB) */}
      {topProductsList.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {topProductsList.map((prod, idx) => {
              const sharePct =
                grandTotalEtb > 0 ? Math.round((prod.totalEtb / grandTotalEtb) * 100) : 0;
              return (
                <div
                  key={prod.name}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-50/90 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: prod.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {idx + 1}. {prod.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        <strong className="text-zinc-700 dark:text-zinc-200">
                          {prod.totalQty.toLocaleString()}
                        </strong>{" "}
                        items sold · {sharePct}% of revenue
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 tabular-nums">
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {prod.totalEtb.toLocaleString()} ETB
                    </p>
                    <p className="text-[10px] font-medium text-zinc-400">
                      {prod.totalQty > 0
                        ? `${Math.round(prod.totalEtb / prod.totalQty).toLocaleString()} ETB/unit`
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
