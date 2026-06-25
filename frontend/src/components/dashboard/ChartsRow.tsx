import React, { useRef, useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { useToast } from "./DashboardToastProvider";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend, Filler);
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

// Maps the actual `source` column values stored in MySQL
const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  website:   { label: 'Online Sales',     color: '#f0a030' },
  telegram:  { label: 'Telegram',         color: '#38bdf8' },
  instagram: { label: 'Instagram',        color: '#a78bfa' },
  tiktok:    { label: 'TikTok',           color: '#34d399' },
  franchise: { label: 'Franchise Bulk',   color: '#fb7185' },
  sales:     { label: 'Walk-in / Sales',  color: '#81c784' },
};
const FALLBACK_COLOR = '#5c6280';

// ─── Revenue Chart (Line Graph) ───
export function RevenueChart({ orders }: { orders: any[] }) {
  const chartRef = useRef<ChartJS<"line">>(null);
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(6);
  const { showToast } = useToast();

  const { labels, dataThis } = React.useMemo(() => {
    const now = new Date();
    const buckets: { label: string; value: number }[] = [];
    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString('en-GB', { month: 'short' }),
        value: 0,
      });
    }
    const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
    activeOrders.forEach(o => {
      const created = new Date(o.created_at);
      const monthsAgo = (now.getFullYear() - created.getFullYear()) * 12
                       + (now.getMonth() - created.getMonth());
      if (monthsAgo >= 0 && monthsAgo < rangeMonths) {
        buckets[rangeMonths - 1 - monthsAgo].value += Number(o.total || 0);
      }
    });
    return {
      labels: buckets.map(b => b.label),
      dataThis: buckets.map(b => b.value)
    };
  }, [orders, rangeMonths]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(240,160,48,0.35)");
    gradient.addColorStop(1, "rgba(240,160,48,0.02)");
    chart.data.datasets[0].backgroundColor = gradient;
    chart.update("none");
  }, [rangeMonths]);

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.15s" }}>
      <div className="flex items-center justify-between mb-4 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold text-[var(--fg)]">Revenue Overview</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Revenue in ETB</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] mr-3">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent)]" />Current</span>
          </div>
          <div className="flex gap-0.5 bg-[var(--bg-deep)] rounded-lg p-0.5 border border-[var(--border)]">
            <button className={`tab-btn ${rangeMonths === 6 ? "active" : ""}`} onClick={() => { setRangeMonths(6); showToast("Switched to 6M view", "info"); }}>6M</button>
            <button className={`tab-btn ${rangeMonths === 12 ? "active" : ""}`} onClick={() => { setRangeMonths(12); showToast("Switched to 12M view", "info"); }}>12M</button>
          </div>
        </div>
      </div>
      <div style={{ height: 260 }}>
        <Line
          key={rangeMonths}
          ref={chartRef}
          data={{
            labels,
            datasets: [
              {
                label: "Revenue",
                data: dataThis,
                fill: true,
                backgroundColor: "rgba(240,160,48,0.15)",
                borderColor: "#f0a030",
                borderWidth: 2.5,
                pointBackgroundColor: "#f0a030",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,
              },
            ],
          }}
          options={{
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString()} ETB` } } },
            scales: {
              y: { beginAtZero: true, grid: { color: "rgba(30,34,51,0.5)" }, ticks: { callback: (v: any) => `${(Number(v) / 1000).toFixed(0)}k` }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ─── Sales Distribution ───
export function SalesDistribution({ orders }: { orders: any[] }) {
  const { entries, total, labels, data, colors } = React.useMemo(() => {
    const activeOrdersForSource = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
    const totalRevenue = activeOrdersForSource.reduce((s, o) => s + Number(o.total || 0), 0);

    const sourceMap: Record<string, number> = {};
    activeOrdersForSource.forEach(o => {
      const src = (o.source || 'unknown').toLowerCase();
      sourceMap[src] = (sourceMap[src] || 0) + Number(o.total || 0);
    });

    const sourceEntries = Object.entries(sourceMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
        entries: sourceEntries,
        total: totalRevenue,
        labels: sourceEntries.map(e => SOURCE_MAP[e[0]]?.label || e[0]),
        data: sourceEntries.map(e => e[1]),
        colors: sourceEntries.map(e => SOURCE_MAP[e[0]]?.color || FALLBACK_COLOR)
    };
  }, [orders]);

  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart: ChartJS) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f0f2f8";
      ctx.font = "bold 18px 'Inter', sans-serif";
      
      const topPct = total > 0 && data.length > 0 ? ((data[0] / total) * 100).toFixed(1) : "0";

      ctx.fillText(`${topPct}%`, width / 2, height / 2 - 6);
      ctx.fillStyle = "#5c6280";
      ctx.font = "500 10px 'Inter', sans-serif";
      
      const topLabel = labels.length > 0 ? labels[0].toUpperCase() : "NONE";
      ctx.fillText(topLabel.length > 10 ? topLabel.substring(0,8) + ".." : topLabel, width / 2, height / 2 + 12);
      ctx.restore();
    },
  };

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.2s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold text-[var(--fg)]">Sales Distribution</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">By sales channel</p>
      </div>
      <div className="flex justify-center" style={{ height: 200 }}>
        {total > 0 ? (
            <Doughnut
            data={{
                labels,
                datasets: [{ data, backgroundColor: colors, borderColor: "#13161f", borderWidth: 3, hoverOffset: 8 }],
            }}
            plugins={[centerTextPlugin]}
            options={{ responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.parsed?.toLocaleString()} ETB` } } } }}
            />
        ) : (
            <div className="flex items-center justify-center h-full text-[var(--muted)] text-sm">No data</div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 mt-4">
        {entries.slice(0, 3).map(([src, val]) => {
          const entry = SOURCE_MAP[src] || { label: src, color: FALLBACK_COLOR };
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
          return (
          <div key={src} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
            <span className="text-[11px] text-[var(--muted)] truncate">{entry.label}</span>
            <span className="text-[11px] font-bold ml-auto text-[var(--fg)]">{pct}%</span>
          </div>
        )})}
      </div>
    </div>
  );
}

