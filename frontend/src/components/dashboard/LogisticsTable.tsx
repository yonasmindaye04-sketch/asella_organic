import React from 'react';

interface Order {
  id: string;
  customer_name: string;
  source: string;
  created_at: string;
  total_amount: number;
}

interface Props {
  orders: Order[];
}

const LogisticsTable: React.FC<Props> = ({ orders }) => {
  const sortedOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const sourceIcon = (src: string) => {
    if (src === 'website') return 'language';
    if (src === 'franchise') return 'storefront';
    return 'local_shipping';
  };

  return (
    <div className="surface-panel lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-on-surface font-headline-md">Logistics History</h3>
        <div className="flex gap-4 text-sm font-data-mono">
          <button className="text-primary font-medium border-b-2 border-primary pb-1 transition-colors hover:text-primary-fixed-dim">Recent</button>
          <button className="text-on-surface-variant hover:text-on-surface pb-1 transition-colors">Oldest</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-on-surface font-data-mono">
          <thead className="text-xs text-on-surface-variant uppercase bg-surface">
            <tr>
              <th className="px-4 py-3 font-medium rounded-l-lg border-b border-outline-variant" scope="col">Order ID / Customer</th>
              <th className="px-4 py-3 font-medium border-b border-outline-variant" scope="col">Source</th>
              <th className="px-4 py-3 font-medium border-b border-outline-variant" scope="col">Date</th>
              <th className="px-4 py-3 font-medium text-right rounded-r-lg border-b border-outline-variant" scope="col">Amount (ETB)</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">No orders yet</td></tr>
            ) : sortedOrders.map((o, i) => (
              <tr key={o.id} className={`${i < sortedOrders.length - 1 ? 'border-b border-surface-container' : ''} table-row-hover transition-colors cursor-pointer`}>
                <td className="px-4 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface">
                    <span className="material-symbols-outlined text-sm">{sourceIcon(o.source)}</span>
                  </div>
                  <div>
                    <span className="font-medium block text-on-surface">#{o.id.substring(0, 8)}</span>
                    <span className="text-xs text-on-surface-variant">{o.customer_name}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-on-surface-variant capitalize">{o.source}</td>
                <td className="px-4 py-4 text-on-surface-variant">{new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td className="px-4 py-4 text-right font-medium text-on-surface">{Number(o.total_amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LogisticsTable;
