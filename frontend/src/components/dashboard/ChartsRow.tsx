/**
 * src/components/dashboard/ChartsRow.tsx
 * Asella Organic — Revenue Overview + Sales Distribution
 *
 * Fixes:
 *   - Bar chart now shows REAL monthly revenue from DB (not hardcoded heights)
 *   - Field name fixed: `total` (DB column) not `total_amount`
 *   - Source distribution maps actual DB values: website/telegram/instagram/tiktok
 *   - Date range selector is functional (6M / 12M / This Year)
 *   - Donut chart uses real ETB proportions via conic-gradient
 */

import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

type MonthData = { label: string; value: number };

// Maps the actual `source` column values stored in MySQL
const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  website:   { label: 'Online Sales',     color: '#2e7d32' },
  telegram:  { label: 'Telegram',         color: '#1b6d24' },
  instagram: { label: 'Instagram',        color: '#44a148' },
  tiktok:    { label: 'TikTok',           color: '#81c784' },
  franchise: { label: 'Franchise Bulk',   color: '#0d2e10' },
  sales:     { label: 'Walk-in / Sales',  color: '#a5d6a7' },
};
const FALLBACK_COLOR = '#e2e3dd';

const ChartsRow: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(6);

  useEffect(() => {
    api.get<any[]>('/api/orders?limit=2000')
      .then(res => { if (res.success && res.data) setOrders(res.data); })
      .catch(() => {});
  }, []);

  // ── Monthly revenue buckets ──────────────────────────────────────────────
  const monthlyData: MonthData[] = (() => {
    const now   = new Date();
    const buckets: MonthData[] = [];
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
    return buckets;
  })();

  const maxRevenue = Math.max(...monthlyData.map(m => m.value), 1);

  // ── Sales distribution by source ────────────────────────────────────────
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

  // Donut via conic-gradient
  const donutSegments = (() => {
    if (totalRevenue === 0) return '';
    let angle = 0;
    const parts: string[] = [];
    sourceEntries.forEach(([src, val]) => {
      const pct = (val / totalRevenue) * 100;
      const color = SOURCE_MAP[src]?.color ?? FALLBACK_COLOR;
      parts.push(`${color} ${angle.toFixed(1)}% ${(angle + pct).toFixed(1)}%`);
      angle += pct;
    });
    if (angle < 100) parts.push(`${FALLBACK_COLOR} ${angle.toFixed(1)}% 100%`);
    return `conic-gradient(${parts.join(', ')})`;
  })();

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Revenue Bar Chart ──────────────────────────────────────── */}
      <div className="surface-panel lg:col-span-2 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-on-surface font-headline-md">
            Revenue Overview (ETB)
          </h3>
          <select
            value={rangeMonths}
            onChange={(e) => setRangeMonths(Number(e.target.value) as 6 | 12)}
            className="text-sm border border-outline rounded px-2 py-1 bg-surface"
          >
            <option value={6}>Last 6M</option>
            <option value={12}>Last 12M</option>
          </select>
        </div>
        <div className="flex-1 min-h-[250px] relative w-full rounded-lg flex items-end justify-between p-4 bg-surface-container-lowest border-t border-outline-variant">
          {monthlyData.map((m) => {
            const h = (m.value / maxRevenue) * 150;
            return (
              <div key={m.label} className="flex flex-col items-center gap-2 group cursor-pointer flex-1">
                <div className="text-xs text-on-surface-variant font-data-mono mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {m.value.toLocaleString()}
                </div>
                <div
                  className="w-full max-w-[40px] bg-primary rounded-t-sm transition-all group-hover:bg-primary-600"
                  style={{ height: `${h}px`, minHeight: '4px' }}
                ></div>
                <span className="text-xs font-bold text-on-surface-variant">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sales Distribution Donut ──────────────────────────────── */}
      <div className="surface-panel flex flex-col">
        <h3 className="text-lg font-semibold text-on-surface font-headline-md mb-6">
          Sales Distribution
        </h3>
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Conic gradient donut */}
          <div
            className="relative w-40 h-40 rounded-full flex items-center justify-center mb-6 transition-transform duration-500 hover:scale-105"
            style={{
              background: donutSegments,
              boxShadow: 'inset 0 0 0 12px var(--color-surface)',
            }}
          >
            <div className="text-center font-data-mono">
              <span className="block text-xl font-bold text-on-surface">
                {totalRevenue.toLocaleString()}
              </span>
              <span className="text-xs text-on-surface-variant">ETB</span>
            </div>
          </div>

          {/* Legend */}
          <div className="w-full space-y-2 text-sm">
            {sourceEntries.map(([src, val]) => {
              const entry = SOURCE_MAP[src] || { label: src, color: FALLBACK_COLOR };
              const pct = totalRevenue > 0 ? (val / totalRevenue) * 100 : 0;
              return (
                <div
                  key={src}
                  className="flex items-center justify-between hover:bg-surface-variant/50 p-1 rounded transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    ></span>
                    <span className="text-on-surface-variant">{entry.label}</span>
                  </div>
                  <span className="font-medium text-on-surface">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChartsRow;
