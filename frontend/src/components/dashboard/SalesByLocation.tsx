import React from 'react';

const barColors = ['bg-primary-container', 'bg-secondary', 'bg-primary-fixed-dim', 'bg-tertiary'];

interface Props {
  orders: any[];
}

const SalesByLocation: React.FC<Props> = ({ orders }) => {
  const total = orders.length;
  const map: Record<string, number> = {};
  orders.forEach((o) => {
    const city = o.city || 'Unknown';
    map[city] = (map[city] || 0) + 1;
  });
  const cityData = Object.entries(map)
    .map(([city, count]) => ({ city, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return (
    <div className="surface-panel flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-on-surface font-headline-md">Sales by Location</h3>
        <button className="text-primary text-sm hover:underline font-data-mono hover:text-primary-fixed-dim transition-colors">View Map</button>
      </div>
      <div className="space-y-5 flex-1 font-data-mono">
        {cityData.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">No order data yet</p>
        ) : cityData.map((c, i) => (
          <div key={c.city} className="group cursor-pointer hover:bg-surface-variant p-2 -mx-2 rounded-lg transition-colors">
            <div className="flex justify-between items-end mb-2">
              <h4 className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">{c.city}</h4>
              <span className="text-sm font-bold text-on-surface">{c.pct}%</span>
            </div>
            <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
              <div className={`${barColors[i % barColors.length]} h-full rounded-full transition-all duration-1000`} style={{ width: `${c.pct}%` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesByLocation;
