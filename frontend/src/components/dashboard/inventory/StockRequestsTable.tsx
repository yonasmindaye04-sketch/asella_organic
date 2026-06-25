/**
 * src/components/dashboard/inventory/StockRequestsTable.tsx
 * Asella Organic — Stock Requests Management Table
 */

import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../store";
import {
  updateRequestStatus,
  fetchStockRequests,
  fetchStock,
  fetchStockSummary,
} from "../../../store/slices/stockSlice";
import type { StockRequest } from "../../../store/slices/stockSlice";

const STATUS_CONFIG = {
  pending:   { label: "Pending",   className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ordered:   { label: "Ordered",   className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  received:  { label: "Received",  className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "Cancelled", className: "bg-slate-500/15 text-slate-400 border-slate-600" },
};

const StockRequestsTable: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { requests, requestsLoading } = useSelector((s: RootState) => s.stock);
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const handleStatusChange = async (
    request: StockRequest,
    newStatus: string
  ) => {
    setUpdating(request.id);
    await dispatch(updateRequestStatus({ id: request.id, status: newStatus }));
    setUpdating(null);

    // If received, refresh inventory since stock may have been updated
    if (newStatus === "received") {
      dispatch(fetchStock({}));
      dispatch(fetchStockSummary());
    }
    dispatch(fetchStockRequests(statusFilter ? { status: statusFilter } : {}));
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setStatusFilter(val);
    dispatch(fetchStockRequests(val ? { status: val } : {}));
  };

  const filtered = statusFilter
    ? requests.filter((r) => r.status === statusFilter)
    : requests;

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-700">
        <select
          value={statusFilter}
          onChange={handleFilterChange}
          className="bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-1.5
                     text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="ordered">Ordered</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {requestsLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <span className="animate-spin mr-2">⟳</span> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No stock requests found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                <th className="text-left px-4 py-3 font-medium">Item</th>
                <th className="text-right px-4 py-3 font-medium">Available</th>
                <th className="text-right px-4 py-3 font-medium">Needed</th>
                <th className="text-left px-4 py-3 font-medium">Delivery By</th>
                <th className="text-left px-4 py-3 font-medium">Requested By</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req: StockRequest, idx) => {
                const cfg = STATUS_CONFIG[req.status];
                const isUpdating = updating === req.id;
                return (
                  <tr
                    key={req.id}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors
                                ${idx % 2 === 0 ? "" : "bg-slate-800/30"}
                                ${isUpdating ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">
                        {req.product_name ?? req.item}
                      </p>
                      {req.package_size && (
                        <p className="text-xs text-slate-500">{req.package_size}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">
                      {req.current_stock ?? req.stock_available}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                      {req.qty_needed}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {req.delivery_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {req.requested_by_name ?? req.requested_by ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 text-xs font-medium
                                        rounded-full border ${cfg.className}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(req.created_at).toLocaleDateString("en-ET")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {req.status === "pending" && (
                          <>
                            <button
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(req, "ordered")}
                              className="px-2.5 py-1 text-xs bg-blue-500 hover:bg-blue-600
                                         text-white rounded-lg
                                         transition-colors disabled:opacity-50"
                            >
                              Mark Ordered
                            </button>
                            <button
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(req, "cancelled")}
                              className="px-2.5 py-1 text-xs bg-red-500 hover:bg-red-600
                                         text-white rounded-lg
                                         transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {req.status === "ordered" && (
                          <button
                            disabled={isUpdating}
                            onClick={() => handleStatusChange(req, "received")}
                            className="px-2.5 py-1 text-xs bg-emerald-500 hover:bg-emerald-600
                                       text-white rounded-lg
                                       transition-colors disabled:opacity-50"
                          >
                            {isUpdating ? "…" : "✓ Mark Received"}
                          </button>
                        )}
                        {(req.status === "received" || req.status === "cancelled") && (
                          <span className="text-xs text-slate-600 italic">
                            {req.status === "received" ? "Stock updated" : "Cancelled"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StockRequestsTable;

