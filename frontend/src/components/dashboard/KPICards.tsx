/**
 * src/components/dashboard/KPICards.tsx
 * Asella Organic -- KPI cards using real data
 * Uses both /api/orders and /api/products endpoints. No hardcoded metrics.
 */

import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../../services/api';
import type { RootState } from '../../store';

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
      <div className="flex items-center gap-2.5 mb-2 relative z-[2]">
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 hover:scale-110 shadow-sm" 
          style={{ background: kpi.color, color: 'white' }}
        >
          <span className="material-symbols-outlined text-[16px]">{kpi.icon}</span>
        </div>
        <span className="text-[11px] font-extrabold text-[var(--accent)] uppercase tracking-wider">
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

interface KPICardsProps {
  from?: string;
  to?: string;
}

export default function KPICards({ from, to }: KPICardsProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const isStaff = user?.role === 'staff' || user?.role === 'employee' || user?.role === 'delivery' || user?.role === 'driver';

  const [data, setData] = useState({ revenue: 0, expenses: 0, netProfit: 0, orders: 0, pendingOrders: 0, completedOrders: 0, processingOrders: 0, inventoryValue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKPIs = async () => {
      setLoading(true);
      try {
        let queryParams = '?limit=1000';
        let expenseParams = '';
        if (from && to) {
          queryParams += `&from=${from}&to=${to}`;
          expenseParams = `?from=${from}&to=${to}`;
        }
        
        const [ordRes, expRes, stockRes] = await Promise.all([
          api.get<any[]>(`/api/orders${queryParams}`),
          api.get<any>(`/api/expenses/summary${expenseParams}`),
          api.get<any>(`/api/stock/summary`)
        ]);
        
        let rev = 0;
        let exp = 0;
        let cogs = 0;
        let ordCount = 0;
        let pending = 0;
        let completed = 0;
        let processing = 0;
        let invVal = 0;

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

        const getOrderCOGS = (o: any) => {
          let items = [];
          if (typeof o.items === 'string') {
            try { items = JSON.parse(o.items); } catch { items = []; }
          } else if (Array.isArray(o.items)) {
            items = o.items;
          }
          return items.reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty || 1) * Number(item.unit_cost || 0)), 0);
        };

        if (ordRes.success && ordRes.data) {
          const validOrders = ordRes.data.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
          ordCount = validOrders.length;
          pending = validOrders.filter(o => o.status === 'Pending').length;
          completed = validOrders.filter(o => o.status === 'Completed' || o.status === 'Delivered').length;
          processing = validOrders.filter(o => o.status === 'Processing' || o.status === 'In Transit' || o.status === 'Packed').length;
          rev = validOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
          cogs = validOrders.reduce((sum, o) => sum + getOrderCOGS(o), 0);
        }

        if (expRes.success && expRes.data) {
          exp = Number(expRes.data.total_expenses || 0);
        }

        if (stockRes.success && stockRes.data) {
          invVal = Number(stockRes.data.total_stock_value || 0);
        }

        setData({ 
          revenue: rev, 
          expenses: exp, 
          netProfit: rev - exp - cogs, 
          orders: ordCount,
          pendingOrders: pending,
          completedOrders: completed,
          processingOrders: processing,
          inventoryValue: invVal
        });
      } catch {
        // gracefully fail
      } finally {
        setLoading(false);
      }
    };
    fetchKPIs();
  }, [user?.role, from, to]);

  const adminKpis: KPIConfig[] = [
    { label: "Total Revenue", value: loading ? -1 : data.revenue, suffix: " ETB", subtitle: "Lifetime sales", icon: "payments", color: "var(--emerald)", colorDim: "var(--emerald-dim)" },
    { label: "Total Expenses", value: loading ? -1 : data.expenses, suffix: " ETB", subtitle: "All recorded expenses", icon: "currency_exchange", color: "var(--rose)", colorDim: "var(--rose-dim)" },
    { label: "Net Profit", value: loading ? -1 : data.netProfit, suffix: " ETB", subtitle: "Revenue minus expenses", icon: "savings", color: "var(--amber)", colorDim: "var(--amber-dim)" },
    { label: "Inventory Value", value: loading ? -1 : data.inventoryValue, suffix: " ETB", subtitle: "Value at cost", icon: "inventory_2", color: "var(--sky)", colorDim: "var(--sky-dim)" },
  ];

  const staffKpis: KPIConfig[] = [
    { label: "Total Orders", value: loading ? -1 : data.orders, subtitle: "Excluding cancelled", icon: "shopping_cart", color: "var(--sky)", colorDim: "var(--sky-dim)" },
    { label: "Pending Orders", value: loading ? -1 : data.pendingOrders, subtitle: "Awaiting action", icon: "schedule", color: "var(--amber)", colorDim: "var(--amber-dim)" },
    { label: "In Progress", value: loading ? -1 : data.processingOrders, subtitle: "Packed or in transit", icon: "local_shipping", color: "var(--accent)", colorDim: "var(--accent-dim)" },
    { label: "Completed Orders", value: loading ? -1 : data.completedOrders, subtitle: "Successfully delivered", icon: "check_circle", color: "var(--emerald)", colorDim: "var(--emerald-dim)" },
  ];

  const kpis = isStaff ? staffKpis : adminKpis;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => (
        <KPICard key={kpi.label} kpi={kpi} index={i} />
      ))}
    </div>
  );
}
