/**
 * src/components/dashboard/inventory/StockOverviewTable.tsx
 * Asella Organic — Stock Overview Table
 *
 * Fix: All dark-slate colors replaced with site green palette.
 *      bg-slate-* → bg-[#f7faf7] / white
 *      text-slate-* → text-[#112415] / text-[#4a6741]
 *      border-slate-* → border-[#c8dfc4]
 */

import React, { useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../../store";
import type { StockItem, StockStatus } from "../../../store/slices/stockSlice";

interface Props {
  onAdjust:       (productId: string) => void;
  onFilterChange: (f: { search?: string; status?: StockStatus | "" }) => void;
}

const STATUS_CONFIG: Record<StockStatus, { label: string; bg: string; text: string; dot: string }> = {
  ok:           { label: "OK",           bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  low:          { label: "Low Stock",    bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
  critical:     { label: "Critical",     bg: "#ffedd5", text: "#9a3412", dot: "#f97316" },
  out_of_stock: { label: "Out of Stock", bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

const MOVEMENT_LABEL: Record<string, string> = {
  sale:              "↓ Sale",
  purchase_received: "↑ Received",
  adjustment:        "⟳ Adjusted",
  return:            "↑ Return",
  damage_loss:       "↓ Loss",
  initial_stock:     "↑ Init",
};

const StockOverviewTable: React.FC<Props> = ({ onAdjust, onFilterChange }) => {
  const { items, itemsLoading, itemsFilter } =
    useSelector((s: RootState) => s.stock);

  const [searchInput, setSearchInput] = useState(itemsFilter.search);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ search: searchInput });
  };

  const handleStatusFilter = (status: StockStatus | "") => {
    onFilterChange({ status });
  };

  const statusFilters: { value: StockStatus | ""; label: string }[] = [
    { value: "",             label: "All" },
    { value: "ok",           label: "OK" },
    { value: "low",          label: "Low" },
    { value: "critical",     label: "Critical" },
    { value: "out_of_stock", label: "Out" },
  ];

  return (
    <div className="bg-white border border-[#c8dfc4] rounded-2xl overflow-hidden shadow-sm mt-4">
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 border-b border-[#c8dfc4]">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-3 flex-1 max-w-lg">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search product name..."
            className="flex-1 bg-[#f7faf7] border border-[#c8dfc4] rounded-lg px-4 py-2.5
                       text-[15px] text-[#112415] placeholder-[#4a6741] focus:outline-none
                       focus:ring-2 focus:ring-[#112415] transition-shadow"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#112415] hover:bg-[#1a3321] text-white font-bold
                       text-[15px] rounded-lg transition-colors"
          >
            Search
          </button>
        </form>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => handleStatusFilter(f.value as StockStatus | "")}
              className={`px-4 py-1.5 text-sm font-medium rounded-full border-0 transition-colors
                ${itemsFilter.status === f.value
                  ? "bg-[#112415] text-white"
                  : "bg-[#e8f3e6] text-[#4a6741] hover:bg-[#d4e8d0] hover:text-[#112415]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      {itemsLoading ? (
        <div className="flex items-center justify-center py-16 text-[#112415] font-medium">
          <span className="animate-spin mr-2 material-symbols-outlined">refresh</span> Loading inventory...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#4a6741] font-medium">
          No products match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="text-xs text-[#4a6741] uppercase tracking-widest font-extrabold border-b border-[#c8dfc4]">
                <th className="text-left px-6 py-5">Product</th>
                <th className="text-left px-6 py-5">Qty</th>
                <th className="text-left px-6 py-5">Threshold</th>
                <th className="text-left px-6 py-5">Status</th>
                <th className="text-left px-6 py-5">Stock Value</th>
                <th className="text-left px-6 py-5">Last Movement</th>
                <th className="px-6 py-5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item: StockItem, idx) => {
                const cfg = STATUS_CONFIG[item.stock_status];
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-[#c8dfc4] transition-colors
                                ${idx % 2 === 0 ? "bg-white" : "bg-[#f7faf7]"}`}
                  >
                    {/* Product */}
                    <td className="px-6 py-5">
                      <p className="font-bold text-[#112415] text-[16px]">{item.name}</p>
                      <p className="text-sm text-[#4a6741] mt-0.5">{item.package_size}</p>
                    </td>

                    {/* Qty */}
                    <td className="px-6 py-5 text-left">
                      <span className={`font-bold text-[17px]
                        ${item.stock_status === "out_of_stock" ? "text-red-600"
                          : item.stock_status === "critical"   ? "text-orange-600"
                          : item.stock_status === "low"        ? "text-amber-600"
                          : "text-[#112415]"}`}>
                        {item.current_quantity}
                      </span>
                    </td>

                    {/* Threshold */}
                    <td className="px-6 py-5 text-left font-mono text-[#4a6741]">
                      {item.low_stock_threshold}
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-5 text-left">
                      <span className={`inline-block px-4 py-1 text-xs font-bold uppercase tracking-wider
                                        rounded-full border-0`}
                            style={{ background: cfg.bg, color: cfg.text }}>
                        {cfg.label}
                      </span>
                    </td>

                    {/* Stock value */}
                    <td className="px-6 py-5 text-left text-[#112415] font-mono text-sm">
                      ETB {Number(item.stock_value).toLocaleString()}
                    </td>

                    {/* Last movement */}
                    <td className="px-6 py-5 text-[#4a6741] text-[13px]">
                      {item.last_movement_at ? (
                        <>
                          <span className="text-[#112415] font-medium">
                            {MOVEMENT_LABEL[item.last_movement_type ?? ""] ?? item.last_movement_type}
                          </span>
                          <br />
                          {new Date(item.last_movement_at).toLocaleDateString("en-ET")}
                        </>
                      ) : (
                        <span className="text-[#c8dfc4]">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5 text-right">
                      <button
                        onClick={() => onAdjust(item.id)}
                        className="px-5 py-2 text-sm font-bold bg-[#112415] hover:bg-[#1a3321]
                                   text-white rounded-lg transition-colors border border-[#4a6741] shadow-sm"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="px-6 py-4 bg-[#7c8793] text-sm font-medium text-slate-300 border-t border-slate-600/50">
        {items.length} product{items.length !== 1 ? "s" : ""} shown
      </div>
    </div>
  );
};

export default StockOverviewTable;
