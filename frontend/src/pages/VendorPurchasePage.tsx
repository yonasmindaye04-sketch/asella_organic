/**
 * VendorPurchasePage.tsx — Rebuilt
 *
 * Two tabs:
 *   Tab 1 — "New Order": form to create vendor purchase orders
 *   Tab 2 — "Order History": manage vendor orders with approve/receive/cancel
 */
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

// ─── Types ───────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  package_size: string;
}

interface VendorOrder {
  id: string;
  order_id: string;
  product_id: string | null;
  vendor_name: string;
  item: string;
  amount: string;
  price: number;
  delivery_date: string | null;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  received_by_name: string | null;
  received_at: string | null;
  product_name: string | null;
  product_package_size: string | null;
  created_at: string;
  updated_at: string;
}

interface FormData {
  vendor_name: string;
  phone: string;
  telegram_username: string;
  material_type: string;
  description: string;
  quantity: string;
  unit_price: string;
  totalAmount: number;
  payment_status: string;
  notes: string;
  product_id: string;
}

const EMPTY: FormData = {
  vendor_name: '', phone: '', telegram_username: '', material_type: 'Raw Material',
  description: '', quantity: '', unit_price: '',
  totalAmount: 0, payment_status: 'Unpaid', notes: '', product_id: '',
};

