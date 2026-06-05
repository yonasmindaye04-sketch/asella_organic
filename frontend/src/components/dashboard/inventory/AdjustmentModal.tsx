/**
 * src/components/dashboard/inventory/AdjustmentModal.tsx
 * Asella Organic — Manual Stock Adjustment Modal
 */

import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../store";
import {
  submitAdjustment,
  clearAdjustmentError,
} from "../../../store/slices/stockSlice";

interface Props {
  initialProductId: string | null; // null = show product picker
  onClose:          () => void;
  onSuccess:        () => void;
}

const MOVEMENT_TYPES = [
  { value: "adjustment",   label: "Manual Adjustment",  direction: "both",   icon: "⟳" },
  { value: "return",       label: "Customer Return",     direction: "in",     icon: "↩" },
  { value: "damage_loss",  label: "Damage / Loss",       direction: "out",    icon: "⚠" },
  { value: "initial_stock",label: "Opening Balance",     direction: "in",     icon: "📦" },
] as const;

type MType = typeof MOVEMENT_TYPES[number]["value"];

const AdjustmentModal: React.FC<Props> = ({ initialProductId, onClose, onSuccess }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { items, adjustmentLoading, adjustmentError } = useSelector(
    (s: RootState) => s.stock
  );

  const [productId,    setProductId]    = useState(initialProductId ?? "");
  const [movementType, setMovementType] = useState<MType>("adjustment");
  const [rawAmount,    setRawAmount]    = useState("");
  const [direction,    setDirection]    = useState<"in" | "out">("in");
  const [reason,       setReason]       = useState("");
  const [notes,        setNotes]        = useState("");

  const selectedProduct = items.find((i) => i.id === productId);
  const typeConfig      = MOVEMENT_TYPES.find((t) => t.value === movementType)!;

  // Auto-set direction when type changes
  useEffect(() => {
    if (typeConfig.direction === "in")  setDirection("in");
    if (typeConfig.direction === "out") setDirection("out");
  }, [movementType, typeConfig.direction]);

  useEffect(() => {
    dispatch(clearAdjustmentError());
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty    = parseInt(rawAmount, 10);
    if (!productId || isNaN(qty) || qty <= 0 || !reason.trim()) return;

    const changeAmount = direction === "out" ? -qty : qty;
    const result = await dispatch(
      submitAdjustment({ product_id: productId, movement_type: movementType, change_amount: changeAmount, reason, notes: notes || undefined })
    );
    if (submitAdjustment.fulfilled.match(result)) {
      onSuccess();
    }
  };

  const projectedQty = selectedProduct
    ? selectedProduct.current_quantity + (parseInt(rawAmount || "0", 10) * (direction === "out" ? -1 : 1))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-700
                      rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Adjust Stock</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Product selector */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
              Product *
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2
                         text-sm text-white focus:outline-none focus:border-emerald-500
                         transition-colors"
            >
              <option value="">— Select a product —</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.package_size}) — {item.current_quantity} in stock
                </option>
              ))}
            </select>
          </div>

          {/* Movement type */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
              Adjustment Type *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setMovementType(t.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm
                              text-left transition-colors
                    ${movementType === t.value
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                      : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500"}`}
                >
                  <span className="text-base">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direction (only for "adjustment" type which is both) */}
          {typeConfig.direction === "both" && (
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
                Direction *
              </label>
              <div className="flex gap-2">
                {(["in", "out"] as const).map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors
                      ${direction === d
                        ? d === "in"
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                          : "bg-red-600/20 border-red-500 text-red-300"
                        : "bg-slate-800 border-slate-600 text-slate-400"}`}
                  >
                    {d === "in" ? "↑ Add Stock" : "↓ Remove Stock"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity + preview */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
              Quantity *
            </label>
            <input
              type="number"
              min={1}
              value={rawAmount}
              onChange={(e) => setRawAmount(e.target.value)}
              required
              placeholder="Enter quantity"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2
                         text-sm text-white font-mono focus:outline-none focus:border-emerald-500
                         transition-colors"
            />
            {selectedProduct && rawAmount && !isNaN(parseInt(rawAmount, 10)) && (
              <p className="mt-1.5 text-xs text-slate-400">
                {selectedProduct.current_quantity} →{" "}
                <span className={projectedQty! < 0 ? "text-red-400" : "text-emerald-400"}>
                  {projectedQty}
                </span>
                {projectedQty! < 0 && (
                  <span className="text-red-400 ml-2">⚠ Would go negative</span>
                )}
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
              Reason * <span className="text-slate-600">(will appear in audit log)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={255}
              placeholder="e.g. Monthly recount, expired units removed…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2
                         text-sm text-white focus:outline-none focus:border-emerald-500
                         transition-colors"
            />
          </div>

          {/* Notes (optional) */}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wider mb-1.5">
              Notes <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Additional context…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2
                         text-sm text-white resize-none focus:outline-none focus:border-emerald-500
                         transition-colors"
            />
          </div>

          {/* Error */}
          {adjustmentError && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3
                            text-sm text-red-300">
              {adjustmentError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300
                         hover:text-white hover:border-slate-500 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjustmentLoading || !productId || !rawAmount || !reason}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500
                         disabled:opacity-50 disabled:cursor-not-allowed text-white
                         text-sm font-medium transition-colors"
            >
              {adjustmentLoading ? "Saving…" : "Save Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdjustmentModal;
