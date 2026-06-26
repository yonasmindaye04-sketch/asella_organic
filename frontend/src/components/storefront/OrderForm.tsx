import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { closeOrderModal } from '../../store/slices/uiSlice';
import { useToast } from '../ui/ToastProvider';
import { useProducts } from '../../hooks/useProducts';
import OrderReceipt from './OrderReceipt';
import type { ReceiptData } from './OrderReceipt';
import { api } from '../../services/api';

import { COUNTRY_CODES as _CC } from '../../constants/countries';

const OrderForm: React.FC = () => {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { orderModalOpen, orderFormMode, selectedProductName, selectedProductPrice } = useSelector(
    (state: RootState) => state.ui
  );
  const { products } = useProducts();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    city: 'Addis Ababa',
    location: '',
    order_type: 'delivery',
    source: 'website',
    notes: '',
    franchiseType: 'Cosmetics Store',
    gender: 'other',
    ageGroup: '25-34',
    referral_code: localStorage.getItem('referral_code') || ''
  });
  
  const [countryCode, setCountryCode] = useState('+251');
  const [items, setItems] = useState([{ name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (orderModalOpen) {
      if (orderFormMode === 'buy_now' && selectedProductName) {
        setItems([{ name: selectedProductName, packageSize: '', qty: 1, deliveryDate: '' }]);
      } else {
        setItems([{ name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
      }
    }
  }, [orderModalOpen, orderFormMode, selectedProductName]);

  const regionalFees: Record<string, number> = {
    'Addis Ababa': 200,
    'Adama': 200,
    'Bahir Dar': 300,
    'Hawassa': 250,
    'Other': 400,
  };

  if (!orderModalOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      dispatch(closeOrderModal());
    }
  };

  const deliveryFee = formData.order_type === 'delivery' ? regionalFees[formData.city] || 200 : 0;
  
  const itemsTotal = items.reduce((sum, item) => {
    const product = products.find(p => p.name === item.name && p.package_size === item.packageSize);
    const price = product ? Number(product.price) : 0;
    const qty = Number(item.qty) || 1;
    return sum + (price * qty);
  }, 0);

  const total = itemsTotal + deliveryFee;

  const addItemRow = () => {
    setItems([...items, { name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
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
    if (items.length === 0 || !items[0].name) return;
    
    setSubmitting(true);
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

      let finalNotes = formData.notes;
      if (orderFormMode === 'franchise') finalNotes = `Franchise Type: ${formData.franchiseType}\n` + finalNotes;
      if (orderFormMode === 'sales') finalNotes = `Gender: ${formData.gender}, Age: ${formData.ageGroup}\n` + finalNotes;
      if (receiptUrl) finalNotes += `\nReceipt: ${receiptUrl}`;

      const orderItems = items.map(item => {
        const product = products.find(p => p.name === item.name && p.package_size === item.packageSize);
        const qty = Number(item.qty);
        return { 
          name: item.name || 'Custom Item', 
          package_size: item.packageSize || 'Standard', 
          quantity: isNaN(qty) || qty < 1 ? 1 : qty, 
          unit_price: product ? Math.max(Number(product.price), 1) : 1
        };
      });

      // delivery_date must be YYYY-MM-DD or omitted entirely — empty string fails Zod
      const rawDate = items[0]?.deliveryDate;
      const topLevelDeliveryDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;

      // Bundle chosen country code prefix with the customer's phone entry
      const fullPhoneNumber = `${countryCode} ${formData.phone.trim()}`;

      const orderData: Record<string, unknown> = {
        source: formData.source,
        customer_name: formData.name,
        phone: fullPhoneNumber,
        city: formData.city,
        location: formData.location,
        order_type: formData.order_type,
        referral_code: formData.referral_code || undefined,
        notes: finalNotes || undefined,
        items: orderItems
      };
      
      if (topLevelDeliveryDate) {
        orderData.delivery_date = topLevelDeliveryDate;
      }

      const res = await api.post<any>('/api/orders', orderData);
      
      if (res.success && res.data) {
        toast('Order submitted successfully!', 'success');
        setReceiptData({
          orderId: res.data.id,
          customerName: formData.name,
          phone: fullPhoneNumber,
          city: formData.city,
          location: formData.location,
          orderType: formData.order_type,
          total: res.data.total,
          items: orderItems,
          date: new Date().toISOString(),
        });
      } else {
        const details = res.details ? '\n' + JSON.stringify(res.details) : '';
        toast((res.error || 'Failed to submit order') + details, 'error');
      }
    } catch (err: any) {
      toast(err.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getFormTitle = () => {
    if (orderFormMode === 'franchise') return 'Franchise Partner Portal';
    if (orderFormMode === 'sales') return 'New Sales Order';
    return 'Complete Your Order';
  };

  const getFormSubTitle = () => {
    if (orderFormMode === 'franchise') return 'Place bulk/wholesale requests for franchise stores.';
    if (orderFormMode === 'sales') return 'Establish a new retail client entry.';
    return `Ordering: ${selectedProductName}`;
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 overflow-y-auto" onClick={handleOverlayClick}>
      <div className="bg-parchment dark:bg-[#121212] border border-highland-gold/20 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between bg-parchment dark:bg-[#121212]">
          <div>
            <h3 className="font-display-lg font-black text-3xl text-obsidian dark:text-white mb-1">{getFormTitle()}</h3>
            <p className="text-base font-sans text-slate-700 dark:text-slate-300">{getFormSubTitle()}</p>
          </div>
          <button onClick={() => dispatch(closeOrderModal())} className="w-10 h-10 rounded-full hover:bg-parchment-mid text-obsidian dark:text-white flex items-center justify-center transition-all duration-200 border border-border shadow-sm">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="px-8 pb-4">
          <hr className="border-highland-gold/10" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 overflow-y-auto flex-1 font-sans">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            
            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Customer / Entity Name</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base" placeholder="Full name or company name" />
            </div>

            {orderFormMode === 'franchise' && (
              <div className="col-span-1 md:col-span-1">
                <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Franchise Type</label>
                <select value={formData.franchiseType} onChange={e => setFormData({...formData, franchiseType: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                  <option>Cosmetics Store</option>
                  <option>Pharmacy</option>
                  <option>Retail Store</option>
                  <option>Distributor</option>
                </select>
              </div>
            )}

            {orderFormMode === 'sales' && (
              <>
                <div className="col-span-1 md:col-span-1">
                  <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Gender</label>
                  <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                    <option value="">Select</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Age Group</label>
                  <select value={formData.ageGroup} onChange={e => setFormData({...formData, ageGroup: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                    <option>Under 18</option><option>19-25</option><option>26-30</option>
                    <option>31-36</option><option>37-41</option><option>42-48</option>
                  </select>
                </div>
              </>
            )}

            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Source</label>
              <select value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                <option value="website">Website / Online</option>
                <option value="phone">Phone</option>
                <option value="walk-in">Walk-in</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Order Type</label>
              <select value={formData.order_type} onChange={e => setFormData({...formData, order_type: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>
            
            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Referral Code (Optional)</label>
              <input type="text" value={formData.referral_code} onChange={e => setFormData({...formData, referral_code: e.target.value.toUpperCase()})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base" placeholder="e.g. BIRUK10" />
            </div>
            
            {orderFormMode === 'franchise' && <div className="hidden md:block"></div>}

            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Location</label>
              <select value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                <option>Addis Ababa</option>
                <option>Other Regions</option>
                <option>Abroad</option>
              </select>
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">City / Specific Area</label>
              <input required type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base" placeholder="e.g. Bole, Lideta..." />
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Phone Number</label>
              <div className="flex w-full">
                
                {/* Dynamic Country Code Dropdown Select Menu */}
                <select 
                  value={countryCode} 
                  onChange={e => setCountryCode(e.target.value)} 
                  className="flex-shrink-0 px-3 py-3 bg-parchment-mid dark:bg-[#1A301D] border border-border border-r-0 rounded-l-xl text-obsidian dark:text-white text-base font-bold font-mono outline-none cursor-pointer max-w-[150px] transition-all focus:border-highland-gold"
                >
                  {_CC.map((country) => (
                    <option key={`${country.c}-${country.n}`} value={country.c}>
                      {country.f} {country.c} ({country.n})
                    </option>
                  ))}
                </select>

                <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-3 rounded-r-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base font-mono" placeholder="911 234 567" />
              </div>
            </div>

          </div>

          {/* Item Details */}
          <div className="mb-8">
              <h4 className="text-base font-mono font-bold text-obsidian dark:text-white mb-4 flex items-center gap-2">
                Item Details
              </h4>
              
              <div className="bg-white dark:bg-obsidian border border-border rounded-2xl p-4 md:p-6 mb-4 space-y-4">
                {items.map((item, index) => {
                  const selectedProductVariants = products.filter(p => p.name === item.name);
                  const availableSizes = [...new Set(selectedProductVariants.map(p => p.package_size))];
                  
                  return (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end relative border-b border-border pb-4 last:border-b-0 last:pb-0">
                      <div>
                        <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1">Item</label>
                        <select required value={item.name} onChange={e => updateItem(index, 'name', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-border focus:border-highland-gold text-base outline-none">
                          <option value="">Select item...</option>
                          {Array.from(new Set(products.map(p => p.name))).map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1">Package Size</label>
                        <select required value={item.packageSize} onChange={e => updateItem(index, 'packageSize', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-border focus:border-highland-gold text-base outline-none">
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
                        <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1">Qty</label>
                        <input required type="number" min="1" value={item.qty} onChange={e => { const v = parseInt(e.target.value); updateItem(index, 'qty', isNaN(v) ? 1 : v); }} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-border focus:border-highland-gold text-base outline-none font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1">Delivery Date</label>
                        <input required type="date" value={item.deliveryDate} onChange={e => updateItem(index, 'deliveryDate', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-obsidian border border-border focus:border-highland-gold text-base outline-none font-mono" />
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

              <button type="button" onClick={addItemRow} className="w-full py-3 border-2 border-dashed border-highland-gold text-highland-gold rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-parchment-mid dark:hover:bg-[#1A301D] hover:border-highland-gold-light transition-all flex items-center justify-center gap-2">
                <span className="text-lg leading-none font-sans">+</span> Add Another Item
              </button>
            </div>

          <div className="bg-parchment-mid dark:bg-[#1A301D] border border-border rounded-xl p-5 mb-6">
            <p className="text-obsidian dark:text-white text-sm leading-relaxed">
              <strong>Delivery Fee Information:</strong><br />
              Addis Ababa: 200 ETB &nbsp;|&nbsp; Outside Addis Ababa: 300 ETB &nbsp;|&nbsp; International: Based on region
            </p>
          </div>
          
          <div className="mb-6">
            <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Order Notes / Special Instructions</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base min-h-[80px]" placeholder="Any specific requirements for your order..." />
          </div>
          
          <div className="mb-4">
            <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Attachment (Receipt / ID)</label>
            <input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-parchment-mid dark:file:bg-[#1A301D] file:text-obsidian dark:text-white hover:file:bg-[#d4ecd4] dark:hover:file:bg-[#2e7d32] transition-all border border-dashed border-border p-4 rounded-xl cursor-pointer" />
          </div>

        </form>

        {/* Footer Summary & Submit */}
        <div className="bg-obsidian border-t border-highland-gold/10 px-8 py-5 flex items-center justify-between relative z-10">
          <button disabled={submitting} type="submit" onClick={handleSubmit} className="px-8 py-3.5 bg-highland-gold hover:bg-highland-gold-light text-obsidian dark:text-white rounded-xl font-mono text-sm font-bold uppercase tracking-widest shadow-lg hover:shadow-highland-gold/25 transition-all duration-300 disabled:opacity-70">
            {submitting ? 'Processing...' : 'Submit Request'}
          </button>
          
          <div className="text-right">
            <div className="text-white text-lg md:text-xl font-mono font-bold leading-none">
              Total: <span className="text-highland-gold">{total.toLocaleString()} ETB</span>
            </div>
          </div>
        </div>

      </div>

      {/* Receipt modal */}
      {receiptData && (
        <OrderReceipt
          data={receiptData}
          onClose={() => {
            setReceiptData(null);
            dispatch(closeOrderModal());
          }}
        />
      )}
    </div>
  );
};

export default OrderForm;



