import { useMemo } from "react";

interface Props {
  orders: any[];
}

function CircularProgress({
  percentage,
  size = 88,
  strokeWidth = 7,
  color,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-zinc-100 dark:text-zinc-800"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="progress-ring-circle"
      />
    </svg>
  );
}

const REGION_COLORS = ["#059669", "#0ea5e9", "#8b5cf6", "#f59e0b", "#14b8a6"];

export default function SalesByLocation({ orders }: Props) {
  const { locations, totalOrders, totalRegions, totalRevenue } = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    let validOrders = 0;
    let sumRev = 0;

    orders.forEach((o) => {
      const status = String(o.status || "").toLowerCase();
      if (status === "cancelled") return;
      const city = String(o.city || "Addis Ababa").trim();
      const rev = Number(o.total || o.total_amount || 0);
      if (!map[city]) map[city] = { count: 0, revenue: 0 };
      map[city].count += 1;
      map[city].revenue += rev;
      validOrders += 1;
      sumRev += rev;
    });

    const sorted = Object.entries(map)
      .map(([city, stats], i) => ({
        city,
        orders: stats.count,
        revenue: stats.revenue,
        percentage: sumRev > 0 ? Number(((stats.revenue / sumRev) * 100).toFixed(1)) : 0,
        color: REGION_COLORS[i % REGION_COLORS.length],
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      locations: sorted.slice(0, 5),
      totalOrders: validOrders,
      totalRegions: Object.keys(map).length,
      totalRevenue: sumRev,
    };
  }, [orders]);

  return (
    <div className="card p-5 h-full flex flex-col justify-between animate-in">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Sales by Location
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Regional revenue & order share
            </p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-zinc-400">location_on</span>
        </div>

        {locations.length > 0 ? (
          <>
            {/* Top City Highlight */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 mb-4">
              <div className="relative shrink-0">
                <CircularProgress
                  percentage={locations[0].percentage}
                  size={74}
                  strokeWidth={6}
                  color={locations[0].color}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {Math.round(locations[0].percentage)}%
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Top Market
                </span>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {locations[0].city}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums mt-0.5">
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {locations[0].revenue.toLocaleString()} ETB
                  </strong>{" "}
                  · {locations[0].orders} orders
                </p>
              </div>
            </div>

            {/* Regional Breakdown List */}
            <div className="space-y-3">
              {locations.map((loc) => (
                <div key={loc.city} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: loc.color }}
                      />
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {loc.city}
                      </span>
                      <span className="text-[11px] text-zinc-400 tabular-nums">
                        ({loc.orders})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {loc.revenue.toLocaleString()} ETB
                      </span>
                      <span className="text-[11px] text-zinc-500 w-10 text-right">
                        {loc.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(loc.percentage, 4)}%`,
                        backgroundColor: loc.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[200px] text-zinc-400 text-xs">
            No regional orders in selected period
          </div>
        )}
      </div>

      {/* Bottom Summary */}
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {totalRegions}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Cities</p>
        </div>
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {totalOrders}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Orders</p>
        </div>
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(1)}k` : totalRevenue}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">ETB Vol.</p>
        </div>
      </div>
    </div>
  );
}
