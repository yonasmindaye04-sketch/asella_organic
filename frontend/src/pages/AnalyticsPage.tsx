import React, { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { api } from '../services/api';

const AnalyticsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0],
    };
  });

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      let query = '';
      if (dateRange.from || dateRange.to) {
        const params = new URLSearchParams();
        if (dateRange.from) params.set('from', dateRange.from);
        if (dateRange.to) params.set('to', dateRange.to);
        query = `?${params.toString()}`;
      }
      
      const res = await api.get<any>(`/api/reports/pl${query}`);
      if (res.success && res.data) {
        setData(res.data);
      }
      setLoading(false);
    };
    fetchReport();
  }, [dateRange]);

  const handleExport = () => {
    let url = '/api/reports/pl/export';
    if (dateRange.from || dateRange.to) {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      url += `?${params.toString()}`;
    }
    
    const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
    window.open(BASE_URL + url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (n: number) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Profit & Loss Report</h1>
            <p className="text-sm text-slate-500 mt-0.5">Detailed business metrics and sales performance.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border shadow-sm flex-1">
              <input 
                type="date" 
                className="text-sm outline-none text-gray-700 bg-transparent w-full"
                value={dateRange.from}
                onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              />
              <span className="text-gray-400 text-sm">to</span>
              <input 
                type="date" 
                className="text-sm outline-none text-gray-700 bg-transparent w-full"
                value={dateRange.to}
                onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              />
              {(dateRange.from || dateRange.to) && (
                <button 
                  onClick={() => setDateRange({ from: '', to: '' })}
                  className="text-xs text-gray-400 hover:text-gray-700 ml-1"
                >
                  Clear
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrint}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">print</span> Print
              </button>
              <button 
                onClick={handleExport}
                className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">download</span> Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Print Header */}
        <div className="hidden print:block mb-8 text-center border-b pb-6">
          <h1 className="text-3xl font-black text-black">Asella Organic</h1>
          <h2 className="text-xl text-gray-700 mt-1">Profit & Loss Report</h2>
          <p className="text-gray-500 mt-2">
            Period: {dateRange.from ? new Date(dateRange.from).toLocaleDateString() : 'Beginning'} - {dateRange.to ? new Date(dateRange.to).toLocaleDateString() : 'Present'}
          </p>
        </div>

        {/* Report Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <span className="material-symbols-outlined animate-spin text-4xl text-gray-400">sync</span>
          </div>
        ) : data ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              
              {/* Sales Overview */}
              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">Sales & Gross Profit</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-gray-700">
                    <span>Revenue (from {data.total_orders} orders)</span>
                    <span className="font-mono">{formatCurrency(data.revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-700 text-sm pl-4">
                    <span>Average Order Value</span>
                    <span className="font-mono">{formatCurrency(data.avg_order_value)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-600 pl-4 border-b border-dashed border-gray-200 pb-3">
                    <span>Less: Cost of Goods Sold (COGS)</span>
                    <span className="font-mono">-{formatCurrency(data.cogs)}</span>
                  </div>
                  <div className="flex justify-between items-center text-lg font-bold text-gray-900 pt-1">
                    <span>Gross Profit</span>
                    <span className="font-mono">{formatCurrency(data.gross_profit)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-500 text-xs">
                    <span>Gross Margin %</span>
                    <span>{data.gross_margin_pct}%</span>
                  </div>
                </div>
              </div>

              {/* Operating Expenses */}
              <div className="mb-8">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">Operating Expenses</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-red-600 pl-4">
                    <span>Operational</span>
                    <span className="font-mono">{formatCurrency(data.operating_expenses.operational)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-600 pl-4">
                    <span>Salary</span>
                    <span className="font-mono">{formatCurrency(data.operating_expenses.salary)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-600 pl-4">
                    <span>Affiliate Payouts</span>
                    <span className="font-mono">{formatCurrency(data.operating_expenses.affiliate_payout)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-600 pl-4 border-b border-dashed border-gray-200 pb-3">
                    <span>Other Expenses</span>
                    <span className="font-mono">{formatCurrency(data.operating_expenses.other)}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-red-700 pt-1">
                    <span>Total Operating Expenses</span>
                    <span className="font-mono">{formatCurrency(data.operating_expenses.total)}</span>
                  </div>
                </div>
              </div>

              {/* Net Profit */}
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 mb-4">Bottom Line</h3>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 print:bg-white print:border-t-2 print:border-black print:p-0">
                  <div className="flex justify-between items-center text-xl font-black text-green-700 print:text-black">
                    <span>Net Profit</span>
                    <span className="font-mono">{formatCurrency(data.net_profit)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-500 text-xs mt-2 print:mt-1">
                    <span>Net Margin %</span>
                    <span>{data.net_margin_pct}%</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">Failed to load report data.</div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;
