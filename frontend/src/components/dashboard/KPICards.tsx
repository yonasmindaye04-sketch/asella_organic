/**
 * src/components/dashboard/KPICards.tsx
 * Asella Organic — Dashboard KPI Cards
 *
 * Fixes:
 *   - Field name: `total` (not `total_amount`) — matches MySQL column
 *   - Pending filter: `o.status === 'Pending'` (capital P, matches DB enum)
 *   - Falls back to dummy data only when API truly fails, not when empty
 */

import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

const KPICards: React.FC = () => {
  const [orders, setOrders]     = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [ordRes, prodRes] = await Promise.all([
          api.get<any[]>('/api/orders?limit=2000'),
          api.get<any[]>('/api/products?limit=500'),
        ]);
        setOrders(ordRes.success && ordRes.data?.length ? ordRes.data : []);
        setProducts(prodRes.success && prodRes.data?.length ? prodRes.data : []);
      } catch {
        // On error, show empty state (no fallback dummy data)
        setOrders([]);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Use `total` — the actual MySQL column name returned by the API
  const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
  const totalRevenue  = activeOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalOrders   = activeOrders.length;
  const avgValue      = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  // DB stores 'Pending' with capital P
  const pendingOrders = activeOrders.filter(o => o.status === 'Pending').length;
  const totalProducts = products.length;

  const cards = [
    {
      label: 'Total Orders',
      value: loading ? '…' : totalOrders.toLocaleString(),
      sub: 'All time',
      icon: 'receipt_long',
    },
    {
      label: 'Total Revenue',
      value: loading ? '…' : `${totalRevenue.toLocaleString()} ETB`,
      sub: 'Lifetime',
      icon: 'payments',
    },
    {
      label: 'Avg. Order Value',
      value: loading ? '…' : `${avgValue.toLocaleString()} ETB`,
      sub: 'Per order',
      icon: 'trending_up',
    },
    {
      label: 'Pending Orders',
      value: loading ? '…' : pendingOrders.toLocaleString(),
      sub: 'Awaiting action',
      icon: 'pending_actions',
    },
    {
      label: 'Products Listed',
      value: loading ? '…' : totalProducts.toLocaleString(),
      sub: 'In catalog',
      icon: 'inventory_2',
    },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="surface-panel flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-on-surface-variant font-medium">{c.label}</span>
            <span className="material-symbols-outlined text-[20px] text-primary opacity-60">
              {c.icon}
            </span>
          </div>
          <div className="text-2xl font-extrabold text-on-surface font-data-mono mt-1">
            {c.value}
          </div>
          <div className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
            <span className="material-symbols-outlined text-[13px] text-primary">arrow_upward</span>
            {c.sub}
          </div>
        </div>
      ))}
    </section>
  );
};

export default KPICards;
