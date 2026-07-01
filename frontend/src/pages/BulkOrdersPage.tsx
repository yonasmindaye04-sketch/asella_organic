/**
 * frontend/src/pages/BulkOrdersPage.tsx
 */

import React, { useState } from 'react';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';
import { useProducts } from '../hooks/useProducts';
import { COUNTRY_CODES as _CC } from '../constants/countries';

const BulkOrdersPage: React.FC = () => {
  const { products, loading: productsLoading } = useProducts();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    city: 'Addis Ababa',
    location: '',
    channel: 'Walk-in',      // how the order came in -> maps to `source`
    orderType: 'pickup',     // fulfillment method -> sent as `order_type`
    notes: '',
    franchiseType: 'Cosmetics Store'
  });
  
  const [countryCode, setCountryCode] = useState('+251');
  const [items, setItems] = useState([{ name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const addItemRow = () => setItems([...items, { name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
  
  const updateItem = (index: number, field: string, value: string | number) => {
    setItems(prevItems => {
      const newItems = [...prevItems];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      const newItems = [...items];
      newItems.splice(index, 1);
      setItems(newItems);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      let receiptUrl = '';
      
      if (receiptFile) {
        const fileData = new FormData();
        fileData.append('receipt', receiptFile);
        const uploadRes = await api.post<any>('/api/upload/receipt', fileData);
        if (uploadRes.success && uploadRes.data) {
          receiptUrl = uploadRes.data.url;
        }
      }

      let finalNotes = `Franchise Type: ${formData.franchiseType}\n` + formData.notes;
      if (receiptUrl) finalNotes = finalNotes + `\nAttachment: ${receiptUrl}`;

      // Filter out empty items
      const validItems = items.filter(i => i.name && i.packageSize);

      if (validItems.length === 0) {
        setMessage({ type: 'error', text: 'Please add at least one valid item.' });
        setSubmitting(false);
        return;
      }

      const orderItems = validItems.map(item => ({ 
        product_id: `${item.name} (${item.packageSize})`, 
        name: item.name,
        package_size: item.packageSize,
        quantity: item.qty, 
        unit_price: 0, // Bulk orders might not use retail prices
        delivery_date: item.deliveryDate 
      }));

      const fullPhoneNumber = `${countryCode} ${formData.phone.trim()}`;

      const CHANNEL_TO_SOURCE: Record<string, string> = {
        'Walk-in': 'walk-in',
        'Phone':   'phone',
        'Online':  'website',
      };

      const orderData = {
        source: CHANNEL_TO_SOURCE[formData.channel] ?? 'other',
        customer_name: formData.name,
        phone: fullPhoneNumber,
        city: formData.city,
        location: formData.location,
        order_type: formData.orderType,
        notes: finalNotes,
        items: orderItems
      };

      const res = await api.post<any>('/api/orders', orderData);
      
      if (res.success && res.data) {
        setMessage({ type: 'success', text: `Bulk Order submitted successfully! Order ID: ${res.data.id}` });
        setFormData({ name: '', phone: '', city: 'Addis Ababa', location: '', channel: 'Walk-in', orderType: 'pickup', notes: '', franchiseType: 'Cosmetics Store' });
        setItems([{ name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
        setReceiptFile(null);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to submit order' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 font-sans w-full max-w-5xl mx-auto">
        <div className="bg-[#FAF9F6] dark:bg-[#121212] border border-[#d4ecd4] dark:border-border rounded-3xl w-full shadow-lg overflow-hidden animate-in fade-in duration-300 flex flex-col">
          
          {/* Header */}
          <div className="px-8 pt-8 pb-4 bg-[#FAF9F6] dark:bg-[#121212] flex justify-between items-start">
            <div>
              <h3 className="font-sans font-black text-3xl text-obsidian dark:text-white mb-1 tracking-tight">Franchise Partner Portal</h3>
              <p className="text-sm font-sans text-slate-500 dark:text-slate-300">Place bulk/wholesale requests for franchise stores.</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-parchment-mid dark:bg-[#1A301D] border border-highland-gold/30 text-highland-gold flex items-center justify-center">
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
          </div>

          <div className="px-8 pb-4">
            <hr className="border-[#d4ecd4] dark:border-border" />
          </div>

          {message && (
            <div className={`mx-8 mb-4 p-4 rounded-xl text-sm font-bold flex items-start gap-2 shadow-sm border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              <span className="material-symbols-outlined text-lg">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <div>{message.text}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 flex-1">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              
              <div className="col-span-1 md:col-span-1">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Company / Entity Name *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm" placeholder="Franchise business name" />
              </div>

              <div className="col-span-1 md:col-span-1">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Franchise Type</label>
                <select value={formData.franchiseType} onChange={e => setFormData({...formData, franchiseType: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                  <option>Cosmetics Store</option>
                  <option>Pharmacy</option>
                  <option>Retail Store</option>
                  <option>Distributor</option>
                </select>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Phone Number *</label>
                <div className="flex w-full">
                  <select 
                    value={countryCode} 
                    onChange={e => setCountryCode(e.target.value)} 
                    className="flex-shrink-0 px-3 py-3 bg-parchment-mid dark:bg-[#1A301D] border border-[#d4ecd4] dark:border-border border-r-0 rounded-l-xl text-obsidian dark:text-white text-sm font-bold font-mono outline-none cursor-pointer max-w-[150px] transition-all focus:border-highland-gold"
                  >
                    {_CC.map((country) => (
                      <option key={`${country.c}-${country.n}`} value={country.c}>
                        {country.f} {country.c} ({country.n})
                      </option>
                    ))}
                  </select>
                  <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-3 rounded-r-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm font-mono" placeholder="911 234 567" />
                </div>
              </div>

              <div className="col-span-1 md:col-span-1">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">City *</label>
                <select value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                  <option>Addis Ababa</option>
                  <option>Other Regions</option>
                  <option>Abroad</option>
                </select>
              </div>

              <div className="col-span-1 md:col-span-1">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Specific Location *</label>
                <input required type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm" placeholder="e.g. Bole, Lideta..." />
              </div>

              <div className="col-span-1 md:col-span-1">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Order Channel</label>
                <select value={formData.channel} onChange={e => setFormData({...formData, channel: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                  <option>Walk-in</option>
                  <option>Phone</option>
                  <option>Online</option>
                </select>
              </div>

              <div className="col-span-1 md:col-span-1">
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Fulfillment *</label>
                <select required value={formData.orderType} onChange={e => setFormData({...formData, orderType: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm">
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>

            </div>

            {/* Item Details */}
            <div className="mb-8">
              <h4 className="text-sm font-mono font-bold text-obsidian dark:text-white mb-4 flex items-center gap-2">
                Item Details
              </h4>
              
              {productsLoading ? (
                <p className="text-sm text-slate-500 mb-4">Loading products...</p>
              ) : (
                <div className="bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border rounded-2xl p-4 md:p-6 mb-4 space-y-4 shadow-sm">
                  {items.map((item, index) => {
                    const selectedProductVariants = products.filter(p => p.name === item.name);
                    const availableSizes = [...new Set(selectedProductVariants.map(p => p.package_size))];

                    return (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end relative border-b border-[#d4ecd4]/50 pb-4 last:border-b-0 last:pb-0">
                        
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-obsidian/70 dark:text-white/70 uppercase tracking-widest mb-1">Item *</label>
                          <select required value={item.name} onChange={e => {
                            updateItem(index, 'name', e.target.value);
                            updateItem(index, 'packageSize', ''); // Reset size when item changes
                          }} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:border-highland-gold text-sm outline-none">
                            <option value="">Select item...</option>
                            {Array.from(new Set(products.map(p => p.name))).map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono font-bold text-obsidian/70 dark:text-white/70 uppercase tracking-widest mb-1">Package Size *</label>
                          <select required value={item.packageSize} onChange={e => updateItem(index, 'packageSize', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:border-highland-gold text-sm outline-none">
                            <option value="">Select...</option>
                            {availableSizes.length > 0 ? (
                              availableSizes.map(size => (
                                <option key={size} value={size}>{size}</option>
                              ))
                            ) : (
                              <option disabled>Choose item first</option>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono font-bold text-obsidian/70 dark:text-white/70 uppercase tracking-widest mb-1">Qty *</label>
                          <input required type="number" min="1" value={item.qty} onChange={e => {
                            const v = parseInt(e.target.value);
                            updateItem(index, 'qty', isNaN(v) ? 1 : v);
                          }} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:border-highland-gold text-sm outline-none font-mono" />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono font-bold text-obsidian/70 dark:text-white/70 uppercase tracking-widest mb-1">Target Date</label>
                          <input type="date" value={item.deliveryDate} onChange={e => updateItem(index, 'deliveryDate', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:border-highland-gold text-sm outline-none font-mono" />
                        </div>

                        <div>
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItem(index)} className="w-full md:w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-100 transition-colors border border-red-200">
                              ✕
                            </button>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

              <button type="button" onClick={addItemRow} className="w-full py-3 border-2 border-dashed border-highland-gold text-highland-gold rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-parchment-mid dark:hover:bg-[#1A301D] hover:border-highland-gold-light transition-all flex items-center justify-center gap-2">
                <span className="text-lg leading-none font-sans">+</span> Add Another Item
              </button>
            </div>

            {/* Notes & Attachments */}
            <div className="grid grid-cols-1 gap-6 mb-4">
              <div>
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Contract / Notes / Instructions</label>
                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-sm min-h-[100px]" placeholder="Agreement details or instructions..." />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Attachment (Contract / ID / Receipt)</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="w-full text-xs text-slate-500 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-parchment-mid dark:file:bg-[#1A301D] file:text-obsidian hover:file:bg-[#d4ecd4] dark:hover:file:bg-[#2e7d32] transition-all border border-dashed border-[#d4ecd4] dark:border-border p-4 rounded-xl cursor-pointer" />
              </div>
            </div>

          </form>

          {/* Footer Submit */}
          <div className="bg-obsidian border-t border-highland-gold/10 px-8 py-5 flex items-center justify-end mt-auto">
            <button disabled={submitting || productsLoading} onClick={handleSubmit} className="px-8 py-3.5 bg-highland-gold hover:bg-highland-gold-light text-obsidian dark:text-white rounded-xl font-mono text-xs font-bold uppercase tracking-widest shadow-lg hover:shadow-highland-gold/25 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2">
              {submitting ? (
                <>Processing...</>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg leading-none">send</span>
                  Submit Bulk Order
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default BulkOrdersPage;