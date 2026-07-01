"use client";

import React from "react";

interface LocationData {
  city: string;
  percentage: number;
  orders: number;
  color: string;
}

const locations: LocationData[] = [
  { city: "Addis Ababa", percentage: 91, orders: 10, color: "var(--accent)" },
  { city: "Dire Dawa", percentage: 4.5, orders: 1, color: "var(--sky)" },
  { city: "Hawassa", percentage: 2.8, orders: 0, color: "var(--violet)" },
  { city: "Bahir Dar", percentage: 1.7, orders: 0, color: "var(--emerald)" },
];

function CircularProgress({ percentage, size = 80, strokeWidth = 6, color }: { percentage: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="progress-ring-circle" />
    </svg>
  );
}

export default function SalesByLocation() {
  return (
    <div className="card p-5 animate-in" style={{ animationDelay: "0.55s" }}>
      <div className="mb-5 relative z-[2]">
        <h3 className="text-sm font-bold">Sales by Location</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Geographic distribution</p>
      </div>
      {/* Main Circle */}
      <div className="flex flex-col items-center mb-5 relative z-[2]">
        <div className="relative">
          <CircularProgress percentage={91} size={110} strokeWidth={8} color="var(--accent)" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold leading-none">91%</span>
            <span className="text-[9px] text-[var(--muted)] font-medium mt-1">ADDIS ABABA</span>
          </div>
        </div>
      </div>
      {/* Other Locations */}
      <div className="space-y-3 relative z-[2]">
        {locations.slice(1).map((loc) => (
          <div key={loc.city} className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <CircularProgress percentage={loc.percentage} size={38} strokeWidth={4} color={loc.color} />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">{loc.percentage}%</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[12px] font-medium truncate">{loc.city}</p>
                <p className="text-[10px] text-[var(--muted)]">{loc.orders} orders</p>
              </div>
              <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.max(loc.percentage * 2.5, 2)}%`, background: loc.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Bottom Summary */}
      <div className="mt-5 pt-4 border-t border-[var(--border)] grid grid-cols-2 gap-3 relative z-[2]">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">4</p>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">Regions</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--fg)]">11</p>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">Total Orders</p>
        </div>
      </div>
    </div>
  );
}