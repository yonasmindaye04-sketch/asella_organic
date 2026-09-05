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

const colors = ["#34d399", "#38bdf8", "#a78bfa", "#f0a030", "#fb7185", "#2dd4bf", "#818cf8"];

interface EmployeePerformanceProps {
  from?: string;
  to?: string;
}

export default function EmployeePerformance({ from, to }: EmployeePerformanceProps) {
  const [animated, setAnimated] = useState(false);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Performer | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = '/api/staff?limit=20';
        if (from && to) {
          url += `&from=${from}&to=${to}`;
        }

        const staffRes = await api.get<any>(url);
        const staffData = staffRes.data?.data || staffRes.data;
        const activeStaff: StaffProfile[] = Array.isArray(staffData) ? staffData : [];

        const perfData = activeStaff
          .map((staff, i) => ({
            id:       (staff as any).id || "",
            name:     staff.full_name,
            role:     (staff as any).role || "employee",
            placed:   (staff as any).orders_placed_count || 0,
            delivered:(staff as any).orders_delivered_count || 0,
            revenue:  Number((staff as any).revenue_generated || 0),
            color:    colors[i % colors.length],
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
    const timer = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(timer);
  }, [from, to]);

  const maxRevenue = Math.max(...performers.map(p => p.revenue), 1);

  return (
    <>
      <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.3s" }}>
        <div className="flex items-center justify-between mb-4 relative z-[2]">
          <div>
            <h3 className="text-sm font-bold text-[var(--fg)]">Employee Performance</h3>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">Click any row to view full analytics</p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-[var(--muted)]">leaderboard</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-[var(--muted)] text-sm relative z-[2]">
            Loading performance data...
          </div>
        ) : performers.length > 0 ? (
          <div className="space-y-2 relative z-[2]">
            {performers.map((p, i) => (
              <div
                key={p.id || p.name}
                onClick={() => setSelected(p)}
                className="flex items-center gap-3 group cursor-pointer rounded-[var(--radius-sm)] px-2 py-2 -mx-2 hover:bg-[var(--bg-deep)] transition-colors duration-150"
              >
                <span className="text-[11px] font-bold text-[var(--muted)] w-4 text-center shrink-0">{i + 1}</span>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold uppercase text-[11px] shrink-0"
                  style={{ background: p.color }}
                >
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12.5px] font-semibold truncate text-[var(--fg)]">{p.name}</p>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[11px] text-[var(--muted)]">
                        ETB <strong style={{ color: p.color }}>{Number(p.revenue).toLocaleString()}</strong>
                      </span>
                      <span
                        className="material-symbols-outlined text-[14px] text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        open_in_full
                      </span>
                    </div>
                  </div>
                  <div className="h-[4px] rounded-full bg-[var(--bg-deep)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-[1.2s] ease-out"
                      style={{
                        width: animated ? `${Math.max((p.revenue / maxRevenue) * 98, 4)}%` : "0%",
                        background: `linear-gradient(90deg, ${p.color}88, ${p.color})`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    {p.placed} orders · {p.delivered} delivered
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-[var(--muted)] relative z-[2]">
            <span className="material-symbols-outlined text-[32px] opacity-30">person_off</span>
            <p className="text-sm">No staff data found</p>
          </div>
        )}
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
