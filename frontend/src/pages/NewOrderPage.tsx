/**
 * frontend/src/pages/NewOrderPage.tsx
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import axios from 'axios';

// ── FLAG COUNTRY CODE DATA ──────────────────────────────────────
const _CC = [
  { f: '🇪🇹', n: 'Ethiopia', c: '+251' }, { f: '🇺🇸', n: 'United States', c: '+1' },
  { f: '🇬🇧', n: 'United Kingdom', c: '+44' }, { f: '🇨🇦', n: 'Canada', c: '+1' },
  { f: '🇦🇺', n: 'Australia', c: '+61' }, { f: '🇩🇪', n: 'Germany', c: '+49' },
  { f: '🇫🇷', n: 'France', c: '+33' }, { f: '🇮🇹', n: 'Italy', c: '+39' },
  { f: '🇪🇸', n: 'Spain', c: '+34' }, { f: '🇨🇳', n: 'China', c: '+86' },
  { f: '🇮🇳', n: 'India', c: '+91' }, { f: '🇯🇵', n: 'Japan', c: '+81' },
  { f: '🇰🇷', n: 'South Korea', c: '+82' }, { f: '🇧🇷', n: 'Brazil', c: '+55' },
  { f: '🇷🇺', n: 'Russia', c: '+7' }, { f: '🇳🇬', n: 'Nigeria', c: '+234' },
  { f: '🇰🇪', n: 'Kenya', c: '+254' }, { f: '🇹🇿', n: 'Tanzania', c: '+255' },
  { f: '🇺🇬', n: 'Uganda', c: '+256' }, { f: '🇷🇼', n: 'Rwanda', c: '+250' },
  { f: '🇿🇦', n: 'South Africa', c: '+27' }, { f: '🇦🇪', n: 'UAE', c: '+971' },
];

interface OrderItem {
  product_id:   string;
  name:         string;
  package_size: string;
  quantity:     number;
  unit_price:   number;
}

interface OrderForm {
  customer_name: string;
  phone:         string;
  city:          string;
  location:      string;
  source:        string;
  order_type:    string;
  referral_code: string;
  gender:        string;
  age_group:     string;
  notes:         string;
  items:         OrderItem[];
}

const EMPTY_ITEM: OrderItem = {
  product_id:   '',
  name:         '',
  package_size: '',
  quantity:     1,
  unit_price:   0,
};

const SOURCES = ['website', 'phone', 'walk-in', 'instagram', 'facebook', 'other'];
const AGE_GROUPS = ['under-18', '18-24', '25-34', '35-44', '45-54', '55+'];
const CITIES = ['Addis Ababa', 'Adama', 'Dire Dawa', 'Bahir Dar', 'Hawassa', 'Mekele', 'Abroad', 'Other Regions'];

export default function NewOrderPage() {
  const navigate = useNavigate();
  const { products, loading: productsLoading } = useProducts();

  const [form, setForm] = useState<OrderForm>({
    customer_name: '',
    phone:         '',
    city:          'Addis Ababa',
    location:      '',
    source:        'phone',
    order_type:    'delivery',
    referral_code: '',
    gender:        '',
    age_group:     '',
    notes:         '',
    items:         [{ ...EMPTY_ITEM }],
  });

  const [countryCode, setCountryCode] = useState('+251');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    setForm(f => {
      const items = [...f.items];
      items[index] = { ...items[index]!, [field]: value };
      return { ...f, items };
    });
  }



  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  }

  function removeItem(index: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  const total = form.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const zeroPriceItems = form.items.filter(i => i.unit_price === 0);
    if (zeroPriceItems.length > 0) {
      setError(
        `Price is 0 for: ${zeroPriceItems.map(i => i.name || 'unnamed item').join(', ')}. ` +
        `Please select a product or enter a price manually.`
      );
      return;
    }

    setSubmitting(true);
    try {
      let receiptUrl = '';
      
      if (receiptFile) {
        const fileData = new FormData();
        fileData.append('receipt', receiptFile);
        const uploadRes = await axios.post('/api/upload/receipt', fileData);
        if (uploadRes.data.success) {
          receiptUrl = uploadRes.data.data.url;
        }
      }

      let finalNotes = form.notes || '';
      if (receiptUrl) finalNotes = finalNotes + `\nReceipt: ${receiptUrl}`;

      const fullPhoneNumber = `${countryCode} ${form.phone.trim()}`;

      const payload = {
        customer_name: form.customer_name,
        phone:         fullPhoneNumber,
        city:          form.city,
        location:      form.location,
        source:        form.source,
        order_type:    form.order_type,
        referral_code: form.referral_code || undefined,
        gender:        form.gender        || undefined,
        age_group:     form.age_group     || undefined,
        notes:         finalNotes.trim()  || undefined,
        items: form.items.map(item => ({
          name:         item.name,
          package_size: item.package_size,
          quantity:     item.quantity,
          unit_price:   item.unit_price,
          product_id:   item.product_id,
        })),
      };

      const { data } = await axios.post('/api/orders', payload);
      navigate(`/dashboard/tracking`, {
        state: { successMessage: `Order ${data.data.id} created — Total: ETB ${total.toLocaleString()}` }
      });
    } catch (err: any) {
      console.error(err);
      const errorObj = err.response?.data;
      setError(
        errorObj?.details
          ? Object.values(errorObj.details.fieldErrors ?? {}).flat().join(', ')
          : errorObj?.error ?? 'Failed to create order. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 md:p-8 font-sans w-full max-w-5xl mx-auto">
      <div className="bg-[#FAF9F6] border border-[#d4ecd4] rounded-3xl w-full shadow-lg overflow-hidden animate-in fade-in duration-300 flex flex-col">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 bg-[#FAF9F6]">
          <h3 className="font-sans font-black text-3xl text-obsidian mb-1 tracking-tight">New Sales Order</h3>
          <p className="text-sm font-sans text-slate-500">Stock deduction happens automatically when order status reaches Delivered.</p>
        </div>

        <div className="px-8 pb-4">
          <hr className="border-[#d4ecd4]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 flex-1">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            
            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Customer Name *</label>
              <input required type="text" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm" placeholder="Full name" />
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Phone Number *</label>
              <div className="flex w-full">
                <select 
                  value={countryCode} 
                  onChange={e => setCountryCode(e.target.value)} 
                  className="flex-shrink-0 px-3 py-3 bg-parchment-mid border border-[#d4ecd4] border-r-0 rounded-l-xl text-obsidian text-sm font-bold font-mono outline-none cursor-pointer max-w-[150px] transition-all focus:border-highland-gold"
                >
                  {_CC.map((country) => (
                    <option key={`${country.c}-${country.n}`} value={country.c}>
                      {country.f} {country.c}
                    </option>
                  ))}
                </select>
                <input required type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-4 py-3 rounded-r-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm font-mono" placeholder="911 234 567" />
              </div>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">City *</label>
              <select required value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                <option value="">— Select city —</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Location / Address *</label>
              <input required type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm" placeholder="e.g. Bole, near airport..." />
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Source</label>
              <select value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4 col-span-1 md:col-span-1">
              <div>
                <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Gender</label>
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Age Group</label>
                <select value={form.age_group} onChange={e => setForm({...form, age_group: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                  <option value="">—</option>
                  {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Order Type</label>
              <select value={form.order_type} onChange={e => setForm({...form, order_type: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Referral Code</label>
              <input type="text" value={form.referral_code} onChange={e => setForm({...form, referral_code: e.target.value.toUpperCase()})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm" placeholder="e.g. BIRUK10" />
            </div>

          </div>

          {/* Item Details */}
          <div className="mb-8">
            <h4 className="text-sm font-mono font-bold text-obsidian mb-4 flex items-center gap-2">
              Order Items
            </h4>
            
            {productsLoading ? (
              <p className="text-sm text-slate-500 mb-4">Loading products...</p>
            ) : (
              <div className="bg-white border border-[#d4ecd4] rounded-2xl p-4 md:p-6 mb-4 space-y-4 shadow-sm">
                {form.items.map((item, index) => {
                  const selectedProductVariants = products.filter(p => p.name === item.name);
                  const availableSizes = [...new Set(selectedProductVariants.map(p => p.package_size))];

                  return (
                    <div key={index} className="grid grid-cols-12 gap-3 items-end relative border-b border-[#d4ecd4]/50 pb-4 last:border-b-0 last:pb-0">
                      
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-[10px] font-mono font-bold text-obsidian/70 uppercase tracking-widest mb-1">Item *</label>
                        <select required value={item.name} onChange={e => {
                          const newName = e.target.value;
                          updateItem(index, 'name', newName);
                          updateItem(index, 'package_size', ''); // Reset size
                          updateItem(index, 'product_id', '');
                          updateItem(index, 'unit_price', 0);
                        }} className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#d4ecd4] focus:border-highland-gold focus:ring-1 focus:ring-highland-gold text-sm outline-none transition-all">
                          <option value="">— Select Item —</option>
                          {Array.from(new Set(products.map(p => p.name))).map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-2">
                        <label className="block text-[10px] font-mono font-bold text-obsidian/70 uppercase tracking-widest mb-1">Size *</label>
                        <select required value={item.package_size} onChange={e => {
                          const size = e.target.value;
                          const variant = products.find(p => p.name === item.name && p.package_size === size);
                          updateItem(index, 'package_size', size);
                          if (variant) {
                            updateItem(index, 'product_id', variant.id);
                            updateItem(index, 'unit_price', Number(variant.price));
                          }
                        }} className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#d4ecd4] focus:border-highland-gold focus:ring-1 focus:ring-highland-gold text-sm outline-none transition-all">
                          <option value="">— Size —</option>
                          {availableSizes.map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-[10px] font-mono font-bold text-obsidian/70 uppercase tracking-widest mb-1">Qty *</label>
                        <input required type="number" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', Number(e.target.value))} className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#d4ecd4] focus:border-highland-gold focus:ring-1 focus:ring-highland-gold text-sm outline-none font-mono transition-all" />
                      </div>

                      <div className="col-span-6 md:col-span-3">
                        <label className="block text-[10px] font-mono font-bold text-obsidian/70 uppercase tracking-widest mb-1">Price (ETB) *</label>
                        <input required type="number" min="0" step="0.01" value={item.unit_price === 0 ? '' : item.unit_price} onChange={e => updateItem(index, 'unit_price', Number(e.target.value))} placeholder="Auto" className={`w-full px-3 py-2.5 rounded-lg bg-white border focus:border-highland-gold focus:ring-1 focus:ring-highland-gold text-sm outline-none font-mono transition-all ${item.product_id && item.unit_price === 0 ? 'border-amber-400 bg-amber-50' : 'border-[#d4ecd4]'}`} />
                      </div>

                      <div className="col-span-12 md:col-span-2 flex items-center justify-between md:justify-end gap-2 h-[42px]">
                        <div className="md:hidden">
                           <span className="text-xs text-slate-500 font-mono">Subtotal: {(item.unit_price * item.quantity).toLocaleString()}</span>
                        </div>
                        {form.items.length > 1 && (
                          <button type="button" onClick={() => removeItem(index)} className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors border border-red-200 shadow-sm" title="Remove Item">
                            ✕
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

            <button type="button" onClick={addItem} className="w-full py-3 border-2 border-dashed border-highland-gold text-highland-gold rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-parchment-mid hover:border-highland-gold-light transition-all flex items-center justify-center gap-2">
              <span className="text-lg leading-none font-sans">+</span> Add Another Item
            </button>
          </div>

          {/* Notes & Attachments */}
          <div className="grid grid-cols-1 gap-6 mb-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Notes (Optional)</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white border border-[#d4ecd4] focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm min-h-[80px]" placeholder="Any specific requirements for your order..." />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-obsidian uppercase tracking-widest mb-1.5 ml-1">Attachment (Receipt / ID)</label>
              <input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-parchment-mid file:text-obsidian hover:file:bg-[#d4ecd4] transition-all border border-dashed border-[#d4ecd4] p-4 rounded-xl cursor-pointer" />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2 shadow-sm">
              <span className="material-symbols-outlined text-lg">error</span>
              <div>{error}</div>
            </div>
          )}

        </form>

        {/* Footer Summary & Submit */}
        <div className="bg-obsidian border-t border-highland-gold/10 px-8 py-5 flex items-center justify-between mt-auto">
          <button disabled={submitting || productsLoading} onClick={handleSubmit} className="px-8 py-3.5 bg-highland-gold hover:bg-highland-gold-light text-obsidian rounded-xl font-mono text-xs font-bold uppercase tracking-widest shadow-lg hover:shadow-highland-gold/25 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2">
            {submitting ? (
              <>Processing...</>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg leading-none">check_circle</span>
                Create Order
              </>
            )}
          </button>
          
          <div className="text-right">
            <div className="text-white text-lg md:text-xl font-mono font-bold leading-none">
              Total: <span className="text-highland-gold">{total.toLocaleString()} ETB</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
