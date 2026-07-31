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
export function RevenueChart({ orders, expenses = [] }: { orders: any[]; expenses?: any[] }) {
  const chartRef = useRef<ChartJS<"line">>(null);
  const [rangeMonths, setRangeMonths] = useState<1 | 3 | 6 | 12>(6);
  const { showToast } = useToast();

  const { labels, dataThis, dataProfit } = React.useMemo(() => {
    const now = new Date();
    const buckets: { label: string; revenue: number; expense: number; profit: number }[] = [];
    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString('en-GB', { month: 'short' }),
        revenue: 0,
        expense: 0,
        profit: 0,
      });
    }
    const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
    
    // Sum Revenue and COGS
    activeOrders.forEach(o => {
      const created = new Date(o.created_at);
      const monthsAgo = (now.getFullYear() - created.getFullYear()) * 12
                       + (now.getMonth() - created.getMonth());
      if (monthsAgo >= 0 && monthsAgo < rangeMonths) {
        buckets[rangeMonths - 1 - monthsAgo].revenue += Number(o.total || 0);
        
        let cogs = 0;
        let items: any[] = [];
        if (typeof o.items === 'string') {
          try { items = JSON.parse(o.items); } catch { items = []; }
        } else if (Array.isArray(o.items)) {
          items = o.items;
        }
        items.forEach((item: any) => {
          cogs += (Number(item.quantity || item.qty || 1) * Number(item.unit_cost || 0));
        });
        buckets[rangeMonths - 1 - monthsAgo].expense += cogs; // We treat COGS as an expense for the profit calculation
      }
    });

    // Sum Operating Expenses
    expenses.forEach(e => {
      if (e.voided_at) return;
      if (e.category === 'vendor_purchase') return; // Vendor purchases are handled via COGS when items are sold
      
      const created = new Date(e.created_at);
      const monthsAgo = (now.getFullYear() - created.getFullYear()) * 12
                       + (now.getMonth() - created.getMonth());
      if (monthsAgo >= 0 && monthsAgo < rangeMonths) {
        buckets[rangeMonths - 1 - monthsAgo].expense += Number(e.amount || 0);
      }
    });

    // Calculate Profit
    buckets.forEach(b => {
      b.profit = b.revenue - b.expense;
    });

    return {
      labels: buckets.map(b => b.label),
      dataThis: buckets.map(b => b.revenue),
      dataProfit: buckets.map(b => b.profit)
    };
  }, [orders, expenses, rangeMonths]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(240,160,48,0.35)");
    gradient.addColorStop(1, "rgba(240,160,48,0.02)");
    chart.data.datasets[1].backgroundColor = gradient;
    chart.update("none");
  }, [rangeMonths]);

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.15s" }}>
      <div className="flex items-center justify-between mb-4 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold text-[var(--fg)]">Revenue & Profit Overview</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Revenue and Profit in ETB</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] mr-3">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f0a030]" />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#34d399]" />Profit</span>
          </div>
          <div className="flex gap-0.5 bg-[var(--bg-deep)] rounded-lg p-0.5 border border-[var(--border)]">
            <button className={`tab-btn ${rangeMonths === 1 ? "active" : ""}`} onClick={() => { setRangeMonths(1); showToast("Switched to 1M view", "info"); }}>1M</button>
            <button className={`tab-btn ${rangeMonths === 3 ? "active" : ""}`} onClick={() => { setRangeMonths(3); showToast("Switched to 3M view", "info"); }}>3M</button>
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
                label: "Profit",
                data: dataProfit,
                fill: false,
                backgroundColor: "rgba(52,211,153,0.15)",
                borderColor: "#34d399",
                borderWidth: 2.5,
                pointBackgroundColor: "#34d399",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,
              },
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

// ─── Top Products (Line Chart) ───
export function TopProducts({ orders }: { orders: any[] }) {
  const COLORS = ['#38bdf8', '#f0a030', '#fb7185', '#a78bfa', '#34d399', '#facc15'];
  const [rangeMonths, setRangeMonths] = useState<1 | 3 | 6 | 12>(6);
  const { showToast } = useToast();

  const chartData = React.useMemo(() => {
    const now = new Date();
    const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
    
    // 1. Find the top 4 products all-time (or within range, let's do all-time for stability)
    const productMap: Record<string, number> = {};
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
        productMap[name] = (productMap[name] || 0) + qty;
      });
    });

    const topProducts = Object.entries(productMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(e => e[0]);

    // 2. Setup buckets
    const labels: string[] = [];
    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString('en-GB', { month: 'short' }));
    }

    const datasetsData: Record<string, number[]> = {};
    topProducts.forEach(p => datasetsData[p] = new Array(rangeMonths).fill(0));

    // 3. Fill buckets
    activeOrders.forEach(o => {
      const created = new Date(o.created_at);
      const monthsAgo = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
      if (monthsAgo >= 0 && monthsAgo < rangeMonths) {
        let items: any[] = [];
        if (typeof o.items === 'string') {
          try { items = JSON.parse(o.items); } catch { items = []; }
        } else if (Array.isArray(o.items)) {
          items = o.items;
        }
        items.forEach((item: any) => {
          const name = item.name || item.item_name || 'Unknown';
          if (topProducts.includes(name)) {
            const qty = Number(item.quantity || item.qty || 1);
            datasetsData[name][rangeMonths - 1 - monthsAgo] += qty;
          }
        });
      }
    });

    // 4. Format datasets
    const datasets = topProducts.map((p, i) => ({
      label: p,
      data: datasetsData[p],
      fill: false,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length],
      borderWidth: 2.5,
      pointBackgroundColor: COLORS[i % COLORS.length],
      pointBorderColor: "#fff",
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.4,
    }));

    return { labels, datasets };
  }, [orders, rangeMonths]);

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.25s" }}>
      <div className="flex items-center justify-between mb-4 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold text-[var(--fg)]">Top Products Sales Trend</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Quantity sold over time</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-0.5 bg-[var(--bg-deep)] rounded-lg p-0.5 border border-[var(--border)] hidden sm:flex">
            <button className={`tab-btn ${rangeMonths === 3 ? "active" : ""}`} onClick={() => { setRangeMonths(3); showToast("Switched to 3M view", "info"); }}>3M</button>
            <button className={`tab-btn ${rangeMonths === 6 ? "active" : ""}`} onClick={() => { setRangeMonths(6); showToast("Switched to 6M view", "info"); }}>6M</button>
            <button className={`tab-btn ${rangeMonths === 12 ? "active" : ""}`} onClick={() => { setRangeMonths(12); showToast("Switched to 12M view", "info"); }}>12M</button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {chartData.datasets.map((ds, i) => (
          <div key={ds.label} className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="truncate max-w-[100px]" title={ds.label}>{ds.label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 220 }}>
        {chartData.datasets.length > 0 ? (
          <Line
            key={rangeMonths}
            data={chartData}
            options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y} sold` } }, legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "rgba(30,34,51,0.5)" }, border: { display: false } },
                x: { grid: { display: false }, border: { display: false } },
              },
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted)] text-sm">No product data</div>
        )}
      </div>
    </div>
  );
}