const MATERIAL_TYPES = [
  'Raw Material', 'Bottles / Jars', 'Labels / Stickers',
  'Cartons / Boxes', 'Equipment', 'Other Supplies',
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-amber-500', text: 'text-white' },
  approved:  { label: 'Approved',  bg: 'bg-blue-500',  text: 'text-white' },
  received:  { label: 'Received',  bg: 'bg-emerald-500', text: 'text-white' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-500',   text: 'text-white' },
};

// ─── Component ───────────────────────────────────────────────────

const VendorPurchasePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // --- Form state ---
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  // --- History state ---
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    orderId: string;
    action: string;
    orderRef: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch products for the dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Product[]>('/api/products?limit=500');
        if (res.success && res.data) setProducts(res.data);
      } catch { /* ignore */ }
    })();
  }, []);

  // Fetch vendor orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/vendor-orders?';
      if (statusFilter) url += `status=${statusFilter}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
      const res = await api.get<VendorOrder[]>(url);
      if (res.success && res.data) setOrders(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ─── Form handlers ─────────────────────────────────────────────

  const calcTotal = (qty: string, price: string) =>
    (parseFloat(qty) || 0) * (parseFloat(price) || 0);

  const handleChange = (field: keyof FormData, value: string) => {
    const next = { ...form, [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      next.totalAmount = calcTotal(next.quantity, next.unit_price);
    }
    setForm(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.unit_price);

    if (isNaN(qty) || qty <= 0) {
      setMessage({ type: 'error', text: 'Quantity must be greater than 0.' });
      setSubmitting(false);
      return;
    }
    if (isNaN(price) || price <= 0) {
      setMessage({ type: 'error', text: 'Unit price must be greater than 0.' });
      setSubmitting(false);
      return;
    }

    const res = await api.post<any>('/api/vendor-orders', {
      vendor_name: form.vendor_name,
      phone: form.phone || undefined,
      telegram_username: form.telegram_username
        ? form.telegram_username.replace(/^@/, '').trim()
        : undefined,
      material_type: form.material_type,
      description: form.description,
      quantity: qty,
      unit_price: price,
      payment_status: form.payment_status as any,
      notes: form.notes || undefined,
      product_id: form.product_id || undefined,
    });

    if (res.success) {
      setMessage({ type: 'success', text: '✅ Vendor purchase order created! View it in Order History.' });
      setForm(EMPTY);
      fetchOrders(); // refresh history
    } else {
      setMessage({ type: 'error', text: res.error ?? 'Failed to submit vendor purchase.' });
    }
    setSubmitting(false);
  };

  // ─── Status actions ────────────────────────────────────────────

  const handleStatusChange = async () => {
    if (!confirmModal) return;
    setActionLoading(true);
    try {
      const res = await api.patch<any>(`/api/vendor-orders/${confirmModal.orderId}/status`, {
        status: confirmModal.action,
      });
      if (res.success) {
        fetchOrders();
        setConfirmModal(null);
      } else {
        alert(res.error ?? 'Failed to update status');
      }
    } catch {
      alert('Failed to update status');
    }
    setActionLoading(false);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (n: number) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

  // ─── Render ────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto py-6 px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 animate-in">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--fg)]">Vendor Purchase</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">Manage procurement and track vendor orders.</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[var(--emerald-dim)] flex items-center justify-center">
            <span className="material-symbols-outlined text-[var(--emerald)] text-[24px]">local_shipping</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] w-fit animate-in" style={{ animationDelay: '0.05s' }}>
          <button
            onClick={() => setActiveTab('new')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'new'
                ? 'bg-[var(--emerald)] text-white shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <span className="material-symbols-outlined mr-2 text-[11px]">add</span>
            New Order
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-[var(--emerald)] text-white shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            <span className="material-symbols-outlined mr-2 text-[11px]">history</span>
            Order History
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {orders.filter(o => o.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {/* ═══ TAB 1: New Order Form ═══ */}
        {activeTab === 'new' && (
          <div className="card p-0 overflow-hidden animate-in" style={{ animationDelay: '0.1s' }}>
            <div className="px-8 py-5 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--fg)]">New Purchase Order</h2>
                <p className="text-[12px] text-[var(--muted)] mt-0.5">Log procurement of raw materials, packaging, and supplies.</p>
              </div>
            </div>

            {message && (
              <div className={`mx-8 mt-6 p-4 rounded-lg text-sm font-bold ${
                message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    Vendor Name *
                  </label>
                  <input
                    required type="text" value={form.vendor_name}
                    onChange={e => handleChange('vendor_name', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                    placeholder="Supplier / company name"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    Contact Phone
                  </label>
                  <input
                    type="tel" value={form.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    Telegram Username
                  </label>
                  <input
                    type="text" value={form.telegram_username}
                    onChange={e => handleChange('telegram_username', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                    placeholder="@username (for auto-PO notifications)"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    Material Type *
                  </label>
                  <select
                    value={form.material_type}
                    onChange={e => handleChange('material_type', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition"
                  >
                    {MATERIAL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    Link to Product (optional)
                  </label>
                  <select
                    value={form.product_id}
                    onChange={e => handleChange('product_id', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition"
                  >
                    <option value="">— Not a product we sell —</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.package_size})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                    Payment Status
                  </label>
                  <select
                    value={form.payment_status}
                    onChange={e => handleChange('payment_status', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition"
                  >
                    <option>Unpaid</option>
                    <option>Partial Payment</option>
                    <option>Paid in Full</option>
                  </select>
                </div>
              </div>

              {/* Purchase Details */}
              <div className="mb-8 p-5 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                <h4 className="text-sm font-bold text-[var(--fg)] mb-4 border-b border-[var(--border)] pb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[var(--muted)]">receipt_long</span>
                  Purchase Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                      Description *
                    </label>
                    <input
                      required type="text" value={form.description}
                      onChange={e => handleChange('description', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                      placeholder="e.g. 50 kg Moringa Raw, 500 Plastic Bottles"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                      Quantity *
                    </label>
                    <input
                      required type="number" min="0.01" step="0.01" value={form.quantity}
                      onChange={e => handleChange('quantity', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                      placeholder="Qty"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                      Unit Price (ETB) *
                    </label>
                    <input
                      required type="number" min="0.01" step="0.01" value={form.unit_price}
                      onChange={e => handleChange('unit_price', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition placeholder-[var(--muted)]"
                      placeholder="ETB"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-center p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                  <span className="font-bold text-[var(--muted)]">Total Amount:</span>
                  <span className="text-2xl font-mono font-bold text-[var(--fg)]">
                    {form.totalAmount.toFixed(2)} ETB
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                  Additional Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => handleChange('notes', e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:border-[var(--emerald)] outline-none transition min-h-[100px] placeholder-[var(--muted)]"
                  placeholder="Invoice number, delivery date, driver name…"
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                <button
                  disabled={submitting} type="submit"
                  className="px-8 py-3 bg-[var(--emerald)] text-white rounded-xl font-bold hover:opacity-90 transition flex items-center gap-2 disabled:opacity-70"
                >
                  {submitting ? 'Saving…' : 'Record Purchase'}
                  <span className="material-symbols-outlined text-[18px]">save</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ═══ TAB 2: Order History ═══ */}
        {activeTab === 'history' && (
          <div className="space-y-4 animate-in" style={{ animationDelay: '0.1s' }}>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Pending', count: orders.filter(o => o.status === 'pending').length, color: 'text-white', bg: 'bg-amber-500 shadow-sm shadow-amber-500/20', icon: 'schedule' },
                { label: 'Approved', count: orders.filter(o => o.status === 'approved').length, color: 'text-white', bg: 'bg-blue-500 shadow-sm shadow-blue-500/20', icon: 'check' },
                { label: 'Received', count: orders.filter(o => o.status === 'received').length, color: 'text-white', bg: 'bg-emerald-500 shadow-sm shadow-emerald-500/20', icon: 'inventory_2' },
                { label: 'Cancelled', count: orders.filter(o => o.status === 'cancelled').length, color: 'text-white', bg: 'bg-red-500 shadow-sm shadow-red-500/20', icon: 'block' },
              ].map((s, i) => (
                <div key={s.label} className="card p-4 animate-in" style={{ animationDelay: `${0.05 * i}s` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.bg}`}>
                      <span className={`material-symbols-outlined text-[12px] ${s.color}`}>{s.icon}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide">{s.label}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[var(--fg)]">{s.count}</p>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="card p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex-1 min-w-[200px]">
                  <span className="material-symbols-outlined text-[var(--muted)] text-[12px]">search</span>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search vendor, item, PO number..."
                    className="w-full bg-transparent outline-none text-sm text-[var(--fg)] placeholder-[var(--muted)]"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] text-sm outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="received">Received</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Orders Table */}
            <div className="card overflow-hidden">
              {loading ? (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined animate-spin text-4xl text-[var(--muted)]">sync</span>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined text-5xl text-[var(--muted)] mb-3 block">inventory_2</span>
                  <p className="text-sm text-[var(--muted)]">No vendor orders found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">PO #</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Vendor</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Item</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Qty</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Price</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Product</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Status</th>
                        <th className="text-left px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Date</th>
                        <th className="text-right px-5 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => {
                        const sc = STATUS_CONFIG[order.status];
                        return (
                          <tr key={order.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
                            <td className="px-5 py-3.5 font-mono text-[12px] font-bold text-[var(--fg)]">{order.order_id}</td>
                            <td className="px-5 py-3.5 text-[var(--fg)]">{order.vendor_name}</td>
                            <td className="px-5 py-3.5 text-[var(--fg-secondary)] max-w-[200px] truncate">{order.item}</td>
                            <td className="px-5 py-3.5 text-[var(--fg)] font-mono">{order.amount}</td>
                            <td className="px-5 py-3.5 font-mono font-bold text-[var(--fg)]">{formatCurrency(order.price)}</td>
                            <td className="px-5 py-3.5">
                              {order.product_name ? (
                                <span className="text-[12px] font-bold text-[var(--emerald)] flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="material-symbols-outlined text-[10px] opacity-60">link</span>
                                  {order.product_name}
                                </span>
                              ) : (
                                <span className="text-[11px] text-[var(--muted)]">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${sc.bg} ${sc.text}`}>
                                {sc.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-[12px] text-[var(--muted)]">{formatDate(order.created_at)}</td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {order.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => setConfirmModal({ orderId: order.id, action: 'approved', orderRef: order.order_id })}
                                      className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[11px] font-bold hover:bg-blue-600 transition-colors"
                                    >
                                      <span className="material-symbols-outlined mr-1">check</span> Approve
                                    </button>
                                    <button
                                      onClick={() => setConfirmModal({ orderId: order.id, action: 'cancelled', orderRef: order.order_id })}
                                      className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[11px] font-bold hover:bg-red-600 transition-colors"
                                    >
                                      <span className="material-symbols-outlined mr-1">close</span> Cancel
                                    </button>
                                  </>
                                )}
                                {order.status === 'approved' && (
                                  <>
                                    <button
                                      onClick={() => setConfirmModal({ orderId: order.id, action: 'received', orderRef: order.order_id })}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition-colors"
                                    >
                                      <span className="material-symbols-outlined mr-1">inventory_2</span> Mark Received
                                    </button>
                                    <button
                                      onClick={() => setConfirmModal({ orderId: order.id, action: 'cancelled', orderRef: order.order_id })}
                                      className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[11px] font-bold hover:bg-red-600 transition-colors"
                                    >
                                      <span className="material-symbols-outlined mr-1">close</span> Cancel
                                    </button>
                                  </>
                                )}
                                {(order.status === 'received' || order.status === 'cancelled') && (
                                  <span className="text-[11px] text-[var(--muted)] italic">
                                    {order.status === 'received' && order.received_by_name
                                      ? `by ${order.received_by_name}`
                                      : 'No actions'}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Confirmation Modal ═══ */}
        {confirmModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => !actionLoading && setConfirmModal(null)}>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-[var(--fg)] mb-2">Confirm Action</h3>
              <p className="text-sm text-[var(--muted)] mb-1">
                Are you sure you want to <strong className="text-[var(--fg)]">{confirmModal.action}</strong> vendor order{' '}
                <strong className="text-[var(--fg)] font-mono">{confirmModal.orderRef}</strong>?
              </p>

              {confirmModal.action === 'received' && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-600 text-white border border-emerald-500/20">
                  <p className="text-[18px] text-emerald-500 font-medium">
                    <span className="material-symbols-outlined mr-1">info</span>
                    This will automatically add stock to inventory (if linked to a product) and record an expense.
                  </p>
                </div>
              )}

              {confirmModal.action === 'cancelled' && (
                <div className="mt-3 p-3 rounded-lg bg-red-600 text-white border border-red-500/20">
                  <p className="text-[18px] text-red-500 font-medium">
                    <span className="material-symbols-outlined mr-1">warning</span>
                    This action cannot be undone.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setConfirmModal(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border)] text-[var(--fg)] text-sm font-medium hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStatusChange}
                  disabled={actionLoading}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-bold transition-colors disabled:opacity-50 ${
                    confirmModal.action === 'cancelled' ? 'bg-red-500 hover:bg-red-600' :
                    confirmModal.action === 'received' ? 'bg-emerald-500 hover:bg-emerald-600' :
                    'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {actionLoading ? 'Processing...' : `Yes, ${confirmModal.action === 'approved' ? 'Approve' : confirmModal.action === 'received' ? 'Mark Received' : 'Cancel Order'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default VendorPurchasePage;



