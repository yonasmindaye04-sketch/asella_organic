/**
 * src/components/dashboard/CallCenterLeaderboard.tsx
 * Asella Organic — Call Center Agents Performance Panel (Admin/Manager view)
 */

import { useEffect, useState } from 'react';
import { api } from '../../services/api';

interface CCAgent {
  id:            string;
  full_name:     string;
  username:      string;
  active:        boolean;
  total_orders:  number;
  delivered:     number;
  cancelled:     number;
  pending:       number;
  revenue:       number;
  call_count:    number;
  delivery_rate: number;
}

interface CallCenterLeaderboardProps {
  from?: string;
  to?:   string;
}

export default function CallCenterLeaderboard({ from, to }: CallCenterLeaderboardProps) {
  const [agents, setAgents] = useState<CCAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let url = '/api/callcenter/agents';
        if (from && to) url += `?from=${from}&to=${to}`;
        const res = await api.get<CCAgent[]>(url);
        if (res.success && Array.isArray(res.data)) {
          setAgents(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [from, to]);

  return (
    <div className="bg-[var(--card-bg,white)] rounded-xl border border-[var(--border,#e5e7eb)] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border,#e5e7eb)] flex items-center gap-2">
        <span className="material-symbols-outlined text-green-600 text-[20px]">headset_mic</span>
        <h2 className="font-semibold text-sm">Call Center Performance</h2>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : agents.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">No call center agents yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-right">Calls</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Delivered</th>
                <th className="px-4 py-3 text-right">Cancelled</th>
                <th className="px-4 py-3 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {agents.map(agent => (
                <tr key={agent.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {agent.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 leading-tight">{agent.full_name}</p>
                        <p className="text-[10px] text-gray-400">@{agent.username}</p>
                      </div>
                      {!agent.active && (
                        <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                          inactive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-600">
                    {agent.call_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {agent.total_orders.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-medium">
                    {agent.delivered.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-red-500">
                    {agent.cancelled.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${agent.delivery_rate >= 70 ? 'text-green-600' : agent.delivery_rate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {agent.delivery_rate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
