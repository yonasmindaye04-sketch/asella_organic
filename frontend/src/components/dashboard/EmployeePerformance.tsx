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
          .map((staff, i) => ({
            id: (staff as any).id || "",
            name: staff.full_name,
            role: (staff as any).role || "employee",
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
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Staff Sales Performance
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Click any team member to inspect order breakdown
              </p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-zinc-400">leaderboard</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-zinc-400 text-xs">
              Loading staff metrics...
            </div>
          ) : performers.length > 0 ? (
            <div className="space-y-2.5">
              {performers.map((p, i) => (
                <div
                  key={p.id || p.name}
                  onClick={() => setSelected(p)}
                  className="flex items-center gap-3 group cursor-pointer rounded-lg p-2.5 border border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/50 hover:border-emerald-500/40 transition-all"
                >
                  <span className="text-xs font-bold text-zinc-400 w-4 text-center tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold uppercase text-xs shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold truncate text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2 tabular-nums">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {p.revenue.toLocaleString()} ETB
                        </span>
                        <span className="material-symbols-outlined text-[14px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          open_in_new
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max((p.revenue / maxRevenue) * 100, 6)}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500 tabular-nums">
                      <span className="capitalize">{p.role}</span>
                      <span>
                        {p.placed} orders · {p.delivered} delivered
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-zinc-400">
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
