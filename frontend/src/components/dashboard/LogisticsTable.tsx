import { useState } from "react";

interface Order {
  id: string;
  customer_name: string;
  source: string;
  status: string;
  created_at: string;
  total: number;
}

interface Props {
  orders: Order[];
}

const statusMap: Record<string, { cls: string; dot: string }> = {
  Delivered: { cls: "badge-delivered", dot: "bg-[var(--emerald)]" },
  DELIVERED: { cls: "badge-delivered", dot: "bg-[var(--emerald)]" },
  "In Transit": { cls: "badge-transit", dot: "bg-[var(--sky)]" },
  Pending: { cls: "badge-pending", dot: "bg-[var(--accent)]" },
  PENDING: { cls: "badge-pending", dot: "bg-[var(--accent)]" },
  Cancelled: { cls: "badge-cancelled", dot: "bg-[var(--rose)]" },
  CANCELLED: { cls: "badge-cancelled", dot: "bg-[var(--rose)]" },
};

type StatusFilter = "All" | "Delivered" | "In Transit" | "Pending" | "Cancelled";

export default function LogisticsTable({ orders }: Props) {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");

  const filtered = orders.filter((o) => {
    // Map API status to filter status
    let status = o.status;
    if (status === "DELIVERED") status = "Delivered";
    if (status === "PENDING") status = "Pending";
    if (status === "CANCELLED") status = "Cancelled";

    const matchStatus = filter === "All" || status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || o.id.toString().toLowerCase().includes(q) || (o.customer_name && o.customer_name.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50);

  const filters: StatusFilter[] = ["All", "Delivered", "In Transit", "Pending", "Cancelled"];

  return (
    <div className="card animate-in h-full" style={{ animationDelay: "0.35s" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 pb-0 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold">Logistics History</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{filtered.length} of {orders.length} total orders</p>
        </div>
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[9px]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter orders..." className="search-input" aria-label="Filter orders" />
        </div>
      </div>
      <div className="flex gap-1 px-5 pt-3 pb-1 overflow-x-auto relative z-[2]">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${filter === f ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--fg-secondary)] hover:bg-[rgba(255,255,255,0.02)]"}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto mt-2">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Source</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => {
              let displayStatus = order.status;
              if (displayStatus === "DELIVERED") displayStatus = "Delivered";
              if (displayStatus === "PENDING") displayStatus = "Pending";
              if (displayStatus === "CANCELLED") displayStatus = "Cancelled";
              
              const st = statusMap[displayStatus] || { cls: "badge-pending", dot: "bg-[var(--accent)]" };
              
              return (
                <tr key={order.id}>
                  <td><span className="font-semibold text-[var(--fg)]">#{order.id.toString().substring(0, 8)}</span></td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-deep)] border border-[var(--border)] flex items-center justify-center text-[var(--fg-secondary)]">
                        <i className="fa-solid fa-user text-[10px]" />
                      </div>
                      <span className="font-medium text-[var(--fg)]">{order.customer_name}</span>
                    </div>
                  </td>
                  <td className="capitalize">{order.source}</td>
                  <td className="font-semibold text-[var(--fg)]">{Number(order.total || 0).toLocaleString()} ETB</td>
                  <td>{new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td><span className={`badge ${st.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{displayStatus}</span></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[var(--muted)] text-xs">No orders match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
