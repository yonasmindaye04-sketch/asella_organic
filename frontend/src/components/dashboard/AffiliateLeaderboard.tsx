import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface Affiliate {
  id: string;
  full_name: string;
  referral_code: string;
  total_customers: number;
  total_commissions_amount: number;
}

export default function AffiliateLeaderboard() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAffiliates = async () => {
      try {
        const res = await api.get<Affiliate[]>('/api/referrals/affiliates?active=true');
        if (res.success && res.data) {
          const sorted = [...res.data].sort((a, b) => b.total_commissions_amount - a.total_commissions_amount);
          setAffiliates(sorted.slice(0, 5));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAffiliates();
  }, []);

  return (
    <div className="card p-4 lg:p-5 flex flex-col h-full bg-white dark:bg-[#001803] border border-slate-200 dark:border-[#E2F0D9]/20 shadow-sm rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Top Affiliates</h3>
          <p className="text-[11px] font-bold text-slate-500 dark:text-[#A0F399] mt-0.5">Highest commission earners</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <i className="fa-solid fa-trophy text-[14px]" />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : affiliates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm font-bold text-slate-500 dark:text-[#A0F399]">No active affiliates yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {affiliates.map((aff, i) => (
              <div key={aff.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-[#E2F0D9]/10 hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors bg-slate-50 dark:bg-[#002C17]/50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : i === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                    #{i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{aff.full_name}</p>
                    <p className="text-[10px] font-mono font-bold text-emerald-600 dark:text-[#A0F399]">{aff.referral_code}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{Number(aff.total_commissions_amount).toLocaleString()} ETB</p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-[#A0F399]/70 uppercase tracking-wider">{aff.total_customers} Customers</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
