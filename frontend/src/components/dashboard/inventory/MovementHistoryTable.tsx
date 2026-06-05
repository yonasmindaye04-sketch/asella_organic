/**
 * src/components/dashboard/inventory/MovementHistoryTable.tsx
 * Asella Organic — Global Inventory Movement Log
 */

import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../../store";
import type { InventoryMovement } from "../../../store/slices/stockSlice";

interface Props {
  onPageChange:   (page: number) => void;
  onFilterChange: (f: Record<string, string>) => void;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; sign: string }> = {
  sale:              { label: "Sale",      color: "text-red-400",     sign: "−" },
  purchase_received: { label: "Received",  color: "text-emerald-400", sign: "+" },
  adjustment:        { label: "Adjusted",  color: "text-blue-400",    sign: "±" },
  return:            { label: "Return",    color: "text-emerald-400", sign: "+" },
  damage_loss:       { label: "Loss",      color: "text-orange-400",  sign: "−" },
  initial_stock:     { label: "Init",      color: "text-slate-400",   sign: "+" },
};

const MovementHistoryTable: React.FC<Props> = ({ onPageChange, onFilterChange }) => {
  const { movements, movementsMeta, movementsLoading, movementsFilter } =
    useSelector((s: RootState) => s.stock);

  const handleTypeFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ type: e.target.value, page: "1" });
  };

  const handleRefTypeFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ reference_type: e.target.value, page: "1" });
  };

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 p-4 border-b border-slate-700">
        <select
          value={movementsFilter.type}
          onChange={handleTypeFilter}
          className="bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-1.5
                     text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={movementsFilter.reference_type}
          onChange={handleRefTypeFilter}
          className="bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-1.5
                     text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Sources</option>
          <option value="order">Orders</option>
          <option value="vendor_order">Vendor POs</option>
          <option value="stock_request">Stock Requests</option>
          <option value="manual">Manual</option>
        </select>

        {movementsMeta && (
          <span className="ml-auto text-xs text-slate-500 self-center">
            {movementsMeta.total} movements total
          </span>
        )}
      </div>

      {/* Table */}
      {movementsLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <span className="animate-spin mr-2">⟳</span> Loading…
        </div>
      ) : movements.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No movements found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-center px-4 py-3 font-medium">Type</th>
                <th className="text-right px-4 py-3 font-medium">Change</th>
                <th className="text-right px-4 py-3 font-medium">After</th>
                <th className="text-left px-4 py-3 font-medium">Reason</th>
                <th className="text-left px-4 py-3 font-medium">By</th>
                <th className="text-left px-4 py-3 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m: InventoryMovement, idx) => {
                const cfg = TYPE_CONFIG[m.movement_type] ?? { label: m.movement_type, color: "text-slate-400", sign: "?" };
                return (
                  <tr
                    key={m.id}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors
                                ${idx % 2 === 0 ? "" : "bg-slate-800/30"}`}
                  >
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{m.product_name}</p>
                      <p className="text-xs text-slate-500">{m.package_size}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${cfg.color}`}>
                      {cfg.sign}{Math.abs(m.change_amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {m.quantity_after}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">
                      {m.reason}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {m.performed_by_name ?? m.performed_by_username ?? "system"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">
                      {m.reference_type && (
                        <span className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">
                          {m.reference_type}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {movementsMeta && movementsMeta.pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
          <button
            disabled={movementsMeta.page <= 1}
            onClick={() => onPageChange(movementsMeta.page - 1)}
            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40
                       text-white rounded-lg transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500">
            Page {movementsMeta.page} of {movementsMeta.pages}
          </span>
          <button
            disabled={movementsMeta.page >= movementsMeta.pages}
            onClick={() => onPageChange(movementsMeta.page + 1)}
            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40
                       text-white rounded-lg transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default MovementHistoryTable;