// ─── Top Products ───
export function TopProducts({ orders }: { orders: any[] }) {
  const COLORS = ['#f0a030', '#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#facc15', '#818cf8'];

  const productData = React.useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
    const productMap: Record<string, { qty: number; revenue: number }> = {};

    activeOrders.forEach(o => {
      let items: any[] = [];
      if (typeof o.items === 'string') {
        try { items = JSON.parse(o.items); } catch { items = []; }
      } else if (Array.isArray(o.items)) {
        items = o.items;
      }

      items.forEach((item: any) => {
        const name = item.name || item.item_name || 'Unknown';
        const qty = Number(item.quantity || item.qty || 1);
        const price = Number(item.unit_price || item.price || 0);
        if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
        productMap[name].qty += qty;
        productMap[name].revenue += qty * price;
      });
    });

    return Object.entries(productMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [orders]);

  const maxQty = productData.length > 0 ? Math.max(...productData.map(p => p.qty)) : 1;

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.25s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold text-[var(--fg)]">Top Products</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Most ordered items</p>
      </div>

      {productData.length > 0 ? (
        <div className="space-y-3 relative z-[2]">
          {productData.map((product, i) => (
            <div key={product.name} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-[var(--fg)] truncate max-w-[60%]">{product.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[var(--muted)] font-mono">{product.qty} sold</span>
                  <span className="text-[10px] font-bold text-[var(--accent)] font-mono">{product.revenue.toLocaleString()} ETB</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${Math.max((product.qty / maxQty) * 100, 4)}%`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-[200px] text-[var(--muted)] text-sm relative z-[2]">No product data</div>
      )}

      {/* Summary */}
      <div className="mt-auto pt-4 border-t border-[var(--border)] grid grid-cols-2 gap-3 relative z-[2]">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">{productData.length}</p>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">Products</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--fg)]">{productData.reduce((s, p) => s + p.qty, 0)}</p>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">Total Sold</p>
        </div>
      </div>
    </div>
  );
}
