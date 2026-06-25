

interface Props {
  orders: any[];
}

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

const colors = ["var(--accent)", "var(--sky)", "var(--violet)", "var(--emerald)"];

export default function SalesByLocation({ orders }: Props) {
  const total = orders.length;
  const map: Record<string, number> = {};
  orders.forEach((o) => {
    const city = o.city || 'Unknown';
    map[city] = (map[city] || 0) + 1;
  });

  const locations = Object.entries(map)
    .map(([city, count], i) => ({ 
        city, 
        orders: count, 
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
        color: colors[i % colors.length]
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 4);

  return (
    <div className="card p-5 animate-in h-full" style={{ animationDelay: "0.55s" }}>
      <div className="mb-5 relative z-[2]">
        <h3 className="text-sm font-bold">Sales by Location</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Geographic distribution</p>
      </div>
      
      {locations.length > 0 ? (
          <>
            {/* Main Circle */}
            <div className="flex flex-col items-center mb-5 relative z-[2]">
                <div className="relative">
                <CircularProgress percentage={locations[0].percentage} size={110} strokeWidth={8} color={locations[0].color} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold leading-none">{locations[0].percentage}%</span>
                    <span className="text-[9px] text-[var(--muted)] font-medium mt-1 uppercase text-center leading-tight tracking-wider px-2 max-w-[90px]">{locations[0].city}</span>
                </div>
                </div>
            </div>
            
            {/* Other Locations */}
            <div className="space-y-3 relative z-[2]">
                {locations.slice(1).map((loc) => (
                <div key={loc.city} className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                    <CircularProgress percentage={loc.percentage} size={38} strokeWidth={4} color={loc.color} />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">{Math.round(loc.percentage)}%</span>
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
          </>
      ) : (
          <div className="flex items-center justify-center h-[200px] text-[var(--muted)] text-sm relative z-[2]">No location data</div>
      )}

      {/* Bottom Summary */}
      <div className="mt-auto pt-4 border-t border-[var(--border)] grid grid-cols-2 gap-3 relative z-[2]">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--accent)]">{Object.keys(map).length}</p>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">Regions</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--fg)]">{total}</p>
          <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">Total Orders</p>
        </div>
      </div>
    </div>
  );
}
