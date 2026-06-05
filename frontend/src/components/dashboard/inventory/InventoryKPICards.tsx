/**
 * src/components/dashboard/inventory/InventoryKPICards.tsx
 * Asella Organic — Inventory KPI Summary Cards
 *
 * Fix: Loading skeleton was bg-slate-800 (dark). Updated to site green palette.
 */

import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../../store";

const InventoryKPICards: React.FC = () => {
  const { summary, summaryLoading } = useSelector((s: RootState) => s.stock);

  if (summaryLoading || !summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-[#e8f3e6] border border-[#c8dfc4] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const formatETB = (n: number) =>
    `ETB ${Number(n).toLocaleString("en-ET", { minimumFractionDigits: 0 })}`;

  const cards = [
    {
      label:   "Total Stock Value",
      value:   formatETB(summary.total_stock_value),
      icon:    "payments",
      bg:      "#e8f5e9",
      border:  "#a5d6a7",
      text:    "#1b5e20",
      sub:     `${summary.total_products} products · ${(summary.total_units || 0).toLocaleString()} units`,
    },
    {
      label:   "Out of Stock",
      value:   summary.out_of_stock_count,
      icon:    "remove_shopping_cart",
      bg:      "#fce4ec",
      border:  "#f48fb1",
      text:    "#880e4f",
      sub:     "Needs immediate restock",
    },
    {
      label:   "Critical / Low",
      value:   `${summary.critical_count} / ${summary.low_count}`,
      icon:    "warning",
      bg:      "#fff8e1",
      border:  "#ffe082",
      text:    "#e65100",
      sub:     "Action recommended",
    },
    {
      label:   "Units Sold (30d)",
      value:   summary.units_sold_30d,
      icon:    "local_shipping",
      bg:      "#e3f2fd",
      border:  "#90caf9",
      text:    "#0d47a1",
      sub:     `${summary.units_received_30d || 0} received this month`,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative overflow-hidden rounded-2xl border p-5 shadow-sm
                     transition-shadow hover:shadow-md"
          style={{ background: card.bg, borderColor: card.border }}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#4a6741]">
              {card.label}
            </p>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center opacity-80"
              style={{ background: card.border }}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: card.text }}
              >
                {card.icon}
              </span>
            </div>
          </div>
          <p
            className="text-2xl font-black tracking-tight font-mono"
            style={{ color: card.text }}
          >
            {card.value}
          </p>
          <p className="text-xs text-[#4a6741] mt-1.5 truncate">{card.sub}</p>
        </div>
      ))}
    </div>
  );
};

export default InventoryKPICards;
