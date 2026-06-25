import { useState, useEffect } from "react";
import { api } from "../../services/api";
import type { StaffProfile } from "../../services/api";

const statusMap: Record<string, { cls: string; dot: string }> = {
  active: { cls: "badge-active", dot: "bg-[var(--emerald)]" },
  offline: { cls: "badge-offline", dot: "bg-[var(--muted)]" },
};

export default function StaffDirectory() {
  const [filter, setFilter] = useState<"all" | "active" | "offline">("all");
  const [staffData, setStaffData] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        setLoading(true);
        const res = await api.get<any>("/api/staff?limit=50");
        const items = res.data?.data || res.data;
        setStaffData(Array.isArray(items) ? items : []);
      } catch (err) {
        console.error("Failed to load staff directory", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStaff();
  }, []);

  const filtered = filter === "all" ? staffData : staffData.filter((s) => (s.active ? "active" : "offline") === filter);

  return (
    <div className="card animate-in h-full" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center justify-between p-5 pb-0 mb-3 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold text-[var(--fg)]">Staff Directory</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">{staffData.length} team members</p>
        </div>
      </div>
      {/* Mini filter */}
      <div className="flex gap-1 px-5 pb-2 relative z-[2]">
        {(["all", "active", "offline"] as const).map((f) => (
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
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center py-8 text-[var(--muted)] text-sm">Loading directory...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-8 text-[var(--muted)] text-sm">No staff found</td></tr>
            ) : filtered.map((s) => {
              const statusStr = s.active ? "active" : "offline";
              const st = statusMap[statusStr];
              
              // Generate a deterministic mock performance score (0-100) based on ID length & characters
              const scoreNum = s.id ? (s.id.charCodeAt(0) + s.id.charCodeAt(s.id.length - 1)) % 40 + 60 : 85;
              const isHigh = scoreNum >= 85;
              const isMed = scoreNum >= 70 && scoreNum < 85;
              const barColor = isHigh ? 'bg-[var(--emerald)]' : isMed ? 'bg-amber-500' : 'bg-red-500';

              return (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <div className="w-7 h-7 rounded-lg bg-[var(--bg)] flex items-center justify-center text-[var(--fg)] font-bold text-[10px] border border-[var(--border)] uppercase">
                          {s.full_name.charAt(0)}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-card)] ${st.dot}`} />
                      </div>
                      <span className="font-medium text-[var(--fg)]">{s.full_name}</span>
                    </div>
                  </td>
                  <td className="text-[var(--muted)] capitalize">{s.role}</td>
                  <td><span className={`badge ${st.cls}`}>{statusStr.charAt(0).toUpperCase() + statusStr.slice(1)}</span></td>
                  <td>
                    <div className="flex items-center gap-2 w-full max-w-[120px]">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${scoreNum}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-[var(--fg)] w-7 text-right">{scoreNum}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
