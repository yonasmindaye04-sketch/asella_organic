import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { StaffProfile } from "../../services/api";
import EmployeeDetailModal from "./EmployeeDetailModal";

interface Performer {
  id: string;
  name: string;
  role: string;
  placed: number;
  delivered: number;
  revenue: number;
  color: string;
}

const COLORS = ["#059669", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6"];

interface EmployeePerformanceProps {
  from?: string;
  to?: string;
}

export default function EmployeePerformance({ from, to }: EmployeePerformanceProps) {
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Performer | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = "/api/staff?limit=20";
        if (from && to) {
          url += `&from=${from}&to=${to}`;
        }

        const staffRes = await api.get<any>(url);
        const staffData = staffRes.data?.data || staffRes.data;
        const activeStaff: StaffProfile[] = Array.isArray(staffData) ? staffData : [];

        const perfData = activeStaff
          .filter((staff) => staff && (staff.full_name || (staff as any).username || (staff as any).name))
          .map((staff, i) => ({
            id: (staff as any).id || `staff-${i}`,
            name: String(staff.full_name || (staff as any).username || (staff as any).name || "Staff Member"),
            role: String((staff as any).role || "employee"),
            placed: Number((staff as any).orders_placed_count || 0),
            delivered: Number((staff as any).orders_delivered_count || 0),
            revenue: Number((staff as any).revenue_generated || 0),
            color: COLORS[i % COLORS.length],
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        setPerformers(perfData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [from, to]);

  const maxRevenue = Math.max(...performers.map((p) => p.revenue), 1);

  return (
    <>
      <div className="card p-5 h-full flex flex-col justify-between animate-in">
        <div>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--fg)]">
                Staff Sales Performance
              </h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Click any team member to inspect order breakdown
              </p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-[var(--muted)]">leaderboard</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-[var(--muted)] text-xs">
              Loading staff metrics…
            </div>
          ) : performers.length > 0 ? (
            <div className="space-y-2">
              {performers.map((p, i) => (
                <div
                  key={p.id || p.name}
                  onClick={() => setSelected(p)}
                  className="group cursor-pointer rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:border-emerald-500/40 hover:bg-[var(--bg-card-hover)] transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-[11px] font-bold text-[var(--muted)] w-4 text-center shrink-0">
                      {i + 1}
                    </span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold uppercase text-xs shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {(p.name || "S").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold truncate text-[var(--fg)]">
                          {p.name}
                        </p>
                        <span className="text-xs font-bold text-[var(--fg)] shrink-0 ml-2 tabular-nums">
                          {p.revenue.toLocaleString()} ETB
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--muted)] capitalize truncate">
                        {p.role}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-[var(--bg-deep)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max((p.revenue / maxRevenue) * 100, 4)}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                    <div className="flex justify-end mt-1 text-[10px] text-[var(--muted)] tabular-nums">
                      {p.placed} orders · {p.delivered} delivered
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-[var(--muted)]">
              <span className="material-symbols-outlined text-[28px] opacity-40">person_off</span>
              <p className="text-xs">No staff activity found</p>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <EmployeeDetailModal
          staffId={selected.id}
          staffName={selected.name}
          staffRole={selected.role}
          staffColor={selected.color}
          from={from}
          to={to}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
