/**
 * frontend/src/pages/StockAlertPage.tsx
 */
import { useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { api } from '../services/api';

interface Form {
  product_id:      string;
  product_name:    string;
  package_size:    string;
  stock_remaining: number | '';
  qty_needed:      number | '';
  delivery_date:   string;
  requested_by:    string;
  notes:           string;
}

const EMPTY: Form = {
  product_id: '', product_name: '', package_size: '',
  stock_remaining: '', qty_needed: '', delivery_date: '',
  requested_by: '', notes: '',
};

export default function StockAlertPage() {
  const { products, loading: productsLoading } = useProducts();
  const [form, setForm]           = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]     = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.product_id) { setError('Please select a product and size.'); return; }
    if (!form.qty_needed || Number(form.qty_needed) <= 0) {
      setError('Quantity needed must be greater than 0.'); return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<any>('/api/stock/request', {
        product_id:      form.product_id,
        item:            form.product_name,
        package_size:    form.package_size,
        stock_available: Number(form.stock_remaining) || 0,
        qty_needed:      Number(form.qty_needed),
        delivery_date:   form.delivery_date || undefined,
        requested_by:    form.requested_by  || undefined,
        notes:           form.notes         || undefined,
      });

      if (!res.success) throw new Error(res.error ?? 'Submission failed');

      setSuccess(`Stock alert sent for ${form.product_name} (${form.package_size}). Admin has been notified via Telegram.`);
      setForm(EMPTY);
    } catch (err: any) {
      setError(err?.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedProduct = products.find(p => p.id === form.product_id);
  const threshold = selectedProduct?.low_stock_threshold ?? 10;
  const qty = selectedProduct?.inventory_quantity ?? 0;

  const stockBadgeColor =
    !selectedProduct             ? '' :
    qty === 0                    ? 'bg-red-50 text-red-700 border-red-200' :
    qty <= threshold / 2         ? 'bg-orange-50 text-orange-700 border-orange-200' :
    qty <= threshold             ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                   'bg-green-50 text-green-700 border-green-200';

  const selectedProductVariants = products.filter(p => p.name === form.product_name);
  const availableSizes = [...new Set(selectedProductVariants.map(p => p.package_size))];

  return (
    <div className="p-4 md:p-8 font-sans w-full max-w-5xl mx-auto">
      <div className="bg-[#FAF9F6] border border-[#d4ecd4] rounded-3xl w-full shadow-lg overflow-hidden animate-in fade-in duration-300 flex flex-col">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 bg-[#FAF9F6] flex justify-between items-start">
          <div>
             <h3 className="font-sans font-black text-3xl text-obsidian mb-1 tracking-tight">Stock Alert</h3>
             <p className="text-sm font-sans text-slate-500">
              Running low on a product? Submit a restock request. The main warehouse admin will be notified immediately via Telegram and in-app.
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined">warning</span>
          </div>
        </div>

        <div className="px-8 pb-4">
          <hr className="border-[#d4ecd4]" />
        </div>

        {success && (
          <div className="mx-8 mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            {success}
          </div>
        )}
        {error && (
          <div className="mx-8 mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-lg">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-8 pb-8 flex-1 flex flex-col">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            
            {/* Product & Size Selection (matches new inline structure) */}
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Product *</label>
              <select 
                required 
                value={form.product_name} 
                onChange={e => setForm(f => ({ ...f, product_name: e.target.value, package_size: '', product_id: '', stock_remaining: '' }))} 
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all text-sm"
              >
                <option value="">— Select product —</option>
                {Array.from(new Set(products.map(p => p.name))).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Package Size *</label>
              <select 
                required 
                value={form.package_size} 
                onChange={e => {
                  const size = e.target.value;
                  const variant = products.find(p => p.name === form.product_name && p.package_size === size);
                  setForm(f => ({
                    ...f,
                    package_size: size,
                    product_id: variant?.id ?? '',
                    stock_remaining: variant?.inventory_quantity ?? ''
                  }));
                }} 
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all text-sm"
              >
                <option value="">— Select size —</option>
                {availableSizes.length > 0 ? (
                  availableSizes.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))
                ) : (
                  <option disabled>Select product first</option>
                )}
              </select>
            </div>

            {/* Stock Remaining & Current Status */}
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">
                Stock Remaining <span className="font-normal text-slate-400 normal-case">(auto-filled)</span>
              </label>
              <div className="relative">
                <input
                  type="number" value={form.stock_remaining} readOnly
                  className="w-full border border-[#d4ecd4] rounded-xl px-4 py-3 text-sm bg-slate-50 text-slate-500 cursor-not-allowed font-mono"
                  placeholder="0"
                />
                {selectedProduct && (
                  <div className={`absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${stockBadgeColor}`}>
                    {qty === 0 ? 'OUT OF STOCK' : qty <= threshold ? 'LOW STOCK' : 'IN STOCK'}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Quantity Needed *</label>
              <input
                type="number" min={1} required
                value={form.qty_needed}
                onChange={e => setForm(f => ({ ...f, qty_needed: Number(e.target.value) }))}
                placeholder="e.g. 50"
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all text-sm font-mono"
              />
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Needed By (date)</label>
              <input
                type="date"
                value={form.delivery_date}
                onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all text-sm font-mono"
              />
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Requested By</label>
              <input
                type="text"
                value={form.requested_by}
                onChange={e => setForm(f => ({ ...f, requested_by: e.target.value }))}
                placeholder="Your name or store name"
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all text-sm"
              />
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Notes / Instructions</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Urgency, preferred supplier, delivery instructions…"
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all text-sm min-h-[80px]"
              />
            </div>

          </div>

          {/* Footer Submit */}
          <div className="bg-obsidian border border-obsidian rounded-xl px-8 py-5 flex items-center justify-end mt-auto -mx-8 -mb-8 rounded-t-none">
            <button
              type="submit"
              disabled={submitting || productsLoading}
              className="px-8 py-3.5 bg-amber-400 hover:bg-amber-300 text-obsidian rounded-xl font-mono text-xs font-bold uppercase tracking-widest shadow-lg hover:shadow-amber-400/25 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg leading-none">send</span>
              {submitting ? 'Sending alert…' : 'Send Stock Alert'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}