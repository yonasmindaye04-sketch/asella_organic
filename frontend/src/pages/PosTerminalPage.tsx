import React, { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  DotIcon,
  ShoppingCart,
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  Check,
  User,
  UserPlus,
  Edit3,
  ShoppingBag,
  RotateCcw,
} from 'lucide-react';
import type { RootState } from '../store';
import { useGroupedProducts, type GroupedProduct, type Variant } from '../hooks/useProducts';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';
import OrderReceipt, { type ReceiptData } from '../components/storefront/OrderReceipt';

interface CartItem {
  productId: string;
  name: string;
  packageSize: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
  stockAvailable: number;
}

interface CustomerInfo {
  id?: string;
  name: string;
  phone: string;
  city: string;
  location: string;
  gender?: 'male' | 'female' | 'other' | '';
  age_group?: 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55+' | '';
  source?: 'walk-in' | 'phone' | 'telegram' | 'instagram' | 'facebook' | 'website' | 'other';
  referral_code?: string;
  notes?: string;
}

const DEFAULT_CUSTOMER: CustomerInfo = {
  name: 'Walk-in Customer',
  phone: '+251 900 000 000',
  city: 'Addis Ababa',
  location: 'In-Store Counter',
  gender: '',
  age_group: '',
  source: 'walk-in',
  referral_code: '',
  notes: '',
};

const CITIES = [
  'Addis Ababa',
  'Other Regions',
  'Abroad',
];

const AGE_GROUPS = [
  { value: 'under-18', label: 'Under 18' },
  { value: '18-24', label: '18 – 24 years' },
  { value: '25-34', label: '25 – 34 years' },
  { value: '35-44', label: '35 – 44 years' },
  { value: '45-54', label: '45 – 54 years' },
  { value: '55+', label: '55+ years' },
];

const CUSTOMER_SOURCES = [
  { value: 'walk-in', label: 'Walk-in Store Customer' },
  { value: 'phone', label: 'Phone Call Order' },
  { value: 'telegram', label: 'Telegram Customer' },
  { value: 'instagram', label: 'Instagram / Social Media' },
  { value: 'facebook', label: 'Facebook Order' },
  { value: 'website', label: 'Website / Referral' },
  { value: 'other', label: 'Other Source' },
];

