
import {
  Chart as ChartJS,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(LinearScale, BarElement, Tooltip);
ChartJS.defaults.color = "#5c6280";
ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.defaults.font.size = 11;
ChartJS.defaults.plugins.legend.display = false;

const tooltipStyle = {
  backgroundColor: "#1a1d28",
  borderColor: "#272c40",
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
};

// ─── Heatmap ───
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm"];

export function Heatmap({ orders }: { orders: any[] }) {
  // Compute real heatmap data from orders
  const heatMapData = Array(7).fill(0).map(() => Array(10).fill(0));
  let maxVal = 1;

  orders.forEach(o => {
    if (!o.created_at) return;
    const d = new Date(o.created_at);
    // JS getDay() is 0=Sun, 1=Mon... we want 0=Mon, 6=Sun
    let dayIdx = d.getDay() - 1;
    if (dayIdx < 0) dayIdx = 6;
    
    // Hours: 9am to 6pm (0 to 9)
    const h = d.getHours();
    if (h >= 9 && h <= 18) {
      const hourIdx = h - 9;
      heatMapData[dayIdx][hourIdx] += 1;
      if (heatMapData[dayIdx][hourIdx] > maxVal) {
        maxVal = heatMapData[dayIdx][hourIdx];
      }
    }
  });

  return (
    <div className="card p-5 animate-in h-full flex flex-col" style={{ animationDelay: "0.45s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold text-[var(--fg)]">Weekly Sales Heatmap</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Sales intensity by day and hour</p>
      </div>
      <div className="overflow-x-auto relative z-[2] flex-1">
        <div className="min-w-[460px]">
          {/* Hour labels */}
          <div className="flex gap-1 mb-1 pl-[44px]">
            {hours.map((h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-[var(--muted)]">{h}</div>
            ))}
          </div>
          {/* Rows */}
          {heatMapData.map((row, ri) => (
            <div key={days[ri]} className="flex gap-1 mb-1">
              <div className="w-[40px] flex items-center text-[10px] text-[var(--muted)] font-medium pr-1">{days[ri]}</div>
              {row.map((val, ci) => {
                const intensity = val / maxVal;
                const r = Math.round(240 * intensity + 20 * (1 - intensity));
                const g = Math.round(160 * intensity + 20 * (1 - intensity));
                const b = Math.round(48 * intensity + 40 * (1 - intensity));
                const alpha = val === 0 ? 0.05 : 0.15 + intensity * 0.75;
                return (
                  <div
                    key={ci}
                    className="heat-cell flex-1 h-[22px] rounded-sm transition-colors hover:border border-[var(--border)]"
                    style={{ background: `rgba(${r},${g},${b},${alpha})` }}
                    title={`${days[ri]} ${hours[ci]}: ${val} orders`}
                  />
                );
              })}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-2 pl-[44px]">
            <span className="text-[9px] text-[var(--muted)]">Low</span>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => {
              const r = Math.round(240 * v + 20 * (1 - v));
              const g = Math.round(160 * v + 20 * (1 - v));
              const b = Math.round(48 * v + 40 * (1 - v));
              return <div key={v} className="w-4 h-3 rounded-sm" style={{ background: `rgba(${r},${g},${b},${0.15 + v * 0.75})` }} />;
            })}
            <span className="text-[9px] text-[var(--muted)]">High</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Funnel ───
export function Pipeline({ orders }: { orders: any[] }) {
  // Aggregate real orders based on status
  // Our system statuses: Pending, Processing, Shipped, Delivered, Cancelled
  const stats = {
    pending: { count: 0, val: 0 },
    processing: { count: 0, val: 0 },
    shipped: { count: 0, val: 0 },
    delivered: { count: 0, val: 0 }
  };

  orders.forEach(o => {
    const s = o.status?.toLowerCase();
    const v = Number(o.total || o.total_amount || 0);
    if (s === 'pending') { stats.pending.count++; stats.pending.val += v; }
    else if (s === 'processing') { stats.processing.count++; stats.processing.val += v; }
    else if (s === 'shipped') { stats.shipped.count++; stats.shipped.val += v; }
    else if (s === 'delivered') { stats.delivered.count++; stats.delivered.val += v; }
  });

  return (
    <div className="card p-5 animate-in h-full flex flex-col" style={{ animationDelay: "0.5s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold text-[var(--fg)]">Order Pipeline</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Fulfillment stages and values</p>
      </div>
      <div className="relative z-[2] flex-1 min-h-[160px]">
        <Bar
          data={{
            labels: ["Delivered", "Shipped", "Processing", "Pending"],
            datasets: [{
              data: [stats.delivered.val, stats.shipped.val, stats.processing.val, stats.pending.val],
              backgroundColor: ["#10b981", "#8b5cf6", "#f59e0b", "#38bdf8"],
              borderRadius: 6,
              borderSkipped: false,
              barThickness: 20,
            }],
          }}
          options={{
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx: any) => ` ${(ctx.parsed.x || 0).toLocaleString()} ETB` } } },
            scales: {
              x: { beginAtZero: true, grid: { color: "rgba(100,100,100,0.1)" }, ticks: { callback: (v) => `${(Number(v) / 1000).toFixed(0)}k` }, border: { display: false } },
              y: { grid: { display: false }, border: { display: false }, ticks: { color: 'var(--fg-secondary)' } },
            },
          }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-[var(--border)] relative z-[2]">
        {[
          { label: "Pending", value: stats.pending.count, color: "var(--sky)" },
          { label: "Process", value: stats.processing.count, color: "var(--accent)" },
          { label: "Shipped", value: stats.shipped.count, color: "var(--violet)" },
          { label: "Done", value: stats.delivered.count, color: "var(--emerald)" },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-base font-extrabold" style={{ color: item.color }}>{item.value}</p>
            <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

