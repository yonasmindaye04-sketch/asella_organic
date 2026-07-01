"use client";

import React, { useState } from "react";

interface StaffMember {
  name: string;
  role: string;
  status: "active" | "away" | "offline";
  avatar: string;
}

const staff: StaffMember[] = [
  { name: "Elena Vasquez", role: "Senior Sales Rep", status: "active", avatar: "elena-v" },
  { name: "James Okonkwo", role: "Account Executive", status: "active", avatar: "james-ok" },
  { name: "Sarah Chen", role: "Sales Manager", status: "active", avatar: "sarah-ch" },
  { name: "Ryan Mitchell", role: "BDR", status: "away", avatar: "ryan-mit" },
  { name: "Aisha Patel", role: "Senior Sales Rep", status: "active", avatar: "aisha-pat" },
  { name: "Tom Bergström", role: "Account Executive", status: "offline", avatar: "tom-berg" },
  { name: "Mia Rodriguez", role: "Sales Ops Analyst", status: "active", avatar: "mia-rod" },
];

const statusMap: Record<string, { cls: string; dot: string }> = {
  active: { cls: "badge-active", dot: "bg-[var(--emerald)]" },
  away: { cls: "badge-away", dot: "bg-[var(--accent)]" },
  offline: { cls: "badge-offline", dot: "bg-[var(--muted)]" },
};

export default function StaffDirectory() {
  const [filter, setFilter] = useState<"all" | "active" | "away" | "offline">("all");

  const filtered = filter === "all" ? staff : staff.filter((s) => s.status === filter);

  return (
    <div className="card animate-in h-full" style={{ animationDelay: "0.4s" }}>
      <div className="flex items-center justify-between p-5 pb-0 mb-3 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold">Staff Directory</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{staff.length} team members</p>
        </div>
        <button className="w-7 h-7 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center text-xs hover:bg-[rgba(240,160,48,0.15)] transition-colors" aria-label="Add employee">
          <i className="fa-solid fa-plus" />
        </button>
      </div>
      {/* Mini filter */}
      <div className="flex gap-1 px-5 pb-2 relative z-[2]">
        {(["all", "active", "away", "offline"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium capitalize transition-all ${filter === f ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--fg-secondary)]"}`}>
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const st = statusMap[s.status];
              return (
                <tr key={s.name}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <img src={`https://picsum.photos/seed/${s.avatar}/64/64.jpg`} alt={s.name} className="w-7 h-7 rounded-lg object-cover border border-[var(--border)]" />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-card)] ${st.dot}`} />
                      </div>
                      <span className="font-medium text-[var(--fg)]">{s.name}</span>
                    </div>
                  </td>
                  <td className="text-[var(--muted)]">{s.role}</td>
                  <td><span className={`badge ${st.cls}`}>{s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}