export default function PosTerminalPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const { groupedProducts, loading, error, refreshGroupedProducts } = useGroupedProducts();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Track selected variant index for each product group
  const [selectedVariants, setSelectedVariants] = useState<Record<string, number>>({});

  // Cart & Order state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'telebirr' | 'cbe'>('cash');
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Full Customer state
  const [customer, setCustomer] = useState<CustomerInfo>(DEFAULT_CUSTOMER);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalData, setCustomerModalData] = useState<CustomerInfo>(DEFAULT_CUSTOMER);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  // Discount Modal
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState<string>('0');

  // Order submission & Receipt state (using official system OrderReceipt)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);





  // Cashier Details & Dynamic Store/Branch (No hardcoded Bole Medhanialem)
  const role = (user?.role || 'staff').toLowerCase();
  const displayName = user?.name || user?.full_name || user?.username || 'Cashier';
  const displayRole =
    role === 'store_manager' ? 'Substore Manager' :
    role === 'call_center' ? 'Call Center Agent' :
    role === 'delivery' ? 'Driver' :
    role.charAt(0).toUpperCase() + role.slice(1);

  const storeBranchName =
    role === 'store_manager'
      ? 'Substore Terminal'
      : role === 'call_center'
      ? 'Call Center Sales Terminal'
      : role === 'delivery'
      ? 'Dispatch Terminal'
      : 'Retail POS Terminal';

  // Live customer search debounced lookup
  useEffect(() => {
    if (!customerSearchQuery.trim() || customerSearchQuery.trim().length < 2) {
      setCustomerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const res = await api.get<{ data: any[] }>(
          `/api/customers?search=${encodeURIComponent(customerSearchQuery.trim())}&limit=5`
        );
        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data as any).data || [];
          setCustomerSearchResults(list);
        }
      } catch {
        // Swallowed
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  const handleSelectCustomer = (c: any) => {
    setCustomerModalData({
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      city: c.city || 'Addis Ababa',
      location: c.location || '',
      gender: c.gender || '',
      age_group: c.age_group || '',
      source: c.source || 'walk-in',
      notes: c.notes || '',
    });
    setCustomerSearchResults([]);
    setCustomerSearchQuery('');
  };

  // Extract unique categories (tags)
  const categories = useMemo(() => {
    const set = new Set<string>();
    groupedProducts.forEach((g) => {
      if (g.tag && g.tag.trim()) {
        set.add(g.tag.trim());
      }
    });
    return Array.from(set);
  }, [groupedProducts]);

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return groupedProducts.filter((group) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        (group.tag && group.tag.toLowerCase() === selectedCategory.toLowerCase());

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const matchName = group.name.toLowerCase().includes(q);
      const matchTag = group.tag?.toLowerCase().includes(q);
      const matchVariant = group.variants?.some((v) =>
        v.package_size?.toLowerCase().includes(q)
      );

      return matchName || matchTag || matchVariant;
    });
  }, [groupedProducts, selectedCategory, searchQuery]);

  // Helper to get chosen variant for a group
  const getSelectedVariant = (group: GroupedProduct): Variant | undefined => {
    if (!group.variants || group.variants.length === 0) return undefined;
    const groupKey = group.id || group.name;
    const idx = selectedVariants[groupKey] ?? 0;
    return group.variants[idx] ?? group.variants[0];
  };

  // Helper to handle variant dropdown selection
  const handleVariantChange = (group: GroupedProduct, index: number) => {
    const groupKey = group.id || group.name;
    setSelectedVariants((prev) => ({
      ...prev,
      [groupKey]: index,
    }));
  };

  // Helper to check in-cart quantity for a product group
  const getInCartQty = (group: GroupedProduct): number => {
    const variant = getSelectedVariant(group);
    if (!variant) return 0;
    const item = cart.find(
      (it) => it.productId === variant.id && it.packageSize === variant.package_size
    );
    return item ? item.quantity : 0;
  };

  // Add selected variant to cart
  const addToCart = (group: GroupedProduct) => {
    const variant = getSelectedVariant(group);
    if (!variant) return;

    const price = Number(variant.price) || 0;
    const stock = Number(variant.inventory_quantity) || 0;

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === variant.id && item.packageSize === variant.package_size
      );

      if (existingIdx >= 0) {
        const next = [...prev];
        const existing = next[existingIdx]!;
        next[existingIdx] = {
          ...existing,
          quantity: existing.quantity + 1,
        };
        return next;
      }

      return [
        ...prev,
        {
          productId: variant.id,
          name: group.name,
          packageSize: variant.package_size || 'Standard',
          unitPrice: price,
          quantity: 1,
          imageUrl: group.image_url,
          stockAvailable: stock,
        },
      ];
    });
  };

  // Update quantity in cart
  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item) return prev;

      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== index);
      }

      next[index] = {
        ...item,
        quantity: newQty,
      };
      return next;
    });
  };

  // Remove single line from cart
  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear all cart
  const clearCart = () => {
    setCart([]);
    setDiscountAmount(0);
  };

  // Cart calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [cart]);

  const totalPayable = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Handle Complete Sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    const cashierName = `${displayName} (${displayRole})`;

    const paymentLabel =
      paymentMethod === 'telebirr'
        ? 'Telebirr'
        : paymentMethod === 'cbe'
        ? 'CBE Birr'
        : 'Cash';

    const customerLocation =
      customer.location.trim() ||
      (orderType === 'delivery' ? 'Addis Ababa Delivery' : 'Store Pickup Counter');
    const customerCity = customer.city.trim() || 'Addis Ababa';
    const customerPhone = customer.phone.trim() || '+251 900 000 000';
    const customerName = customer.name.trim() || 'Walk-in Customer';

    let orderNotes = `[POS Sale - ${paymentLabel}] Cashier: ${cashierName}${
      discountAmount > 0 ? ` | Discount: ETB ${discountAmount.toLocaleString()}` : ''
    }`;
    if (customer.notes && customer.notes.trim()) {
      orderNotes += ` | Notes: ${customer.notes.trim()}`;
    }

    const payload = {
      customer_name: customerName,
      phone: customerPhone,
      city: customerCity,
      location: customerLocation,
      source: customer.source || 'walk-in',
      order_type: orderType,
      referral_code: customer.referral_code || undefined,
      gender: customer.gender || undefined,
      age_group: customer.age_group || undefined,
      notes: orderNotes,
      items: cart.map((item) => ({
        product_id: item.productId,
        name: item.name,
        package_size: item.packageSize,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
    };

    try {
      const res = await api.post<{ id: string }>('/api/orders', payload);

      if (res.success && res.data) {
        const orderId = res.data.id;



        // Set official system OrderReceipt data
        setReceiptData({
          orderId,
          customerName: customerName,
          phone: customerPhone,
          city: customerCity,
          location: customerLocation,
          orderType: orderType === 'delivery' ? 'Delivery' : 'Pickup',
          total: totalPayable,
          date: new Date().toISOString(),
          cashier: cashierName,
          paymentMethod: paymentLabel,
          discount: discountAmount > 0 ? discountAmount : undefined,
          items: cart.map((item) => ({
            name: item.name,
            package_size: item.packageSize,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
        });

        setCart([]);
        setDiscountAmount(0);
      } else {
        setSubmissionError(
          res.details
            ? Object.values(res.details).flat().join(', ')
            : res.error || 'Failed to complete order. Please try again.'
        );
      }
    } catch (err: any) {
      setSubmissionError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Image fallback helper
  const getProductImage = (url?: string) => {
    if (!url) return '/image/products/Moringa 200g,500g and 1kg.webp';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    if (url.startsWith('/')) {
      return url;
    }
    return `/image/products/${url}`;
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col overflow-hidden bg-[#f8faf9] text-gray-900 font-sans select-none">

        {/* 1. DEDICATED FOREST GREEN POS TERMINAL HEADER BAR */}
        <header className="bg-[#1b4d24] text-white px-4 py-2 flex items-center justify-between border-b border-[#143b1c] shrink-0 z-20 shadow-sm">
          {/* Brand & Dynamic Store/Branch Info */}
          <div className="flex items-center gap-2.5 sm:gap-3 w-auto md:w-72 shrink-0">
            <div className="w-9 h-9 rounded-md bg-white flex items-center justify-center p-1 border border-gray-200 shadow-sm shrink-0">
              <img
                src="/icons/icon-192.png"
                alt="Asella Organic"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/favicon.png';
                }}
              />
            </div>
            <div>
              <h1 className="font-heading font-extrabold text-[15px] tracking-wide text-white leading-tight">
                ASELLA ORGANIC
              </h1>
              <p className="text-[11px] text-green-200 font-medium">{storeBranchName}</p>
            </div>
          </div>

          {/* Center Search Bar */}
          <div className="flex-1 max-w-lg mx-4">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search products by name, variant or category... (Press Esc to clear)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                className="w-full pl-9 pr-8 py-1.5 rounded-md bg-white text-gray-900 text-xs font-medium border border-gray-300 focus:border-[#1b4d24] focus:outline-none focus:ring-1 focus:ring-[#1b4d24] placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Cashier & Terminal Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">

            <div className="text-right hidden sm:block">
              <div className="font-bold text-xs text-white">
                {displayName} ({displayRole})
              </div>
              <div className="text-[11px] text-green-200">Terminal #01 &bull; Active</div>
            </div>
            <div className="w-8 h-8 rounded-md bg-[#143b1c] text-[#c5a059] border border-green-700 flex items-center justify-center font-bold text-xs shadow-inner">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* 2. MAIN POS WORKSPACE: CATALOG ON LEFT + CURRENT ORDER ON RIGHT */}
        <div className="flex-1 flex overflow-hidden">

          {/* CATALOG SECTION */}
          <main className="flex-1 flex flex-col overflow-hidden bg-[#f8faf9] px-4 py-2.5">

            {/* Breadcrumb4 Dot-Separator Category Filter Bar */}
            <div className="mb-2 shrink-0 flex items-center justify-between border-b border-gray-200/80 pb-2">
              <nav aria-label="Catalog Breadcrumbs" className="flex items-center overflow-x-auto scrollbar-none">
                <ol className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                  <li>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className={`rounded-sm px-2 py-0.5 transition cursor-pointer font-medium ${
                        selectedCategory === 'all'
                          ? 'bg-[#1b4d24] text-white font-bold shadow-2xs'
                          : 'hover:text-gray-900 text-gray-600 bg-white border border-gray-200/60'
                      }`}
                    >
                      All Products
                    </button>
                  </li>

                  {categories.map((cat) => (
                    <React.Fragment key={cat}>
                      <li className="text-gray-400 select-none flex items-center">
                        <DotIcon className="w-3.5 h-3.5 text-gray-400" />
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`rounded-sm px-2 py-0.5 transition cursor-pointer font-medium ${
                            selectedCategory.toLowerCase() === cat.toLowerCase()
                              ? 'bg-[#1b4d24] text-white font-bold shadow-2xs'
                              : 'hover:text-gray-900 text-gray-600 bg-white border border-gray-200/60'
                          }`}
                        >
                          {cat}
                        </button>
                      </li>
                    </React.Fragment>
                  ))}
                </ol>
              </nav>

              <div className="text-[11px] font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full shadow-2xs shrink-0 ml-3">
                {filteredProducts.length} products
              </div>
            </div>

            {/* Products Grid (Minimized Card Size, Restored Natural Image Size) */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
              {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <div className="w-6 h-6 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium">Loading catalog...</span>
                </div>
              ) : error ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-rose-500">
                  <span className="text-sm font-semibold">{error}</span>
                  <button
                    onClick={() => refreshGroupedProducts()}
                    className="px-3 py-1 bg-[#1b4d24] text-white rounded text-xs font-bold"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <ShoppingBag className="w-8 h-8 text-gray-300" />
                  <span className="text-sm font-medium">No products match your search or filter.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pb-8">
                  {filteredProducts.map((group) => {
                    const selectedVariant = getSelectedVariant(group);
                    const price = Number(selectedVariant?.price) || 0;
                    const stock = Number(selectedVariant?.inventory_quantity) || 0;
                    const groupKey = group.id || group.name;
                    const currentIdx = selectedVariants[groupKey] ?? 0;
                    const inCartCount = getInCartQty(group);

                    return (
                      <div
                        key={groupKey}
                        className="group rounded-xl border border-gray-200/80 bg-white shadow-2xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                        style={{ height: '220px', maxWidth: '240px', margin: '0 auto', width: '100%' }}
                      >
                        {/* Upper Image Section - Restored natural clean size */}
                        <div className="h-[135px] relative bg-white flex items-center justify-center p-2 select-none overflow-hidden">
                          {/* Category Tag Pill Top-Left */}
                          {group.tag && (
                            <span className="absolute top-2 left-2 bg-white/95 text-gray-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-gray-200/80 shadow-2xs z-10">
                              {group.tag}
                            </span>
                          )}

                          {/* In-Cart Pill Top-Right */}
                          {inCartCount > 0 && (
                            <span className="absolute top-2 right-2 bg-[#1b4d24] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-2xs z-10 flex items-center gap-0.5">
                              <ShoppingCart className="w-2.5 h-2.5 text-white" />
                              <span>{inCartCount}</span>
                            </span>
                          )}

                          {/* Product Image (Restored clean natural size) */}
                          <img
                            src={getProductImage(group.image_url)}
                            alt={group.name}
                            className="w-full h-full object-contain pointer-events-none transition-transform duration-200 group-hover:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                '/image/products/Moringa 200g,500g and 1kg.webp';
                            }}
                          />
                        </div>

                        {/* Bottom Pod: HERBAL CREAM GREEN (#e2efe1) POD */}
                        <div
                          className="p-2 flex flex-col gap-1.5 rounded-b-xl border-t-0"
                          style={{ backgroundColor: '#e2efe1' }}
                        >
                          {/* Title and Price Tag Row */}
                          <div className="flex items-center justify-between gap-1">
                            <h4
                              className="font-bold text-[11px] text-gray-900 truncate flex-1 leading-tight"
                              title={group.name}
                            >
                              {group.name}
                            </h4>
                            <span className="bg-white text-gray-900 font-extrabold text-[10.5px] px-1.5 py-0.5 rounded border border-gray-200/80 shadow-2xs shrink-0 font-heading">
                              ETB {price.toLocaleString()}
                            </span>
                          </div>

                          {/* 50/50 Equal Size Dropdown & Cart Action Row */}
                          <div className="flex gap-1.5 items-center">
                            {/* Package Size Dropdown */}
                            <select
                              value={currentIdx}
                              onChange={(e) => handleVariantChange(group, Number(e.target.value))}
                              className="flex-1 h-7 bg-white text-gray-900 text-[10.5px] font-bold rounded-md border border-gray-200 px-1.5 py-0 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-[#1b4d24]"
                            >
                              {group.variants.map((v, idx) => (
                                <option key={v.id || idx} value={idx}>
                                  {v.package_size || 'Standard'}
                                </option>
                              ))}
                            </select>

                            {/* Add to Cart Button */}
                            <button
                              type="button"
                              onClick={() => addToCart(group)}
                              disabled={stock <= 0}
                              className={`flex-1 h-7 rounded-md flex items-center justify-center transition shadow-2xs ${
                                stock > 0
                                  ? 'bg-[#1b4d24] hover:bg-[#143e1c] active:scale-[0.98] text-white cursor-pointer'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                              title={stock > 0 ? `Add ${selectedVariant?.package_size || ''} to order` : 'Out of stock'}
                            >
                              <ShoppingCart className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          {/* 3. RIGHT ORDER & CHECKOUT PANEL */}
          <aside className="w-[340px] 2xl:w-[370px] bg-white border-l border-gray-200 flex flex-col h-full shadow-lg shrink-0 z-10">

            {/* Header & Order Mode */}
            <div className="p-2.5 border-b border-gray-200 bg-[#fafbfa]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-heading font-extrabold text-sm text-gray-900">
                  <ShoppingCart className="w-4 h-4 text-[#1b4d24]" />
                  <span>Current Order</span>
                  <span className="bg-[#1b4d24] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {totalCartCount}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-[11px] font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-0.5 rounded transition flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {/* Order Mode Breadcrumb Selector */}
              <nav className="flex items-center gap-2 text-xs text-gray-600 font-medium py-1 px-2.5 bg-white rounded-md border border-gray-200 shadow-2xs mb-2">
                <span className="text-gray-400 font-semibold text-[11px]">Mode:</span>
                <button
                  type="button"
                  onClick={() => setOrderType('pickup')}
                  className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    orderType === 'pickup'
                      ? 'bg-[#1b4d24] text-white font-black shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Pickup
                </button>
                <DotIcon className="w-3 h-3 text-gray-300" />
                <button
                  type="button"
                  onClick={() => setOrderType('delivery')}
                  className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    orderType === 'delivery'
                      ? 'bg-[#1b4d24] text-white font-black shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Delivery
                </button>
              </nav>

              {/* Full Customer Profile Bar */}
              <div className="bg-white rounded-md border border-gray-200/90 p-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-[#1b4d24] shrink-0" />
                    <span className="font-bold text-gray-900 truncate max-w-[130px]">
                      {customer.name}
                    </span>
                    {customer.name === 'Walk-in Customer' ? (
                      <span className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1 py-0.2 rounded shrink-0">
                        Walk-in
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.2 rounded shrink-0">
                        Saved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {customer.name !== 'Walk-in Customer' && (
                      <button
                        type="button"
                        onClick={() => setCustomer(DEFAULT_CUSTOMER)}
                        className="text-[10px] text-gray-400 hover:text-gray-700 underline mr-1 cursor-pointer"
                        title="Reset to anonymous walk-in"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerModalData(customer);
                        setCustomerSearchQuery('');
                        setShowCustomerModal(true);
                      }}
                      className="px-3 py-1 bg-[#1b4d24] hover:bg-[#143b1c] text-white rounded-md text-xs font-black shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-white" />
                      <span>{customer.name === 'Walk-in Customer' ? 'Add Details' : 'Edit'}</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10.5px] text-gray-500 font-mono">
                  <span>{customer.phone}</span>
                  <span className="truncate max-w-[140px] text-right text-gray-600 font-sans">
                    {customer.location || customer.city}
                  </span>
                </div>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 divide-y divide-gray-100 scrollbar-thin">
              {cart.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-gray-400 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center mb-1.5 text-gray-400">
                    <ShoppingBag className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="font-bold text-xs text-gray-700">Order is empty</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Select products and package sizes from the catalog
                  </p>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={`${item.productId}-${item.packageSize}-${idx}`} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-gray-900 truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded border border-emerald-200 shrink-0">
                          {item.packageSize}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                        ETB {item.unitPrice.toLocaleString()} &times; {item.quantity} ={' '}
                        <span className="font-bold text-gray-800">
                          ETB {(item.unitPrice * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, -1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold transition cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold font-mono">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(idx, 1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(idx)}
                        className="w-6 h-6 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center transition cursor-pointer ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Checkout Bottom Summary Panel */}
            <div className="p-3 bg-[#fafbfa] border-t border-gray-200 flex flex-col gap-2.5">
              {/* Calculations */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-gray-900 font-mono">
                    ETB {subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <div className="flex items-center gap-1">
                    <span>Discount</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountInput(discountAmount.toString());
                        setShowDiscountModal(true);
                      }}
                      className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.2 rounded font-bold transition cursor-pointer"
                    >
                      Set
                    </button>
                  </div>
                  <span className="font-bold text-emerald-800 font-mono">
                    - ETB {discountAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm font-extrabold text-gray-900 pt-1 border-t border-gray-200">
                  <span>Total Payable</span>
                  <span className="text-base text-[#1b4d24] font-mono">
                    ETB {totalPayable.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Rail Selectors */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    PAYMENT RAIL
                  </span>
                  <span className="text-[10px] text-gray-500 capitalize">
                    {paymentMethod} selected
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`h-11 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                      paymentMethod === 'cash'
                        ? 'border-[#1b4d24] bg-emerald-50/50 text-[#1b4d24] ring-1 ring-[#1b4d24]'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-xs">&#128181;</span>
                    <span className="text-[10px] font-bold">Cash (ETB)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('telebirr')}
                    className={`h-11 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                      paymentMethod === 'telebirr'
                        ? 'border-[#008bd2] bg-blue-50/50 text-[#008bd2] ring-1 ring-[#008bd2]'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <img
                      src="/image/payment/Telebirr.png"
                      alt="Telebirr"
                      className="h-4 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/image/payment/telebirr.png';
                      }}
                    />
                    <span className="text-[10px] font-bold">telebirr</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cbe')}
                    className={`h-11 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                      paymentMethod === 'cbe'
                        ? 'border-[#8B2332] bg-rose-50/40 text-[#8B2332] ring-1 ring-[#8B2332]'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <img
                      src="/image/payment/cbe payment.jpg"
                      alt="CBE Birr"
                      className="h-4 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/image/payment/cbe.png';
                      }}
                    />
                    <span className="text-[10px] font-bold">CBE Birr</span>
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {submissionError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-medium">
                  {submissionError}
                </div>
              )}

              {/* Complete Sale Action Button */}
              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={cart.length === 0 || isSubmitting}
                className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm ${
                  cart.length > 0 && !isSubmitting
                    ? 'bg-[#1b4d24] hover:bg-[#143e1c] active:scale-[0.99] text-white cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Sale...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Complete Sale &bull; ETB {totalPayable.toFixed(0)}</span>
                  </>
                )}
              </button>
            </div>
          </aside>
        </div>

        {/* ── FULL CUSTOMER INFORMATION COLLECTION MODAL (MATCHING WEBSITE'S DESIGN & WIDER) ── */}
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 bg-[#0d1a10]/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-[#d6ebd6]/80 animate-in fade-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">
              
              {/* Header */}
              <div className="px-6 py-4 border-b border-[#e2efe1] flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#eef6ee] text-[#1b4d24] border border-[#d6ebd6] flex items-center justify-center shadow-2xs">
                    <UserPlus className="w-5 h-5 text-[#1b4d24]" />
                  </div>
                  <div>
                    <h3 className="font-heading font-extrabold text-[16px] text-gray-900 leading-tight">
                      Customer Profile & Information
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                      Search existing registered customers or record full profile details
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-[#f4f8f4] flex items-center justify-center transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs scrollbar-thin">
                
                {/* 1. Lookup Existing Customer Section (Website Theme) */}
                <div className="bg-[#f8faf8] p-3.5 rounded-xl border border-[#d6ebd6]">
                  <label className="block text-[10.5px] font-mono font-bold text-[#1b4d24] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    <span>Lookup Existing Customer in System</span>
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Type phone number or customer name to search..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-[#cfe8cf] text-gray-900 bg-white placeholder:text-gray-400 text-xs font-medium focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/10 transition-all shadow-2xs"
                    />
                    {isSearchingCustomer && (
                      <div className="w-3.5 h-3.5 border-2 border-[#1b4d24] border-t-transparent rounded-full animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                    )}
                  </div>

                  {/* Autocomplete Dropdown List */}
                  {customerSearchResults.length > 0 && (
                    <div className="mt-2.5 bg-white border border-[#d6ebd6] rounded-xl shadow-lg divide-y divide-[#edf5ed] max-h-40 overflow-y-auto">
                      {customerSearchResults.map((c) => (
                        <div
                          key={c.id || c.phone}
                          onClick={() => handleSelectCustomer(c)}
                          className="p-2.5 hover:bg-[#eef6ee] cursor-pointer flex items-center justify-between transition"
                        >
                          <div>
                            <span className="font-bold text-gray-900 text-xs">{c.name}</span>
                            <span className="text-gray-600 font-mono text-xs ml-2">{c.phone}</span>
                            <span className="text-gray-400 text-[11px] ml-1.5">({c.city || 'Addis Ababa'}{c.location ? ` • ${c.location}` : ''})</span>
                          </div>
                          <span className="text-[10px] font-bold text-[#1b4d24] bg-[#1b4d24]/10 border border-[#1b4d24]/20 px-2 py-0.5 rounded-md">
                            Select Customer
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Customer Form Fields (Mimicking Old Sales Order Form) */}
                <div className="flex items-center gap-3 pt-1 mb-1">
                  <div className="w-6 h-6 rounded-full bg-[#1b4d24] text-white flex items-center justify-center text-xs font-black font-mono shadow-xs">1</div>
                  <h4 className="text-xs font-bold text-[#1b4d24] uppercase tracking-wider">Customer Information</h4>
                  <div className="flex-1 h-px bg-[#d6ebd6]"></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Customer Full Name */}
                  <div>
                    <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">
                      Customer Full Name <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerModalData.name}
                      onChange={(e) =>
                        setCustomerModalData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g. Abebe Bikila"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-medium placeholder:text-gray-400 focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8]"
                    />
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">
                      Phone Number <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerModalData.phone}
                      onChange={(e) =>
                        setCustomerModalData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="0911234567 or +251 911 234 567"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8]"
                    />
                  </div>

                  {/* City Dropdown: Addis Ababa, Other Regions, Abroad only */}
                  <div>
                    <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">
                      City <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      value={customerModalData.city}
                      onChange={(e) =>
                        setCustomerModalData((prev) => ({ ...prev, city: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-semibold focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8] cursor-pointer"
                    >
                      {CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Location / Address */}
                  <div>
                    <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">
                      Location / Specific Address <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerModalData.location}
                      onChange={(e) =>
                        setCustomerModalData((prev) => ({ ...prev, location: e.target.value }))
                      }
                      placeholder="e.g. Bole, near airport..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-medium placeholder:text-gray-400 focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8]"
                    />
                  </div>

                  {/* Customer Source */}
                  <div>
                    <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">Source</label>
                    <select
                      value={customerModalData.source || 'walk-in'}
                      onChange={(e) =>
                        setCustomerModalData((prev) => ({ ...prev, source: e.target.value as any }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-semibold focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8] cursor-pointer"
                    >
                      {CUSTOMER_SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Referral Code */}
                  <div>
                    <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">Referral Code (Optional)</label>
                    <input
                      type="text"
                      value={customerModalData.referral_code || ''}
                      onChange={(e) =>
                        setCustomerModalData((prev) => ({ ...prev, referral_code: e.target.value.toUpperCase() }))
                      }
                      placeholder="e.g. BIRUK10"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-mono font-medium placeholder:text-gray-400 focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8]"
                    />
                  </div>

                  {/* Gender & Age Group side by side */}
                  <div className="grid grid-cols-2 gap-3 col-span-1 sm:col-span-2">
                    <div>
                      <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">Gender</label>
                      <select
                        value={customerModalData.gender || ''}
                        onChange={(e) =>
                          setCustomerModalData((prev) => ({ ...prev, gender: e.target.value as any }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-semibold focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8] cursor-pointer"
                      >
                        <option value="">—</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">Age Group</label>
                      <select
                        value={customerModalData.age_group || ''}
                        onChange={(e) =>
                          setCustomerModalData((prev) => ({ ...prev, age_group: e.target.value as any }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-semibold focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8] cursor-pointer"
                      >
                        <option value="">—</option>
                        {AGE_GROUPS.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-mono font-bold text-gray-700 uppercase tracking-wider mb-1.5 ml-0.5">
                    Customer Notes / Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={customerModalData.notes || ''}
                    onChange={(e) =>
                      setCustomerModalData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Special customer preferences, delivery landmarks, instructions..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#cfe8cf] text-gray-900 text-xs font-medium placeholder:text-gray-400 focus:outline-none focus:border-[#1b4d24] focus:ring-2 focus:ring-[#1b4d24]/15 transition-all shadow-2xs hover:border-[#a8d5a8]"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-[#e2efe1] bg-[#fbfdfb] flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCustomer(DEFAULT_CUSTOMER);
                    setShowCustomerModal(false);
                  }}
                  className="text-gray-500 hover:text-[#1b4d24] hover:bg-[#eef6ee] text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Walk-in</span>
                </button>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(false)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!customerModalData.name.trim()) {
                        alert('Please enter customer name');
                        return;
                      }
                      setCustomer(customerModalData);
                      setShowCustomerModal(false);
                    }}
                    className="px-6 py-2 rounded-xl bg-[#1b4d24] hover:bg-[#143e1c] text-white text-xs font-bold transition-all shadow-sm hover:shadow-md active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Customer Profile</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DISCOUNT MODAL ── */}
        {showDiscountModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="font-extrabold text-base text-gray-900">
                  Set Order Discount
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(false)}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="py-4 text-xs">
                <label className="block font-bold text-gray-700 mb-1">
                  Discount Amount (ETB)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">
                    ETB
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full pl-12 pr-3 py-2 rounded-lg border border-gray-300 text-gray-900 font-bold text-sm focus:outline-none focus:ring-1 focus:ring-[#1b4d24]"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Subtotal: ETB {subtotal.toFixed(2)}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountAmount(0);
                    setShowDiscountModal(false);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-100 cursor-pointer"
                >
                  Clear Discount
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(discountInput) || 0;
                    setDiscountAmount(Math.min(subtotal, Math.max(0, parsed)));
                    setShowDiscountModal(false);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-[#1b4d24] text-white text-xs font-bold hover:bg-[#143e1c] cursor-pointer"
                >
                  Apply Discount
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. OFFICIAL SYSTEM ORDER RECEIPT (The already-built receipt in the system) ── */}
        {receiptData && (
          <OrderReceipt
            data={receiptData}
            onClose={() => setReceiptData(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
