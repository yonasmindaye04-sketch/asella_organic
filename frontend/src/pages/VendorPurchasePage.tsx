/**
 * VendorPurchasePage.tsx — FIXED
 *
 * BUG: Was sending to POST /api/orders with invalid source "Vendor_DB"
 *      and order_type "Vendor" — both fail CreateOrderSchema validation.
 * FIX: Now correctly sends to POST /api/vendor-orders using the proper
 *      VendorPurchaseSchema on the backend.
 */
import React, { useState } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

interface FormData {
  vendor_name:    string;
  phone:          string;
  material_type:  string;
  description:    string;
  quantity:       string;
  unit_price:     string;
  totalAmount:    number;
  payment_status: string;
  notes:          string;
}

const EMPTY: FormData = {
  vendor_name: '', phone: '', material_type: 'Raw Material',
  description: '', quantity: '', unit_price: '',
  totalAmount: 0, payment_status: 'Unpaid', notes: '',
};

const MATERIAL_TYPES = [
  'Raw Material', 'Bottles / Jars', 'Labels / Stickers',
  'Cartons / Boxes', 'Equipment', 'Other Supplies',
];

const VendorPurchasePage: React.FC = () => {
  const [form, setForm]           = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage]     = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

    const qty   = parseFloat(form.quantity);
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
      vendor_name:    form.vendor_name,
      phone:          form.phone || undefined,
      material_type:  form.material_type,
      description:    form.description,
      quantity:       qty,
      unit_price:     price,
      payment_status: form.payment_status as any,
      notes:          form.notes || undefined,
    });

    if (res.success) {
      setMessage({ type: 'success', text: '✅ Vendor purchase recorded successfully!' });
      setForm(EMPTY);
    } else {
      setMessage({ type: 'error', text: res.error ?? 'Failed to submit vendor purchase.' });
    }
    setSubmitting(false);
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#112415]">Vendor Purchase</h1>
              <p className="text-sm text-gray-500 mt-1">
                Log procurement of raw materials, packaging, and supplies.
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-[#e8f5e9] text-[#112415] flex items-center justify-center">
              <span className="material-symbols-outlined">local_shipping</span>
            </div>
          </div>

          {message && (
            <div className={`mx-8 mt-6 p-4 rounded-lg text-sm font-bold ${
              message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Vendor Name *
                </label>
                <input
                  required type="text" value={form.vendor_name}
                  onChange={e => handleChange('vendor_name', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                  placeholder="Supplier / company name"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Contact Phone
                </label>
                <input
                  type="tel" value={form.phone}
                  onChange={e => handleChange('phone', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Material Type *
                </label>
                <select
                  value={form.material_type}
                  onChange={e => handleChange('material_type', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                >
                  {MATERIAL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Payment Status
                </label>
                <select
                  value={form.payment_status}
                  onChange={e => handleChange('payment_status', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                >
                  <option>Unpaid</option>
                  <option>Partial Payment</option>
                  <option>Paid in Full</option>
                </select>
              </div>
            </div>

            {/* Purchase Details */}
            <div className="mb-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
              <h4 className="text-sm font-bold text-[#112415] mb-4 border-b pb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                Purchase Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Description *
                  </label>
                  <input
                    required type="text" value={form.description}
                    onChange={e => handleChange('description', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                    placeholder="e.g. 50 kg Moringa Raw, 500 Plastic Bottles"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Quantity *
                  </label>
                  <input
                    required type="number" min="0.01" step="0.01" value={form.quantity}
                    onChange={e => handleChange('quantity', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                    placeholder="Qty"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Unit Price (ETB) *
                  </label>
                  <input
                    required type="number" min="0.01" step="0.01" value={form.unit_price}
                    onChange={e => handleChange('unit_price', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition"
                    placeholder="ETB"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <span className="font-bold text-gray-700">Total Amount:</span>
                <span className="text-2xl font-mono font-bold text-[#112415]">
                  {form.totalAmount.toFixed(2)} ETB
                </span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Additional Notes
              </label>
              <textarea
                value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#4ade80] outline-none transition min-h-[100px]"
                placeholder="Invoice number, delivery date, driver name…"
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                disabled={submitting} type="submit"
                className="px-8 py-3 bg-[#112415] text-white rounded-xl font-bold hover:bg-[#1a3821] transition flex items-center gap-2 disabled:opacity-70"
              >
                {submitting ? 'Saving…' : 'Record Purchase'}
                <span className="material-symbols-outlined text-[18px]">save</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default VendorPurchasePage;