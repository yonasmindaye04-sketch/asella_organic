import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { CHART, CHART_AXIS, CHART_TOOLTIP } from "./chartTheme";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const tooltipStyle = CHART_TOOLTIP;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_SLOTS = [
  { label: "08–10h", start: 0, end: 10 },
  { label: "10–12h", start: 10, end: 12 },
  { label: "12–14h", start: 12, end: 14 },
  { label: "14–16h", start: 14, end: 16 },
  { label: "16–18h", start: 16, end: 18 },
  { label: "18–22h", start: 18, end: 24 },
];

export function Heatmap({ orders }: { orders: any[] }) {
  const { grid, maxVal, peakDay, peakSlot } = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: TIME_SLOTS.length }, () => ({ count: 0, revenue: 0 }))
    );
    let highest = 1;
    let bestDay = "Mon";
    let bestSlot = "10–12h";
    let bestCount = 0;

    orders.forEach((o) => {
      if (!o.created_at) return;
      const status = String(o.status || "").toLowerCase();
      if (status === "cancelled") return;

      const d = new Date(o.created_at);
      let dayIdx = d.getDay() - 1;
      if (dayIdx < 0) dayIdx = 6;

      const h = d.getHours();
      const sIdx = TIME_SLOTS.findIndex((s) => h >= s.start && h < s.end);
      const slotIdx = sIdx === -1 ? 2 : sIdx;

      matrix[dayIdx][slotIdx].count += 1;
      matrix[dayIdx][slotIdx].revenue += Number(o.total || o.total_amount || 0);

      if (matrix[dayIdx][slotIdx].count > highest) {
        highest = matrix[dayIdx][slotIdx].count;
      }
      if (matrix[dayIdx][slotIdx].count > bestCount) {
        bestCount = matrix[dayIdx][slotIdx].count;
        bestDay = DAYS[dayIdx];
        bestSlot = TIME_SLOTS[slotIdx].label;
      }
    });

    return { grid: matrix, maxVal: highest, peakDay: bestDay, peakSlot: bestSlot };
  }, [orders]);

  return (
    <div className="card p-5 h-full flex flex-col justify-between animate-in">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Order Activity Heatmap
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Checkout density by day of week and time window
            </p>
          </div>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
            Peak: {peakDay} {peakSlot}
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[340px]">
            {/* Time slot headers */}
            <div className="flex gap-1.5 mb-1.5 pl-10">
              {TIME_SLOTS.map((slot) => (
                <div
                  key={slot.label}
                  className="flex-1 text-center text-[10px] font-medium text-zinc-400 tabular-nums"
                >
                  {slot.label}
                </div>
              ))}
            </div>

            {/* Day rows */}
            {grid.map((row, ri) => (
              <div key={DAYS[ri]} className="flex items-center gap-1.5 mb-1.5">
                <div className="w-8.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {DAYS[ri]}
                </div>
                {row.map((cell, ci) => {
                  const intensity = cell.count / maxVal;
                  const bgStyle =
                    cell.count === 0
                      ? undefined
                      : {
                          backgroundColor: `rgba(46, 125, 50, ${Math.min(
                            0.92,
                            0.18 + intensity * 0.74
                          )})`,
                        };
                  return (
                    <div
                      key={ci}
                      style={bgStyle}
                      title={`${DAYS[ri]} ${TIME_SLOTS[ci].label}: ${cell.count} orders (${cell.revenue.toLocaleString()} ETB)`}
                      className={`heat-cell flex-1 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold tabular-nums transition-all ${
                        cell.count === 0
                          ? "bg-zinc-100/80 dark:bg-zinc-800/50 text-transparent"
                          : intensity > 0.55
                          ? "text-white"
                          : "text-emerald-900 dark:text-emerald-200"
                      }`}
                    >
                      {cell.count > 0 ? cell.count : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Hover any cell for order count & ETB volume</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px]">Low</span>
          {[0.18, 0.38, 0.62, 0.9].map((alpha) => (
            <span
              key={alpha}
              className="w-3.5 h-3 rounded-xs inline-block"
              style={{ backgroundColor: `rgba(46, 125, 50, ${alpha})` }}
            />
          ))}
          <span className="text-[10px]">High</span>
        </div>
      </div>
    </div>
  );
}

// ─── Fulfillment Pipeline ───
export function Pipeline({ orders }: { orders: any[] }) {
  const stats = useMemo(() => {
    const res = {
      pending: { label: "Pending", count: 0, val: 0, color: CHART.gold },
      confirmed: { label: "Confirmed / Prep", count: 0, val: 0, color: CHART.green300 },
      transit: { label: "In Transit", count: 0, val: 0, color: CHART.mutedInk },
      delivered: { label: "Delivered", count: 0, val: 0, color: CHART.green700 },
    };

    orders.forEach((o) => {
      const s = String(o.status || "").toLowerCase();
      const v = Number(o.total || o.total_amount || 0);
      if (s === "pending") {
        res.pending.count++;
        res.pending.val += v;
      } else if (s === "confirmed" || s === "processing") {
        res.confirmed.count++;
        res.confirmed.val += v;
      } else if (s === "in transit" || s === "shipped") {
        res.transit.count++;
        res.transit.val += v;
      } else if (s === "delivered") {
        res.delivered.count++;
        res.delivered.val += v;
      }
    });

    return res;
  }, [orders]);

  const stages = [stats.delivered, stats.transit, stats.confirmed, stats.pending];

  return (
    <div className="card p-5 h-full flex flex-col justify-between animate-in">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Fulfillment Pipeline
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Order value (ETB) & volume by fulfillment stage
            </p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-zinc-400">local_shipping</span>
        </div>

        <div className="h-[165px] relative">
          <Bar
            data={{
              labels: stages.map((s) => s.label),
              datasets: [
                {
                  data: stages.map((s) => s.val),
                  backgroundColor: stages.map((s) => s.color),
                  borderRadius: 6,
                  borderSkipped: false,
                  barThickness: 20,
                },
              ],
            }}
            options={{
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...tooltipStyle,
                  callbacks: {
                    label: (ctx: any) => {
                      const st = stages[ctx.dataIndex];
                      return ` ${st.val.toLocaleString()} ETB (${st.count} orders)`;
                    },
                  },
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  grid: { color: CHART_AXIS.grid },
                  border: { display: false },
                  ticks: {
                    color: CHART_AXIS.tick,
                    callback: (v) => {
                      const num = Number(v);
                      return num >= 1000 ? `${(num / 1000).toFixed(0)}k` : `${num}`;
                    },
                  },
                },
                y: {
                  grid: { display: false },
                  border: { display: false },
                  ticks: { color: CHART_AXIS.tick, font: { weight: 500, size: 11 } },
                },
              },
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        {[stats.pending, stats.confirmed, stats.transit, stats.delivered].map((item) => (
          <div
            key={item.label}
            className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 text-center"
          >
            <p className="text-sm font-bold tabular-nums" style={{ color: item.color }}>
              {item.count}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
              {item.label.split(" / ")[0]}
            </p>
            <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
              {item.val >= 1000 ? `${(item.val / 1000).toFixed(1)}k` : item.val} ETB
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
