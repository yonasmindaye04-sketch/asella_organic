import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";

interface Affiliate {
  id: string;
  full_name: string;
  referral_code: string;
  total_customers: number;
  total_commissions_amount: number;
}

interface AffiliateLeaderboardProps {
  from?: string;
  to?: string;
}

export default function AffiliateLeaderboard({ from, to }: AffiliateLeaderboardProps) {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAffiliates = async () => {
      try {
        let url = "/api/referrals/affiliates?active=true";
        if (from && to) {
          url += `&from=${from}&to=${to}`;
        }

        const res = await api.get<Affiliate[]>(url);
        if (res.success && Array.isArray(res.data)) {
          const sorted = [...res.data]
            .filter((a) => a && (a.referral_code || a.full_name))
            .sort(
              (a, b) =>
                Number(b.total_commissions_amount || 0) -
                Number(a.total_commissions_amount || 0)
            );
          setAffiliates(sorted.slice(0, 5));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAffiliates();
  }, [from, to]);

  return (
    <div className="card p-5 h-full flex flex-col justify-between animate-in">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Top Affiliate Partners
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Commission earners & customer referrals
            </p>
          </div>
          <Link
            to="/dashboard/affiliates"
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
          >
            Manage
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : affiliates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <p className="text-xs text-zinc-400">No active affiliates yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {affiliates.map((aff, i) => (
              <div
                key={aff.id || i}
                className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/50 hover:border-emerald-500/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs tabular-nums shrink-0 ${
                      i === 0
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : i === 1
                        ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    #{i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {aff.full_name || "Affiliate Partner"}
                    </p>
                    <p className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      {aff.referral_code || "—"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {Number(aff.total_commissions_amount || 0).toLocaleString()} ETB
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {Number(aff.total_customers || 0)} referrals
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
