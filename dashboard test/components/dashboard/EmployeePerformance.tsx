"use client";

import React, { useEffect, useState } from "react";

interface Performer {
  name: string;
  quota: number;
  sales: number;
  avatar: string;
  color: string;
}

const performers: Performer[] = [
  { name: "Elena Vasquez", quota: 94, sales: 47200, avatar: "elena-v", color: "#34d399" },
  { name: "James Okonkwo", quota: 88, sales: 41300, avatar: "james-ok", color: "#38bdf8" },
  { name: "Aisha Patel", quota: 85, sales: 38900, avatar: "aisha-pat", color: "#a78bfa" },
  { name: "Sarah Chen", quota: 82, sales: 36100, avatar: "sarah-ch", color: "#f0a030" },
  { name: "Ryan Mitchell", quota: 71, sales: 28400, avatar: "ryan-mit", color: "#fb7185" },
];

function formatETB(n: number) {
  return n.toLocaleString() + " ETB";
}

export default function EmployeePerformanceWrapper() {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.3s" }}>
      <div className="flex items-center justify-between mb-4 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold">Employee Performance</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Top performers by sales quota attainment</p>
        </div>
        <button className="text-[11px] text-[var(--accent)] font-semibold hover:text-[var(--accent-light)] transition-colors">View All</button>
      </div>
      <div className="space-y-3.5 relative z-[2]">
        {performers.map((p, i) => (
          <div key={p.name} className="flex items-center gap-3.5 group">
            <span className="text-[11px] font-bold text-[var(--muted)] w-4 text-center">{i + 1}</span>
            <img
              src={`https://picsum.photos/seed/${p.avatar}/68/68.jpg`}
              alt={p.name}
              className="w-9 h-9 rounded-xl object-cover border-2 border-[var(--border)] transition-all duration-300 group-hover:border-[rgba(255,255,255,0.15)]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12.5px] font-medium truncate">{p.name}</p>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--muted)]">{formatETB(p.sales)}</span>
                  <span className="text-[11px] font-bold w-10 text-right" style={{ color: p.color }}>{p.quota}%</span>
                </div>
              </div>
              <div className="h-[5px] rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[1.2s] ease-out"
                  style={{
                    width: animated ? `${p.quota}%` : "0%",
                    background: `linear-gradient(90deg, ${p.color}88, ${p.color})`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}