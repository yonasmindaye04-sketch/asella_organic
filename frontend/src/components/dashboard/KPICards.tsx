/**
 * src/components/dashboard/KPICards.tsx
 * Asella Organic -- KPI cards using real data
 * Uses both /api/orders and /api/products endpoints. No hardcoded metrics.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

interface KPIConfig {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: string;
  color: string;
  colorDim: string;
  subtitle: string;
}

function AnimatedNumber({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    // Bypass animation in test environments for stability and speed
    if (import.meta.env?.MODE === 'test') {
      setDisplay(target);
      return;
    }

    const duration = 1400;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.max(0, Math.min(elapsed / duration, 1));
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target]);

  const formatted = target >= 1000 ? display.toLocaleString() : display.toString();
  return <span className="font-bold tabular-nums">{prefix}{formatted}{suffix}</span>;
}

function KPICard({ kpi, index }: { kpi: KPIConfig; index: number }) {
  return (
    <div
      className="card p-4 animate-in h-full flex flex-col justify-center"
      style={{ animationDelay: `${0.06 * index}s` }}
    >
      <div className="flex items-center gap-2 mb-2 relative z-[2]">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 hover:scale-110" 
          style={{ background: kpi.colorDim, color: kpi.color }}
        >
          <i className={`${kpi.icon} text-[12px]`} />
        </div>
        <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide">
          {kpi.label}
        </span>
      </div>
      <p className="text-2xl font-extrabold text-[var(--fg)] relative z-[2]">
        {kpi.value === -1 ? (
          <span className="font-bold tabular-nums">...</span>
        ) : (
          <AnimatedNumber target={kpi.value} prefix={kpi.prefix} suffix={kpi.suffix} />
        )}
      </p>
    </div>
  );
}

export default function KPICards() {
  const [data, setData] = useState({ revenue: 0, expenses: 0, netProfit: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKPIs = async () => {
      setLoading(true);
      try {
        const [ordRes, expRes] = await Promise.all([
          api.get<any[]>('/api/orders?limit=1000'),
          api.get<any>('/api/expenses/summary')
        ]);
        
        let rev = 0;
        let exp = 0;
        let ordCount = 0;

        const getOrderTotal = (o: any) => {
          let items = [];
          if (typeof o.items === 'string') {
            try { items = JSON.parse(o.items); } catch { items = []; }
          } else if (Array.isArray(o.items)) {
            items = o.items;
          }
          const itemsTotal = items.reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty || 1) * Number(item.unit_price || item.price || 0)), 0);
          return Number(o.total) || itemsTotal;
        };

        if (ordRes.success && ordRes.data) {
          const validOrders = ordRes.data.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
          ordCount = validOrders.length;
          rev = validOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
        }

        if (expRes.success && expRes.data) {
          exp = Number(expRes.data.total_expenses || 0);
        }

        setData({ 
          revenue: rev, 
          expenses: exp, 
          netProfit: rev - exp, 
          orders: ordCount 
        });
      } catch {
        // gracefully fail
      } finally {
        setLoading(false);
      }
    };
    fetchKPIs();
  }, []);

  const kpis: KPIConfig[] = [
    { label: "Total Revenue", value: loading ? -1 : data.revenue, suffix: " ETB", subtitle: "Lifetime sales", icon: "fa-solid fa-money-bill-wave", color: "var(--emerald)", colorDim: "var(--emerald-dim)" },
    { label: "Total Expenses", value: loading ? -1 : data.expenses, suffix: " ETB", subtitle: "All recorded expenses", icon: "fa-solid fa-money-bill-transfer", color: "var(--rose)", colorDim: "var(--rose-dim)" },
    { label: "Net Profit", value: loading ? -1 : data.netProfit, suffix: " ETB", subtitle: "Revenue minus expenses", icon: "fa-solid fa-piggy-bank", color: "var(--accent)", colorDim: "var(--accent-dim)" },
    { label: "Total Orders", value: loading ? -1 : data.orders, subtitle: "Excluding cancelled", icon: "fa-solid fa-cart-shopping", color: "var(--sky)", colorDim: "var(--sky-dim)" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => (
        <KPICard key={kpi.label} kpi={kpi} index={i} />
      ))}
    </div>
  );
}
