/**
 * ProductsPage.tsx — Combined Products + Inventory Management
 *
 * Two tabs, one page, one sidebar entry.
 *
 * TAB 1 — Products: create, edit, archive, delete products
 * TAB 2 — Stock: view quantities, adjust, movement log, stock requests
 *
 * Both tabs read/write the same `products` table via the backend.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

// ─── Types 

interface Product {
  id:                  string;
  name:                string;
  package_size:        string;
  price:               number;
  description:         string | null;
  image_url:           string | null;
  featured:            boolean;
  tag:                 string | null;
  inventory_quantity:  number;
  low_stock_threshold: number;
  active:              boolean;
}

interface StockItem {
  id:                  string;
  name:                string;
  package_size:        string;
  price:               number;
  current_quantity:    number;
  low_stock_threshold: number;
  tag:                 string | null;
  image_url:           string | null;
  stock_status:        'ok' | 'low' | 'critical' | 'out_of_stock';
  stock_value:         number;
  last_movement_at:    string | null;
  last_movement_type:  string | null;
}

interface StockSummary {
  total_products:    number;
  total_units:       number;
  total_stock_value: number;
  out_of_stock_count: number;
  critical_count:    number;
  low_count:         number;
  ok_count:          number;
  units_sold_30d:    number;
  units_received_30d: number;
}

interface Movement {
  id:             string;
  product_name:   string;
  package_size:   string;
  movement_type:  string;
  change_amount:  number;
  quantity_after: number;
  reason:         string;
  notes:          string | null;
  performed_by:   string;
  created_at:     string;
}

interface StockRequest {
  id:              string;
  item:            string;
  package_size:    string | null;
  qty_needed:      number;
  stock_available: number;
  delivery_date:   string | null;
  requested_by:    string | null;
  product_name:    string | null;
  current_stock:   number | null;
  status:          'pending' | 'ordered' | 'received' | 'cancelled';
  created_at:      string;
}



// ─── Constants 

const TAGS = ['Herbs', 'Traditional', 'Oils', 'Superfood', 'Uncategorized'];

const MOVEMENT_LABELS: Record<string, string> = {
  sale:               'Sale',
  purchase_received:  'Purchase In',
  adjustment:         'Adjustment',
  return:             'Return',
  damage_loss:        'Damage / Loss',
  initial_stock:      'Opening Stock',
};

const MOVEMENT_COLORS: Record<string, string> = {
  sale:               'text-red-600 bg-red-50',
  purchase_received:  'text-green-600 bg-green-50',
  adjustment:         'text-blue-600 bg-blue-50',
  return:             'text-purple-600 bg-purple-50',
  damage_loss:        'text-orange-600 bg-orange-50',
  initial_stock:      'text-gray-600 bg-gray-50',
};

const STATUS_STYLES: Record<StockItem['stock_status'], { badge: string; row: string; dot: string }> = {
  ok:           { badge: 'bg-green-100 text-green-800',   row: '',                    dot: 'bg-green-500'  },
  low:          { badge: 'bg-amber-100 text-amber-800',   row: 'bg-amber-50/40',      dot: 'bg-amber-500'  },
  critical:     { badge: 'bg-orange-100 text-orange-800', row: 'bg-orange-50/40',     dot: 'bg-orange-500' },
  out_of_stock: { badge: 'bg-red-100 text-red-800',       row: 'bg-red-50/50',        dot: 'bg-red-600'    },
};

const STATUS_LABELS: Record<StockItem['stock_status'], string> = {
  ok:           'OK',
  low:          'Low',
  critical:     'Critical',
  out_of_stock: 'Out of Stock',
};

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}
function fmtTime(s: string) {
  return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.error === 'string') {
      // If there are details, format them nicely
      if (obj.details && typeof obj.details === 'object') {
        const details = obj.details as Record<string, string[]>;
        const fieldErrors = Object.entries(details)
          .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
          .join(' | ');
        return fieldErrors || obj.error;
      }
      return obj.error;
    }
  }
  return fallback;
}

// ─── Sub-component: ProductFormModal 

type ProductDraft = Omit<Product, 'id'>;
const EMPTY_DRAFT: ProductDraft = {
  name: '', tag: 'Traditional', price: 0, active: true,
  image_url: '', package_size: '', description: '',
  inventory_quantity: 0, low_stock_threshold: 10, featured: false,
};

interface ProductFormModalProps {
  initial:    Partial<ProductDraft> & { id?: string };
  onClose:   () => void;
  onSaved:   () => void;
}

function ProductFormModal({ initial, onClose, onSaved }: ProductFormModalProps) {
  const [draft, setDraft] = useState<ProductDraft & { id?: string }>({ ...EMPTY_DRAFT, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const isEdit = !!draft.id;

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(draft.price);
    if (!price || price <= 0) { setError('Price must be greater than 0.'); return; }
    setSaving(true); setError(null);

    const payload: Record<string, unknown> = {
      name:                draft.name.trim(),
      package_size:        draft.package_size.trim(),
      price,
      tag:                 draft.tag?.trim()         || undefined,
      description:         draft.description?.trim() || undefined,
      image_url:           draft.image_url?.trim()   || undefined, // empty string stripped
      low_stock_threshold: Number(draft.low_stock_threshold) || 10,
      featured:            draft.featured,
    };
    if (!isEdit) payload['inventory_quantity'] = Number(draft.inventory_quantity) || 0;

    try {
      const res = isEdit
        ? await api.patch<Product>(`/api/products/${draft.id}`, payload)
        : await api.post<Product>('/api/products', payload);
      if (!res.success) throw new Error(res.error);
      onSaved();
    } catch (err) {
      setError(errMsg(err, 'Failed to save product.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-lg text-[#112415]">{isEdit ? 'Edit Product' : 'New Product'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 grid grid-cols-2 gap-5">
          {/* Name */}
          <div className="col-span-2">
            <label className="label">Product Name *</label>
            <input required value={draft.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Moringa Seed"
              className="input" />
          </div>

          {/* Category */}
          <div>
            <label className="label">Category</label>
            <select value={draft.tag ?? 'Traditional'} onChange={e => set('tag', e.target.value)} className="input">
              {TAGS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="label">Price (ETB) *</label>
            <input required type="number" min="1" step="0.01"
              value={draft.price === 0 ? '' : draft.price}
              onChange={e => set('price', parseFloat(e.target.value) || 0)}
              placeholder="e.g. 1000"
              className="input" />
          </div>

          {/* Package size */}
          <div>
            <label className="label">Package Size *</label>
            <input required value={draft.package_size}
              onChange={e => set('package_size', e.target.value)}
              placeholder="e.g. 100g, 30ml, 60 Tablet"
              className="input" />
          </div>

          {/* Initial stock — only on CREATE */}
          {!isEdit && (
            <div>
              <label className="label">Initial Stock (units)</label>
              <input type="number" min="0"
                value={draft.inventory_quantity}
                onChange={e => set('inventory_quantity', parseInt(e.target.value) || 0)}
                className="input" />
            </div>
          )}

          {/* Low stock threshold */}
          <div>
            <label className="label">Low Stock Alert Threshold</label>
            <input type="number" min="0"
              value={draft.low_stock_threshold}
              onChange={e => set('low_stock_threshold', parseInt(e.target.value) || 10)}
              className="input" />
          </div>

          {/* Image URL */}
          <div className="col-span-2">
            <label className="label">Image URL <span className="font-normal text-gray-400">(leave blank to skip)</span></label>
            <input type="text"
              value={draft.image_url ?? ''}
              onChange={e => set('image_url', e.target.value)}
              placeholder="/image/products/name.png  or  https://…"
              className="input" />
          </div>

          {/* Description */}
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea rows={2}
              value={draft.description ?? ''}
              onChange={e => set('description', e.target.value)}
              placeholder="Short description shown on the storefront"
              className="input resize-none" />
          </div>

          {/* Toggles */}
          <div className="col-span-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={draft.active}
                onChange={e => set('active', e.target.checked)}
                className="w-4 h-4 rounded accent-[#4ade80]" />
              <span className="text-sm font-medium text-gray-700">Active (show on storefront)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={draft.featured}
                onChange={e => set('featured', e.target.checked)}
                className="w-4 h-4 rounded accent-[#4ade80]" />
              <span className="text-sm font-medium text-gray-700">Featured (appears first)</span>
            </label>
          </div>

          {error && (
            <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 rounded-lg font-semibold text-[#112415] bg-[#4ade80] hover:bg-[#3bca6d] transition text-sm disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sub-component: DeleteModal (2FA) 

interface DeleteModalProps {
  product:  Product;
  onClose:  () => void;
  onDeleted: () => void;
}

function DeleteModal({ product, onClose, onDeleted }: DeleteModalProps) {
  const [code, setCode]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  async function handleDelete() {
    if (!code.trim()) { setError('Enter your 6-digit 2FA code.'); return; }
    setBusy(true); setError('');
    try {
      const BASE = (import.meta as { env: Record<string, string> }).env['VITE_API_URL'] ?? '';
      const res  = await fetch(`${BASE}/api/products/${product.id}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-2fa-token': code.trim() },
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      onDeleted();
    } catch (err) {
      setError(errMsg(err, 'Delete failed. Check your 2FA code.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-2xl">delete_forever</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Product</h2>
        <p className="text-sm text-gray-500 mb-6">
          Archive <strong>{product.name} ({product.package_size})</strong>?
          <br />Enter your 2FA code to confirm.
        </p>
        <input type="text" inputMode="numeric" maxLength={6} value={code}
          onChange={e => setCode(e.target.value)} autoFocus
          placeholder="6-digit code"
          className="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-red-500 outline-none mb-3" />
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 font-semibold text-gray-600 hover:bg-gray-50 transition text-sm">
            Cancel
          </button>
          <button onClick={() => void handleDelete()} disabled={busy || !code.trim()}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 transition text-sm">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: AdjustmentModal 

type AdjType = 'adjustment' | 'return' | 'damage_loss' | 'initial_stock';
const ADJ_TYPES: { key: AdjType; label: string; icon: string }[] = [
  { key: 'adjustment',    label: 'Manual Adjustment', icon: 'tune' },
  { key: 'return',        label: 'Customer Return',   icon: 'undo' },
  { key: 'damage_loss',   label: 'Damage / Loss',     icon: 'warning' },
  { key: 'initial_stock', label: 'Opening Balance',   icon: 'inventory' },
];

interface AdjModalProps {
  item:    StockItem;
  onClose: () => void;
  onSaved: () => void;
}

function AdjustmentModal({ item, onClose, onSaved }: AdjModalProps) {
  const [adjType,    setAdjType]  = useState<AdjType>('adjustment');
  const [direction,  setDir]      = useState<'in' | 'out'>('in');
  const [qty,        setQty]      = useState('');
  const [reason,     setReason]   = useState('');
  const [notes,      setNotes]    = useState('');
  const [saving,     setSaving]   = useState(false);
  const [error,      setError]    = useState('');

  const qtyNum      = parseInt(qty, 10) || 0;
  const changeAmt   = direction === 'out' ? -qtyNum : qtyNum;
  const preview     = item.current_quantity + changeAmt;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (qtyNum <= 0) { setError('Quantity must be greater than 0.'); return; }
    if (!reason.trim() || reason.trim().length < 3) { setError('Reason must be at least 3 characters.'); return; }
    setSaving(true); setError('');
    try {
      // Use api.post (proper Content-Type header) — NOT Redux apiFetch
      const payload = {
        product_id:    String(item.id),   // Ensure it's a string
        movement_type: adjType,
        change_amount: changeAmt,   // negative = remove, positive = add
        reason:        reason.trim(),
        notes:         notes.trim() || undefined,
      };
      console.log('Adjustment payload:', payload);
      const res = await api.post<unknown>('/api/stock/adjustment', payload);
      if (!res.success) throw res;
      onSaved();
    } catch (err) {
      setError(errMsg(err, 'Adjustment failed. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0d1a10]/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#1a2e1d] rounded-2xl shadow-2xl w-full max-w-md p-6 text-white">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">Adjust Stock</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Product chip */}
        <div className="bg-white/10 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white text-sm">{item.name}</p>
            <p className="text-gray-400 text-xs mt-0.5">{item.package_size}</p>
          </div>
          <div className="text-right">
            <p className="text-[#4ade80] font-mono font-bold text-lg">{item.current_quantity}</p>
            <p className="text-gray-400 text-xs">current stock</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Adjustment type */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Type</p>
            <div className="grid grid-cols-2 gap-2">
              {ADJ_TYPES.map(t => (
                <button key={t.key} type="button"
                  onClick={() => setAdjType(t.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition border ${
                    adjType === t.key
                      ? 'border-[#4ade80] bg-[#4ade80]/20 text-[#4ade80]'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/25'
                  }`}>
                  <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Direction</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDir('in')}
                className={`py-2.5 rounded-lg text-sm font-bold transition border ${
                  direction === 'in'
                    ? 'border-green-500 bg-green-500/20 text-green-400'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/25'
                }`}>
                ↑ Add Stock
              </button>
              <button type="button" onClick={() => setDir('out')}
                className={`py-2.5 rounded-lg text-sm font-bold transition border ${
                  direction === 'out'
                    ? 'border-red-500 bg-red-500/20 text-red-400'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/25'
                }`}>
                ↓ Remove Stock
              </button>
            </div>
          </div>

          {/* Quantity + preview */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Quantity *</label>
            <input type="number" min="1" value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="Enter quantity"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-[#4ade80] text-sm" />
            {qtyNum > 0 && (
              <p className="text-xs mt-1.5 text-gray-400">
                {item.current_quantity} →{' '}
                <span className={`font-bold ${preview < 0 ? 'text-red-400' : preview <= item.low_stock_threshold ? 'text-amber-400' : 'text-[#4ade80]'}`}>
                  {preview} units
                </span>
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Reason * (audit log)</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Monthly stock count, damaged in transit"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-[#4ade80] text-sm" />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Additional context"
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none focus:border-[#4ade80] text-sm" />
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700/50 text-red-300 rounded-lg px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/20 font-semibold text-gray-400 hover:bg-white/5 transition text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#4ade80] text-[#0d1a10] font-bold hover:bg-[#3bca6d] disabled:opacity-50 transition text-sm">
              {saving ? 'Saving…' : 'Save Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tab 1: Products 

interface ProductsTabProps {
  onReloadStock: () => void;
}

function ProductsTab({ onReloadStock }: ProductsTabProps) {
  const [products,  setProducts]   = useState<Product[]>([]);
  const [loading,   setLoading]    = useState(true);
  const [search,    setSearch]     = useState('');
  const [tagFilter, setTagFilter]  = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [formTarget, setFormTarget] = useState<(Partial<Product> & { id?: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const url = showArchived
        ? '/api/products?limit=500&active=false'
        : '/api/products?limit=500';
      const res = await api.get<Product[]>(url);
      if (res.success && res.data) setProducts(res.data);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  const tags = ['All', ...Array.from(new Set(products.map(p => p.tag ?? 'Uncategorized')))];

  const visible = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchTag    = tagFilter === 'All' || (p.tag ?? 'Uncategorized') === tagFilter;
    return matchSearch && matchTag;
  });

  async function handleToggleActive(p: Product) {
    await api.patch(`/api/products/${p.id}`, { active: !p.active } as Record<string, unknown>);
    await loadProducts();
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="flex-1 min-w-52 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <span className="material-symbols-outlined text-gray-400 text-[18px]">search</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full bg-transparent outline-none text-sm placeholder-gray-400" />
          {search && <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-600 text-xs">✕</button>}
        </div>

        {/* Tag filter pills */}
        <div className="flex gap-2 flex-wrap">
          {tags.map(t => (
            <button key={t} onClick={() => setTagFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                tagFilter === t
                  ? 'bg-[#112415] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Actions */}
        <button onClick={() => setShowArchived(s => !s)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
            showArchived ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          {showArchived ? 'Showing Archived' : 'Show Archived'}
        </button>

        <button onClick={() => setFormTarget({ ...EMPTY_DRAFT })}
          className="flex items-center gap-2 px-4 py-2 bg-[#112415] text-white rounded-xl text-sm font-bold hover:bg-[#1a3821] transition">
          <span className="material-symbols-outlined text-[16px]">add</span>Add Product
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">sync</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-5xl text-gray-200">inventory_2</span>
          <p className="text-gray-400 mt-3">No products found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {visible.map(p => (
            <div key={p.id}
              className={`border rounded-2xl overflow-hidden bg-white hover:shadow-lg transition group ${!p.active ? 'opacity-55' : ''}`}>
              {/* Image */}
              <div className="h-36 bg-gray-100 relative overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-gray-200">image</span>
                  </div>
                )}
                {/* Badges */}
                <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                  {!p.active && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 uppercase">Archived</span>
                  )}
                  {p.featured && p.active && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 uppercase">Featured</span>
                  )}
                </div>
                {/* Stock quick badge */}
                <div className="absolute bottom-2 right-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm ${
                    p.inventory_quantity === 0                    ? 'bg-red-600 text-white' :
                    p.inventory_quantity <= p.low_stock_threshold ? 'bg-amber-500 text-white' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {p.inventory_quantity} units
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                  {p.tag ?? 'Uncategorized'} · {p.package_size}
                </p>
                <h3 className="font-bold text-[#112415] text-sm leading-tight truncate" title={p.name}>{p.name}</h3>
                <p className="font-mono font-bold text-[#112415] text-sm mt-1">{Number(p.price).toLocaleString()} ETB</p>

                {/* Actions */}
                <div className="flex gap-1 mt-3 pt-2 border-t border-gray-100">
                  <button onClick={() => setFormTarget({ ...p })} title="Edit"
                    className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-gray-50 hover:bg-[#4ade80] hover:text-[#112415] text-gray-500 transition">
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                  <button onClick={() => void handleToggleActive(p)} title={p.active ? 'Archive' : 'Restore'}
                    className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-gray-50 hover:bg-amber-100 hover:text-amber-700 text-gray-500 transition">
                    <span className="material-symbols-outlined text-[15px]">{p.active ? 'visibility_off' : 'visibility'}</span>
                  </button>
                  <button onClick={() => setDeleteTarget(p)} title="Delete (2FA required)"
                    className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-gray-50 hover:bg-red-500 hover:text-white text-gray-500 transition">
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {formTarget && (
        <ProductFormModal
          initial={formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={() => { setFormTarget(null); void loadProducts(); onReloadStock(); }}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          product={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); void loadProducts(); onReloadStock(); }}
        />
      )}
    </div>
  );
}

// ─── Tab 2: Stock ─────────────────────────────────────────────────────────────

interface StockTabProps {
  reloadKey: number;
}

function StockTab({ reloadKey }: StockTabProps) {
  const [items,     setItems]    = useState<StockItem[]>([]);
  const [summary,   setSummary]  = useState<StockSummary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [requests,  setRequests] = useState<StockRequest[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [filter,    setFilter]   = useState<'all' | StockItem['stock_status']>('all');
  const [search,    setSearch]   = useState('');
  const [adjTarget, setAdjTarget] = useState<StockItem | null>(null);
  const [activeSection, setSection] = useState<'stock' | 'movements' | 'requests'>('stock');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRes, summaryRes, movRes, reqRes] = await Promise.all([
        api.get<StockItem[]>('/api/stock'),
        api.get<StockSummary>('/api/stock/summary'),
        api.get<Movement[]>('/api/stock/movements?limit=50'),
        api.get<StockRequest[]>('/api/stock/requests'),
      ]);
      if (stockRes.success   && stockRes.data)   setItems(stockRes.data);
      if (summaryRes.success && summaryRes.data)  setSummary(summaryRes.data);
      if (movRes.success     && movRes.data)      setMovements(movRes.data);
      if (reqRes.success     && reqRes.data)      setRequests(reqRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll, reloadKey]);

  async function handleRequestStatus(id: string, status: StockRequest['status']) {
    await api.patch(`/api/stock/requests/${id}/status`, { status });
    void loadAll();
  }

  const visible = items.filter(item => {
    const matchFilter = filter === 'all' || item.stock_status === filter;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div>
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Products', value: summary.total_products, icon: 'category', color: 'text-[#112415] bg-[#e8f5e9] border-[#c8e6c9]' },
            { label: 'Total Units',    value: Number(summary.total_units ?? 0).toLocaleString(), icon: 'inventory_2', color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { label: 'Stock Value',    value: `${Number(summary.total_stock_value ?? 0).toLocaleString()} ETB`, icon: 'payments', color: 'text-purple-700 bg-purple-50 border-purple-200' },
            { label: 'Out of Stock',   value: summary.out_of_stock_count, icon: 'report', color: 'text-red-700 bg-red-50 border-red-200' },
          ].map(k => (
            <div key={k.label} className={`border rounded-2xl p-4 ${k.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[20px]">{k.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{k.label}</span>
              </div>
              <p className="text-2xl font-bold font-mono">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sub-section tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {(['stock', 'movements', 'requests'] as const).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition ${
              activeSection === s ? 'bg-white text-[#112415] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {s === 'stock' ? 'Stock Levels' : s === 'movements' ? 'Movement Log' : 'Stock Requests'}
            {s === 'requests' && requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><span className="material-symbols-outlined animate-spin text-4xl text-gray-300">sync</span></div>
      ) : (
        <>
          {/* ── Stock Levels ── */}
          {activeSection === 'stock' && (
            <div>
              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm flex-1 min-w-44">
                  <span className="material-symbols-outlined text-gray-400 text-[16px]">search</span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                    className="w-full bg-transparent outline-none text-sm placeholder-gray-400" />
                </div>
                {(['all', 'ok', 'low', 'critical', 'out_of_stock'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                      filter === f ? 'bg-[#112415] text-white border-[#112415]' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {f === 'all' ? 'All' : f === 'ok' ? 'OK' : f === 'low' ? 'Low' : f === 'critical' ? 'Critical' : 'Out of Stock'}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-center">Current Qty</th>
                      <th className="px-4 py-3 text-center">Threshold</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Stock Value</th>
                      <th className="px-4 py-3 text-center">Last Movement</th>
                      <th className="px-4 py-3 text-center">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visible.map(item => {
                      const s = STATUS_STYLES[item.stock_status];
                      return (
                        <tr key={item.id} className={`hover:bg-gray-50 transition ${s.row}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                              <div>
                                <p className="font-semibold text-[#112415]">{item.name}</p>
                                <p className="text-xs text-gray-400">{item.package_size} · {item.tag ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-mono font-bold text-lg ${
                              item.stock_status === 'out_of_stock' ? 'text-red-600' :
                              item.stock_status === 'critical'     ? 'text-orange-600' :
                              item.stock_status === 'low'          ? 'text-amber-600' :
                              'text-[#112415]'
                            }`}>{item.current_quantity}</span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">{item.low_stock_threshold}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${s.badge}`}>
                              {STATUS_LABELS[item.stock_status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-gray-600">
                            {Number(item.stock_value).toLocaleString()} ETB
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">
                            <div>{fmtDate(item.last_movement_at)}</div>
                            {item.last_movement_type && (
                              <div className="text-[10px]">{MOVEMENT_LABELS[item.last_movement_type] ?? item.last_movement_type}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => setAdjTarget(item)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#e8f5e9] text-[#112415] text-xs font-bold hover:bg-[#4ade80] transition">
                              <span className="material-symbols-outlined text-[14px]">tune</span>
                              Adjust
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visible.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-sm">No products match your filter.</div>
                )}
              </div>
            </div>
          )}

          {/* ── Movement Log ── */}
          {activeSection === 'movements' && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Last {movements.length} movements
              </div>
              {movements.length === 0 ? (
                <div className="text-center py-12 text-gray-400">No movements recorded yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-center">Type</th>
                      <th className="px-4 py-3 text-center">Change</th>
                      <th className="px-4 py-3 text-center">After</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {movements.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtTime(m.created_at)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#112415] text-xs">{m.product_name}</p>
                          <p className="text-gray-400 text-xs">{m.package_size}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${MOVEMENT_COLORS[m.movement_type] ?? 'bg-gray-100 text-gray-600'}`}>
                            {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-mono font-bold text-sm ${m.change_amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {m.change_amount > 0 ? `+${m.change_amount}` : m.change_amount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-[#112415]">{m.quantity_after}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-48 truncate" title={m.reason}>{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Stock Requests ── */}
          {activeSection === 'requests' && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                <span>Stock Requests ({requests.length})</span>
                <span className="text-gray-400 font-normal">From secondary stores and staff</span>
              </div>
              {requests.length === 0 ? (
                <div className="text-center py-12 text-gray-400">No stock requests yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-center">Needed</th>
                      <th className="px-4 py-3 text-center">In Stock</th>
                      <th className="px-4 py-3 text-left">Requested By</th>
                      <th className="px-4 py-3 text-center">Needed By</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requests.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#112415] text-xs">{r.product_name ?? r.item}</p>
                          <p className="text-gray-400 text-xs">{r.package_size ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-[#112415]">{r.qty_needed}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{r.current_stock ?? r.stock_available}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{r.requested_by ?? '—'}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{fmtDate(r.delivery_date)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            r.status === 'pending'   ? 'bg-amber-100 text-amber-700' :
                            r.status === 'ordered'   ? 'bg-blue-100 text-blue-700'   :
                            r.status === 'received'  ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.status === 'pending' && (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => void handleRequestStatus(r.id, 'ordered')}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition">
                                Order
                              </button>
                              <button onClick={() => void handleRequestStatus(r.id, 'cancelled')}
                                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                                Cancel
                              </button>
                            </div>
                          )}
                          {r.status === 'ordered' && (
                            <button onClick={() => void handleRequestStatus(r.id, 'received')}
                              className="px-2 py-1 text-[10px] font-bold rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition">
                              Mark Received
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Adjustment Modal */}
      {adjTarget && (
        <AdjustmentModal
          item={adjTarget}
          onClose={() => setAdjTarget(null)}
          onSaved={() => { setAdjTarget(null); void loadAll(); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'products' | 'stock';

export default function ProductsPage() {
  const [tab,       setTab]       = useState<TabKey>('products');
  const [reloadKey, setReloadKey] = useState(0);   // bumped when Products tab changes stock

  // Shared inline styles as a single Tailwind class string approach — define in index.css:
  // .label { @apply block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5; }
  // .input  { @apply w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none text-sm; }

  return (
    <DashboardLayout>
      <style>{`
        .label { display:block; font-size:11px; font-weight:700; color:#4b5563; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
        .input  { width:100%; padding:10px 16px; border-radius:8px; border:1px solid #d1d5db; outline:none; font-size:14px; }
        .input:focus { border-color:#4ade80; }
      `}</style>

      <div className="max-w-7xl mx-auto py-6 px-4">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#112415]">Products</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your catalog and track inventory in one place.</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[#112415] p-1 rounded-2xl w-fit mb-7 shadow-lg">
          {([
            { key: 'products', label: 'Products',  icon: 'category' },
            { key: 'stock',    label: 'Stock',      icon: 'inventory' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition ${
                tab === t.key
                  ? 'bg-[#4ade80] text-[#112415] shadow-sm'
                  : 'text-[#4ade80]/70 hover:text-[#4ade80]'
              }`}>
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'products' && (
          <ProductsTab onReloadStock={() => setReloadKey(k => k + 1)} />
        )}
        {tab === 'stock' && (
          <StockTab reloadKey={reloadKey} />
        )}
      </div>
    </DashboardLayout>
  );
}