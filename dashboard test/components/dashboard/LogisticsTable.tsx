"use client";

import React, { useState } from "react";

interface Order {
  id: string;
  customer: string;
  product: string;
  amount: string;
  date: string;
  status: "Delivered" | "In Transit" | "Pending" | "Cancelled";
  avatar: string;
}

const orders: Order[] = [
  { id: "ORD-2089", customer: "Abebe Kebede", product: "Wireless Earbuds Pro", amount: "2,450 ETB", date: "Jun 18, 2026", status: "Delivered", avatar: "abebe-k" },
  { id: "ORD-2088", customer: "Tigist Hailu", product: "Smart Watch X200", amount: "4,800 ETB", date: "Jun 17, 2026", status: "In Transit", avatar: "tigist-h" },
  { id: "ORD-2087", customer: "Dawit Amare", product: "Bluetooth Speaker", amount: "1,350 ETB", date: "Jun 17, 2026", status: "Delivered", avatar: "dawit-a" },
  { id: "ORD-2086", customer: "Helen Tadesse", product: "USB-C Hub Adapter", amount: "890 ETB", date: "Jun 16, 2026", status: "Pending", avatar: "helen-t" },
  { id: "ORD-2085", customer: "Yohannes Girma", product: "Laptop Stand Aluminum", amount: "1,780 ETB", date: "Jun 16, 2026", status: "Delivered", avatar: "yohannes-g" },
  { id: "ORD-2084", customer: "Sara Mohammed", product: "Mechanical Keyboard", amount: "3,200 ETB", date: "Jun 15, 2026", status: "Cancelled", avatar: "sara-m" },
  { id: "ORD-2083", customer: "Natnael Assefa", product: "Webcam HD 1080p", amount: "1,650 ETB", date: "Jun 15, 2026", status: "In Transit", avatar: "natnael-a" },
  { id: "ORD-2082", customer: "Meron Dereje", product: "Wireless Mouse", amount: "650 ETB", date: "Jun 14, 2026", status: "Delivered", avatar: "meron-d" },
];

const statusMap: Record<string, { cls: string; dot: string }> = {
  Delivered: { cls: "badge-delivered", dot: "bg-[var(--emerald)]" },
  "In Transit": { cls: "badge-transit", dot: "bg-[var(--sky)]" },
  Pending: { cls: "badge-pending", dot: "bg-[var(--accent)]" },
  Cancelled: { cls: "badge-cancelled", dot: "bg-[var(--rose)]" },
};

type StatusFilter = "All" | "Delivered" | "In Transit" | "Pending" | "Cancelled";

export default function LogisticsTable() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");

  const filtered = orders.filter((o) => {
    const matchStatus = filter === "All" || o.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.product.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const filters: StatusFilter[] = ["All", "Delivered", "In Transit", "Pending", "Cancelled"];

  return (
    <div className="card animate-in h-full" style={{ animationDelay: "0.35s" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 pb-0 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold">Logistics History</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{filtered.length} of {orders.length} orders</p>
        </div>
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[9px]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter orders..." className="bg-[rgba(255,255,255,0.03)] border border-[var(--border)] rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-[var(--fg)] outline-none focus:border-[rgba(240,160,48,0.3)] transition-colors w-[160px]" aria-label="Filter orders" />
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
              <th>Product</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => {
              const st = statusMap[order.status];
              return (
                <tr key={order.id}>
                  <td><span className="font-semibold text-[var(--fg)]">#{order.id}</span></td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <img src={`https://picsum.photos/seed/${order.avatar}/64/64.jpg`} alt={order.customer} className="w-7 h-7 rounded-lg object-cover border border-[var(--border)]" />
                      <span className="font-medium text-[var(--fg)]">{order.customer}</span>
                    </div>
                  </td>
                  <td className="max-w-[150px] truncate">{order.product}</td>
                  <td className="font-semibold text-[var(--fg)]">{order.amount}</td>
                  <td>{order.date}</td>
                  <td><span className={`badge ${st.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{order.status}</span></td>
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