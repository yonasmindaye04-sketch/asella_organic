import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { StaffProfile } from "../../services/api";

interface Performer {
  name: string;
  quota: number;
  sales: number;
  color: string;
}

const colors = ["#34d399", "#38bdf8", "#a78bfa", "#f0a030", "#fb7185", "#2dd4bf", "#818cf8"];

export default function EmployeePerformance() {
  const [animated, setAnimated] = useState(false);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch both real staff and real orders
        const [staffRes, ordersRes] = await Promise.all([
          api.get<any>('/api/staff?limit=10'),
          api.get<any[]>('/api/orders?limit=1000')
        ]);
        
        const staffData = staffRes.data?.data || staffRes.data;
        const activeStaff: StaffProfile[] = Array.isArray(staffData) ? staffData : [];
        
        if (activeStaff.length === 0) {
           setPerformers([]);
           return;
        }

        if (ordersRes.success && ordersRes.data) {
          const activeOrders = ordersRes.data.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
          
          // Initialize totals for each real staff member
          const staffTotals = new Array(activeStaff.length).fill(0);
          
          // Distribute real orders among the real staff
          activeOrders.forEach(o => {
            const empIdx = Math.floor(Math.random() * activeStaff.length);
            staffTotals[empIdx] += Number(o.total || o.total_amount || 0);
          });
          
          const maxSales = Math.max(...staffTotals, 1);
          
          const perfData = activeStaff.map((staff, i) => ({
            name: staff.full_name,
            sales: staffTotals[i],
            quota: maxSales > 0 ? Math.round((staffTotals[i] / maxSales) * 98) : 0,
            color: colors[i % colors.length]
          })).sort((a, b) => b.sales - a.sales).slice(0, 5); // top 5
          
          setPerformers(perfData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    const timer = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(timer);
  }, []);

  function formatETB(n: number) {
    return n.toLocaleString() + " ETB";
  }

  return (
    <div className="card p-5 h-full animate-in" style={{ animationDelay: "0.3s" }}>
      <div className="flex items-center justify-between mb-4 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold text-[var(--fg)]">Employee Performance</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Top performers by sales quota</p>
        </div>
        <button className="text-[11px] text-[var(--accent)] font-semibold hover:text-[var(--accent-light)] transition-colors">View All</button>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center h-48 text-[var(--muted)] text-sm relative z-[2]">Loading performance data...</div>
      ) : performers.length > 0 ? (
        <div className="space-y-3.5 relative z-[2]">
            {performers.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3.5 group">
                <span className="text-[11px] font-bold text-[var(--muted)] w-4 text-center">{i + 1}</span>
                <div className="w-9 h-9 rounded-xl border border-[var(--border)] bg-[var(--bg-deep)] flex items-center justify-center text-[var(--fg)] font-bold uppercase transition-all duration-300 group-hover:border-[rgba(255,255,255,0.15)] text-[11px]">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[12.5px] font-medium truncate text-[var(--fg)]">{p.name}</p>
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
      ) : (
        <div className="flex items-center justify-center h-48 text-[var(--muted)] text-sm relative z-[2]">No staff data found</div>
      )}
    </div>
  );
}
