import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

interface Expense {
  id: string;
  category: 'vendor_purchase' | 'operational' | 'salary' | 'other';
  description: string;
  amount: number;
  vendor_order_id: string | null;
  notes: string | null;
  created_at: string;
  recorded_by_name: string | null;
  vendor_order_ref: string | null;
  vendor_name: string | null;
}

interface ExpenseSummary {
  total_expenses: number;
  this_month: number;
  last_30_days: number;
  avg_monthly: number;
  categories: Array<{ category: string; total: number; count: number }>;
  monthly: Array<{ month: string; total: number; count: number }>;
}

const CATEGORY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  vendor_purchase: { label: 'Vendor Purchase', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  operational: { label: 'Operational', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  salary: { label: 'Salary', bg: 'bg-purple-500/15', text: 'text-purple-400' },
  affiliate_payout: { label: 'Affiliate Payout', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  other: { label: 'Other', bg: 'bg-gray-500/15', text: 'text-gray-400' },
};

const ExpensesPage: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ category: 'operational', description: '', amount: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/expenses?limit=100';
      if (categoryFilter) url += `&category=${categoryFilter}`;
      if (dateFrom) url += `&from=${dateFrom}`;
      if (dateTo) url += `&to=${dateTo}`;

      const [listRes, summaryRes, ordRes] = await Promise.all([
        api.get<Expense[]>(url),
        api.get<ExpenseSummary>('/api/expenses/summary'),
        api.get<any[]>('/api/orders?limit=1000')
      ]);

      if (listRes.success && listRes.data) setExpenses(listRes.data as any);
      if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data as any);
      
      if (ordRes.success && ordRes.data) {
        const validOrders = ordRes.data.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
        const totalRev = validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        setRevenue(totalRev);
      }
    } catch {
      // Ignore
    }
    setLoading(false);
  }, [categoryFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setMessage({ type: 'error', text: 'Amount must be greater than 0.' });
      setSubmitting(false);
      return;
    }

    const res = await api.post<any>('/api/expenses', {
      ...form,
      amount: amountNum,
      notes: form.notes || undefined,
    });

    if (res.success) {
      setMessage({ type: 'success', text: 'Expense recorded successfully!' });
      setForm({ category: 'operational', description: '', amount: '', notes: '' });
      fetchExpenses();
      setTimeout(() => {
        setIsModalOpen(false);
        setMessage(null);
      }, 1500);
    } else {
      setMessage({ type: 'error', text: res.error ?? 'Failed to save expense.' });
    }
    setSubmitting(false);
  };

  const formatCurrency = (n: number) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-6 px-4">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 animate-in">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--fg)]">Finances & Expenses</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">Unified view of your company revenue, expenses, and net profit.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-[var(--emerald)] text-white rounded-lg text-sm font-bold hover:opacity-90 transition flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[12px]">add</span>
              Add Expense
            </button>
            <div className="w-12 h-12 rounded-xl bg-transparent flex items-center justify-center">
              <span className="material-symbols-outlined text-rose-500 text-[24px]">payments</span>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Total Revenue */}
          <div className="card p-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent">
                <span className="material-symbols-outlined text-[18px] text-[var(--emerald)]">payments</span>
              </div>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Total Revenue</span>
            </div>
            <div className="text-[22px] font-black tracking-tight text-[var(--fg)]">
              {loading ? '...' : formatCurrency(revenue)}
            </div>
          </div>

          {/* Total Expenses */}
          <div className="card p-4 animate-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent">
                <span className="material-symbols-outlined text-[18px] text-[var(--rose)]">currency_exchange</span>
              </div>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Total Expenses</span>
            </div>
            <div className="text-[22px] font-black tracking-tight text-[var(--fg)]">
              {loading ? '...' : formatCurrency(summary?.total_expenses || 0)}
            </div>
          </div>

          {/* Net Profit */}
          <div className="card p-4 animate-in" style={{ animationDelay: '0.15s' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent">
                <span className="material-symbols-outlined text-[18px] text-[var(--accent)]">savings</span>
              </div>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Net Profit</span>
            </div>
            <div className="text-[22px] font-black tracking-tight text-[var(--fg)]">
              {loading ? '...' : formatCurrency(revenue - (summary?.total_expenses || 0))}
            </div>
          </div>

          {/* Expenses This Month */}
          <div className="card p-4 animate-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent">
                <span className="material-symbols-outlined text-[18px] text-[var(--sky)]">event</span>
              </div>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Expenses This Month</span>
            </div>
            <div className="text-[22px] font-black tracking-tight text-[var(--fg)]">
              {loading ? '...' : formatCurrency(summary?.this_month || 0)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-4 animate-in" style={{ animationDelay: '0.25s' }}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Category</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] text-sm outline-none"
              >
                <option value="">All Categories</option>
                <option value="vendor_purchase">Vendor Purchase</option>
                <option value="operational">Operational</option>
                <option value="salary">Salary</option>
                <option value="affiliate_payout">Affiliate Payout</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] text-sm outline-none"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] text-sm outline-none"
              />
            </div>
            {(categoryFilter || dateFrom || dateTo) && (
              <button
                onClick={() => { setCategoryFilter(''); setDateFrom(''); setDateTo(''); }}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--muted)] text-sm hover:text-[var(--fg)] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden animate-in" style={{ animationDelay: '0.3s' }}>
          {loading ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined animate-spin text-4xl text-[var(--muted)]">sync</span>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-5xl text-[var(--muted)] mb-3 block">receipt_long</span>
              <p className="text-sm text-[var(--muted)]">No expenses found matching your criteria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]">
                    <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Description</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Category</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Amount</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => {
                    const sc = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG['other'];
                    return (
                      <tr key={expense.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
                        <td className="px-5 py-3.5 text-[12px] text-[var(--muted)]">{formatDate(expense.created_at)}</td>
                        <td className="px-5 py-3.5 text-[var(--fg)] font-medium">
                          {expense.description}
                          {expense.vendor_order_ref && (
                            <span className="ml-2 text-[10px] bg-[var(--bg)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--muted)] font-mono">
                              {expense.vendor_order_ref}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${sc.bg} ${sc.text} uppercase tracking-wide`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono font-bold text-[var(--fg)]">{formatCurrency(expense.amount)}</td>
                        <td className="px-5 py-3.5 text-[var(--fg-secondary)] text-[12px]">{expense.recorded_by_name || 'System'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => !submitting && setIsModalOpen(false)}>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5 border-b border-[var(--border)] pb-3">
                <h3 className="text-lg font-bold text-[var(--fg)]">Record Expense</h3>
                <button onClick={() => !submitting && setIsModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--fg)]">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {message && (
                <div className={`mb-4 p-3 rounded-lg text-sm font-bold ${
                  message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Category *</label>
                  <select
                    required
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition"
                  >
                    <option value="operational">Operational</option>
                    <option value="salary">Salary</option>
                    <option value="affiliate_payout">Affiliate Payout</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Description *</label>
                  <input
                    required type="text"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. Office rent, Electricity bill"
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Amount (ETB) *</label>
                  <input
                    required type="number" step="0.01" min="0.01"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Notes (Optional)</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Any additional details..."
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition min-h-[80px] placeholder-[var(--muted)]"
                  />
                </div>

                <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-lg text-[var(--fg)] text-sm font-medium hover:bg-[var(--bg)] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 bg-[var(--emerald)] text-white rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ExpensesPage;





