import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { closeOrderModal } from '../../store/slices/uiSlice';
import { useToast } from '../ui/ToastProvider';
import { useProducts } from '../../hooks/useProducts';
import OrderReceipt from './OrderReceipt';
import type { ReceiptData } from './OrderReceipt';
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
  { f: '🇸🇴', n: 'Somalia', c: '+252' }, { f: '🇸🇩', n: 'Sudan', c: '+249' },
  { f: '🇸🇸', n: 'South Sudan', c: '+211' }, { f: '🇩🇯', n: 'Djibouti', c: '+253' },
  { f: '🇪🇷', n: 'Eritrea', c: '+291' }, { f: '🇿🇦', n: 'South Africa', c: '+27' },
  { f: '🇬🇭', n: 'Ghana', c: '+233' }, { f: '🇪🇬', n: 'Egypt', c: '+20' },
  { f: '🇲🇦', n: 'Morocco', c: '+212' }, { f: '🇸🇦', n: 'Saudi Arabia', c: '+966' },
  { f: '🇦🇪', n: 'UAE', c: '+971' }, { f: '🇶🇦', n: 'Qatar', c: '+974' },
  { f: '🇰🇼', n: 'Kuwait', c: '+965' }, { f: '🇮🇷', n: 'Iran', c: '+98' },
  { f: '🇮🇶', n: 'Iraq', c: '+964' }, { f: '🇹🇷', n: 'Turkey', c: '+90' },
  { f: '🇮🇱', n: 'Israel', c: '+972' }, { f: '🇵🇰', n: 'Pakistan', c: '+92' },
  { f: '🇧🇩', n: 'Bangladesh', c: '+880' }, { f: '🇱🇰', n: 'Sri Lanka', c: '+94' },
  { f: '🇳🇵', n: 'Nepal', c: '+977' }, { f: '🇮🇩', n: 'Indonesia', c: '+62' },
  { f: '🇲🇾', n: 'Malaysia', c: '+60' }, { f: '🇹🇭', n: 'Thailand', c: '+66' },
  { f: '🇻🇳', n: 'Vietnam', c: '+84' }, { f: '🇵🇭', n: 'Philippines', c: '+63' },
  { f: '🇸🇬', n: 'Singapore', c: '+65' }, { f: '🇲🇽', n: 'Mexico', c: '+52' },
  { f: '🇦🇷', n: 'Argentina', c: '+54' }, { f: '🇨🇴', n: 'Colombia', c: '+57' },
  { f: '🇨🇱', n: 'Chile', c: '+56' }, { f: '🇳🇱', n: 'Netherlands', c: '+31' },
  { f: '🇧🇪', n: 'Belgium', c: '+32' }, { f: '🇵🇱', n: 'Poland', c: '+48' },
  { f: '🇸🇪', n: 'Sweden', c: '+46' }, { f: '🇳🇴', n: 'Norway', c: '+47' },
  { f: '🇩🇰', n: 'Denmark', c: '+45' }, { f: '🇫🇮', n: 'Finland', c: '+358' },
  { f: '🇨🇭', n: 'Switzerland', c: '+41' }, { f: '🇦🇹', n: 'Austria', c: '+43' },
  { f: '🇵🇹', n: 'Portugal', c: '+351' }, { f: '🇬🇷', n: 'Greece', c: '+30' },
  { f: '🇷🇴', n: 'Romania', c: '+40' }, { f: '🇨🇿', n: 'Czech Republic', c: '+420' },
  { f: '🇭🇺', n: 'Hungary', c: '+36' }, { f: '🇺🇦', n: 'Ukraine', c: '+380' },
  { f: '🇮🇪', n: 'Ireland', c: '+353' }, { f: '🇳🇿', n: 'New Zealand', c: '+64' },
  { f: '🇿🇲', n: 'Zambia', c: '+260' }, { f: '🇿🇼', n: 'Zimbabwe', c: '+263' },
  { f: '🇲🇿', n: 'Mozambique', c: '+258' }, { f: '🇦☉', n: 'Angola', c: '+244' },
  { f: '🇨🇩', n: 'DR Congo', c: '+243' }, { f: '🇨🇲', n: 'Cameroon', c: '+237' }
];

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
    notes: '',
    franchiseType: 'Cosmetics Store',
    gender: 'other',
    ageGroup: '25-34',
    referral_code: ''
  });
  
  const [countryCode, setCountryCode] = useState('+251');
  const [items, setItems] = useState([{ name: '', packageSize: '', qty: 1, deliveryDate: '' }]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const regionalFees: Record<string, number> = {
    'Addis Ababa': 150,
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

  const deliveryFee = formData.order_type === 'delivery' ? regionalFees[formData.city] || 150 : 0;
  
  const total = orderFormMode === 'buy_now' ? (selectedProductPrice || 0) + deliveryFee : 0;

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
    if (orderFormMode === 'buy_now' && !selectedProductName) return;
    
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

      let finalNotes = formData.notes;
      if (orderFormMode === 'franchise') finalNotes = `Franchise Type: ${formData.franchiseType}\n` + finalNotes;
      if (orderFormMode === 'sales') finalNotes = `Gender: ${formData.gender}, Age: ${formData.ageGroup}\n` + finalNotes;
      if (receiptUrl) finalNotes += `\nReceipt: ${receiptUrl}`;

      const orderItems = orderFormMode === 'buy_now' 
        ? [{ 
            name: selectedProductName || 'Unknown Product', 
            package_size: 'Standard', 
            quantity: 1, 
            unit_price: selectedProductPrice || 1 
          }]
        : items.map(item => {
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
        source: 'website' as const,
        customer_name: formData.name,
        phone: fullPhoneNumber,
        city: formData.city,
        location: formData.location,
        order_type: 'delivery' as const,
        referral_code: formData.referral_code || undefined,
        notes: finalNotes || undefined,
        items: orderItems
      };
      
      if (topLevelDeliveryDate) {
        orderData.delivery_date = topLevelDeliveryDate;
      }

      const res = await axios.post('/api/orders', orderData);
      
      if (res.data.success) {
        toast('Order submitted successfully!', 'success');
        setReceiptData({
          orderId: res.data.data.id,
          customerName: formData.name,
          phone: fullPhoneNumber,
          city: formData.city,
          location: formData.location,
          orderType: formData.order_type,
          total: res.data.data.total,
          items: orderItems,
          date: new Date().toISOString(),
        });
      } else {
        const details = res.data.details ? '\n' + JSON.stringify(res.data.details) : '';
        toast((res.data.error || 'Failed to submit order') + details, 'error');
      }
    } catch (err: any) {
      const details = err.response?.data?.details ? '\n' + JSON.stringify(err.response.data.details) : '';
      toast((err.response?.data?.error || 'An error occurred') + details, 'error');
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
      <div className="bg-parchment border border-highland-gold/20 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-4 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between bg-parchment">
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
              <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Order Type</label>
              <select value={formData.order_type} onChange={e => setFormData({...formData, order_type: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base">
                <option>Walk-in</option>
                <option>Phone</option>
                <option>Online</option>
                <option>Delivery</option>
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
                  className="flex-shrink-0 px-3 py-3 bg-parchment-mid border border-border border-r-0 rounded-l-xl text-obsidian dark:text-white text-base font-bold font-mono outline-none cursor-pointer max-w-[150px] transition-all focus:border-highland-gold"
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
          {orderFormMode !== 'buy_now' && (
            <div className="mb-8">
              <h4 className="text-base font-mono font-bold text-obsidian dark:text-white mb-4 flex items-center gap-2">
                Item Details
              </h4>
              
              <div className="bg-white dark:bg-obsidian border border-border rounded-2xl p-4 md:p-6 mb-4 space-y-4">
                {items.map((item, index) => {
                  const selectedProductVariants = products.filter(p => p.name === item.name);
                  const availableSizes = [...new Set(selectedProductVariants.map(p => p.package_size))];
                  
                  return (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end relative border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
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

              <button type="button" onClick={addItemRow} className="w-full py-3 border-2 border-dashed border-highland-gold text-highland-gold rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-parchment-mid hover:border-highland-gold-light transition-all flex items-center justify-center gap-2">
                <span className="text-lg leading-none font-sans">+</span> Add Another Item
              </button>
            </div>
          )}

          <div className="bg-parchment-mid border border-border rounded-xl p-5 mb-6">
            <p className="text-obsidian dark:text-white text-sm leading-relaxed">
              <strong>Delivery Fee Information:</strong><br />
              Addis Ababa: 150–200 ETB &nbsp;|&nbsp; Outside Addis Ababa: 300 ETB &nbsp;|&nbsp; International: Based on region
            </p>
          </div>
          
          <div className="mb-6">
            <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Order Notes / Special Instructions</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white dark:bg-obsidian border border-border focus:outline-none focus:border-highland-gold focus:ring-1 focus:ring-highland-gold transition-all text-base min-h-[80px]" placeholder="Any specific requirements for your order..." />
          </div>
          
          <div className="mb-4">
            <label className="block text-xs font-mono font-bold text-obsidian dark:text-white uppercase tracking-widest mb-1.5 ml-1">Attachment (Receipt / ID)</label>
            <input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-parchment-mid file:text-obsidian dark:text-white hover:file:bg-[#d4ecd4] transition-all border border-dashed border-border p-4 rounded-xl cursor-pointer" />
          </div>

        </form>

        {/* Footer Summary & Submit */}
        <div className="bg-obsidian border-t border-highland-gold/10 px-8 py-5 flex items-center justify-between relative z-10">
          <button disabled={submitting} type="submit" onClick={handleSubmit} className="px-8 py-3.5 bg-highland-gold hover:bg-highland-gold-light text-obsidian dark:text-white rounded-xl font-mono text-sm font-bold uppercase tracking-widest shadow-lg hover:shadow-highland-gold/25 transition-all duration-300 disabled:opacity-70">
            {submitting ? 'Processing...' : 'Submit Request'}
          </button>
          
          <div className="text-right">
            {orderFormMode === 'buy_now' && (
              <div className="text-white text-lg md:text-xl font-mono font-bold leading-none">
                Total: <span className="text-highland-gold">{total.toLocaleString()} ETB</span>
              </div>
            )}
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

