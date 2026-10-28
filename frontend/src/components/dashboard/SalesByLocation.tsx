import { useMemo } from "react";
import { CHART } from "./chartTheme";

interface Props {
  orders: any[];
}

interface LocationStat {
  city: string;
  orders: number;
  revenue: number;
  percentage: number;
  color: string;
}

const LOCATION_COLORS = [
  CHART.green700,
  CHART.gold,
  CHART.green500,
  CHART.green300,
  CHART.mutedInk,
];

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Segmented SVG ring for revenue share.
 *
 * Each slice is a dashed stroke offset by the total length of the slices
 * before it, so the ring reads as separate markets rather than one donut.
 */
function ShareRing({ slices, topShare }: { slices: LocationStat[]; topShare: number }) {
  const size = 96;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 3;

  let cursor = 0;
  const segments = slices.map((slice) => {
    const length = (slice.percentage / 100) * circumference;
    const segment = {
      city: slice.city,
      color: slice.color,
      offset: cursor,
      dash: slices.length === 1 ? circumference : Math.max(length - gap, 0.75),
    };
    cursor += length;
    return segment;
  });

  return (
    <div className="relative h-[96px] w-[96px] shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`Top market holds ${Math.round(topShare)}% of revenue`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-[#e8f5e9] dark:text-zinc-800"
        />
        {segments.map((segment) => (
          <circle
            key={segment.city}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
            strokeDashoffset={-segment.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[21px] font-bold leading-none text-zinc-900 tabular-nums dark:text-zinc-100">
          {Math.round(topShare)}
          <span className="text-[11px]">%</span>
        </span>
        <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          share
        </span>
      </div>
    </div>
  );
}

export default function SalesByLocation({ orders }: Props) {
  const { locations, ringSlices, totalOrders, totalRegions, totalRevenue } = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    let validOrders = 0;
    let sumRev = 0;

    orders.forEach((o) => {
      const status = String(o.status || "").toLowerCase();
      if (status === "cancelled") return;
      const city = String(o.city || "").trim() || "Addis Ababa";
      const rev = Number(o.total || o.total_amount || 0);
      if (!map[city]) map[city] = { count: 0, revenue: 0 };
      map[city].count += 1;
      map[city].revenue += rev;
      validOrders += 1;
      sumRev += rev;
    });

    const sorted: LocationStat[] = Object.entries(map)
      .map(([city, stats]) => ({
        city,
        orders: stats.count,
        revenue: stats.revenue,
        percentage: sumRev > 0 ? Number(((stats.revenue / sumRev) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .map((loc, i) => ({ ...loc, color: LOCATION_COLORS[i % LOCATION_COLORS.length] }));

    const displayed = sorted.slice(0, 5);
    const ringSlices =
      sorted.length <= 5
        ? displayed
        : [
            ...sorted.slice(0, 4),
            {
              city: "Other cities",
              orders: sorted.slice(4).reduce((sum, loc) => sum + loc.orders, 0),
              revenue: sorted.slice(4).reduce((sum, loc) => sum + loc.revenue, 0),
              percentage: Number(
                sorted.slice(4).reduce((sum, loc) => sum + loc.percentage, 0).toFixed(1)
              ),
              color: CHART.mutedInk,
            },
          ];

    return {
      locations: displayed,
      ringSlices,
      totalOrders: validOrders,
      totalRegions: sorted.length,
      totalRevenue: sumRev,
    };
  }, [orders]);

  const topMarket = locations[0];

  return (
    <div className="card p-5 h-full flex flex-col animate-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Sales by Location
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Regional revenue &amp; order share
          </p>
        </div>
        <div className="w-9 h-9 rounded-lg border border-emerald-600 bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/20">
          <span className="material-symbols-outlined text-[18px]">location_on</span>
        </div>
      </div>

      {topMarket ? (
        <>
          {/* Top market hero */}
          <div className="relative mt-4 overflow-hidden rounded-xl border border-[#d4ecd4] bg-gradient-to-br from-[#f1f9f1] via-[#f8fcf6] to-[#fbf7ec] p-4 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900">
            <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-emerald-300/30 blur-2xl dark:bg-emerald-500/10" />
            <div className="relative flex items-center gap-3.5">
              <ShareRing slices={ringSlices} topShare={topMarket.percentage} />
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  Top Market
                </span>
                <p
                  className="mt-1 truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100"
                  title={topMarket.city}
                >
                  {topMarket.city}
                </p>
                <p className="mt-0.5 text-[17px] font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-100">
                  {formatNumber(topMarket.revenue)}
                  <span className="ml-1 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                    ETB
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                  {topMarket.orders.toLocaleString("en-US")} orders
                </p>
              </div>
            </div>
          </div>

          {/* Ranked markets */}
          <div className="mt-3 flex-1 flex flex-col justify-center gap-1.5">
            {locations.map((loc, index) => (
              <div
                key={loc.city}
                className="rounded-lg px-2 py-1.5 -mx-1 transition-colors hover:bg-[#f4faf4] dark:hover:bg-zinc-900/70"
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-[9px] font-mono font-bold text-zinc-400 tabular-nums dark:text-zinc-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: loc.color }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    title={loc.city}
                  >
                    {loc.city}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums dark:text-zinc-500">
                    {loc.orders} orders
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                    {formatNumber(loc.revenue)}
                    <span className="ml-0.5 text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                      ETB
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-6">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#e8f5e9] dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(loc.percentage, 2)}%`,
                        backgroundColor: loc.color,
                      }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[10px] font-bold text-[#4a734d] tabular-nums dark:text-emerald-400">
                    {loc.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary strip */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 text-center dark:border-zinc-800/80">
            <div>
              <p className="text-[13px] font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                {totalRegions}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-zinc-400 dark:text-zinc-500">
                Cities
              </p>
            </div>
            <div className="border-x border-zinc-100 dark:border-zinc-800/80">
              <p className="text-[13px] font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                {totalOrders.toLocaleString("en-US")}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-zinc-400 dark:text-zinc-500">
                Orders
              </p>
            </div>
            <div>
              <p className="text-[13px] font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                {formatCompact(totalRevenue)}
                <span className="ml-1 text-[9px] font-semibold text-zinc-400 dark:text-zinc-500">
                  ETB
                </span>
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-zinc-400 dark:text-zinc-500">
                Revenue
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[#d4ecd4] py-10 dark:border-zinc-800">
          <span className="material-symbols-outlined text-[28px] text-emerald-300 dark:text-emerald-800">
            location_off
          </span>
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            No regional orders in selected period
          </p>
        </div>
      )}
    </div>
  );
}
