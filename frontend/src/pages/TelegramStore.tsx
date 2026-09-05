/**
 * frontend/src/pages/TelegramStore.tsx
 * Asella Organic — Telegram Mini App Store
 *
 * Dedicated mobile-first e-commerce store designed to run natively inside Telegram.
 * Integrates with Telegram WebApp SDK (MainButton, BackButton, Haptics, ThemeParams,
 * and user identity). Adheres strictly to the zero-emoji policy.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTelegram } from '../context/TelegramContext';
import { useGroupedProducts, type GroupedProduct, type Variant } from '../hooks/useProducts';
import { resolveProductImage } from '../utils/image';
import { useLanguage } from '../LanguageContext';

interface CartItem {
  productId: string;
  name: string;
  packageSize: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
}

interface OrderConfirmation {
  orderId: string;
  total: number;
  customerName: string;
  phone: string;
  city: string;
  location: string;
  items: Array<{ name: string; packageSize: string; quantity: number; unitPrice: number }>;
}

interface CustomerOrder {
  id: string;
  status: string;
  total: number;
  order_type: string;
  city: string;
  location: string;
  created_at: string;
  items: Array<{
    item_name: string;
    package_size: string;
    quantity: number;
    unit_price: number;
  }>;
}

const CATEGORIES = ['All', 'Superfood', 'Oils', 'Herbs', 'Traditional', 'Best Sellers'] as const;

export const TelegramStore: React.FC = () => {
  const {
    user,
    initData,
    haptic,
    mainButton,
    backButton,
    enableClosingConfirmation,
    disableClosingConfirmation,
    disableVerticalSwipes,
  } = useTelegram();

  useEffect(() => {
    disableVerticalSwipes();
  }, [disableVerticalSwipes]);

  const { language, setLanguage } = useLanguage();
  const { groupedProducts, loading: productsLoading, error: productsError } = useGroupedProducts();

  // Active view: 'catalog' | 'cart' | 'checkout' | 'details' | 'orders' | 'confirmation'
  const [activeView, setActiveView] = useState<'catalog' | 'cart' | 'checkout' | 'details' | 'orders' | 'confirmation'>('catalog');
  const [selectedProduct, setSelectedProduct] = useState<GroupedProduct | null>(null);

  // Selected variant for each product by name: { [productName]: variantId }
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  // Cart state
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('asella_tma_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Filter & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Referral code
  const [referralCode, setReferralCode] = useState<string>('');

  // Checkout form state
  const [form, setForm] = useState({
    customerName: '',
    phone: '+251',
    city: 'Addis Ababa',
    location: '',
    notes: '',
  });

  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  // Customer past orders
  const [myOrders, setMyOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Save cart to local storage and toggle closing confirmation
  useEffect(() => {
    try {
      localStorage.setItem('asella_tma_cart', JSON.stringify(cart));
    } catch {
      // Ignored
    }

    if (cart.length > 0) {
      enableClosingConfirmation();
    } else {
      disableClosingConfirmation();
    }
  }, [cart, enableClosingConfirmation, disableClosingConfirmation]);

  // Pre-fill user name from Telegram if available
  useEffect(() => {
    if (user?.first_name) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      setForm((prev) => ({
        ...prev,
        customerName: prev.customerName || fullName,
      }));
    }
  }, [user]);

  // Set default selected variant for products once loaded
  useEffect(() => {
    if (groupedProducts.length > 0) {
      setSelectedVariants((prev) => {
        const next = { ...prev };
        for (const p of groupedProducts) {
          if (!next[p.name] && p.variants.length > 0) {
            const firstActive = p.variants.find((v) => Number(v.active) !== 0 && v.inventory_quantity > 0) || p.variants[0];
            if (firstActive) next[p.name] = firstActive.id;
          }
        }
        return next;
      });
    }
  }, [groupedProducts]);

  // Fetch past orders for this Telegram user
  const fetchMyOrders = useCallback(async () => {
    if (!user?.id && !form.phone) return;
    setLoadingOrders(true);
    try {
      const queryParam = user?.id ? `chat_id=${user.id}` : `phone=${encodeURIComponent(form.phone)}`;
      const res = await fetch(`/api/telegram/my-orders?${queryParam}`, {
        headers: {
          'x-telegram-init-data': initData,
        },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMyOrders(data.data);
      }
    } catch {
      // Silent error
    } finally {
      setLoadingOrders(false);
    }
  }, [user?.id, form.phone, initData]);

  // Navigation handlers
  const navigateTo = useCallback((view: 'catalog' | 'cart' | 'checkout' | 'details' | 'orders' | 'confirmation') => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // BackButton sync with Telegram
  useEffect(() => {
    if (activeView === 'catalog') {
      backButton.hide();
    } else {
      backButton.show(() => {
        haptic.selection();
        if (activeView === 'checkout') {
          navigateTo('cart');
        } else if (activeView === 'details' || activeView === 'cart' || activeView === 'orders' || activeView === 'confirmation') {
          navigateTo('catalog');
        }
      });
    }
    return () => {
      backButton.hide();
    };
  }, [activeView, backButton, navigateTo, haptic]);

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [cart]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return groupedProducts.filter((p) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        (selectedCategory === 'Best Sellers' && Boolean(p.featured)) ||
        (p.tag && p.tag.toLowerCase() === selectedCategory.toLowerCase());

      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesCategory && matchesSearch;
    });
  }, [groupedProducts, selectedCategory, searchQuery]);

  // Cart operations
  const addToCart = (product: GroupedProduct, variant: Variant) => {
    haptic.impact('medium');
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === variant.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === variant.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          productId: variant.id,
          name: product.name,
          packageSize: variant.package_size,
          unitPrice: Number(variant.price),
          quantity: 1,
          imageUrl: resolveProductImage(product.image_url, product.name),
        },
      ];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    haptic.impact('light');
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.productId === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const removeFromCart = (productId: string) => {
    haptic.impact('medium');
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Submit Order via Telegram Mini App Endpoint
  const handlePlaceOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!form.customerName.trim() || form.customerName.trim().length < 2) {
      setOrderError('Please provide your full name');
      haptic.notification('error');
      return;
    }
    const cleanPhone = form.phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      setOrderError('Please provide a valid phone number');
      haptic.notification('error');
      return;
    }
    if (!form.location.trim() || form.location.trim().length < 2) {
      setOrderError('Please provide your delivery address or area');
      haptic.notification('error');
      return;
    }
    if (cart.length === 0) {
      setOrderError('Your cart is empty');
      haptic.notification('error');
      return;
    }

    setSubmittingOrder(true);
    setOrderError(null);
    mainButton.setLoading(true);

    try {
      const payload = {
        initData,
        customer_name: form.customerName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        location: form.location.trim(),
        order_type: 'delivery',
        notes: form.notes.trim() || undefined,
        referral_code: referralCode.trim() || undefined,
        items: cart.map((it) => ({
          name: it.name,
          package_size: it.packageSize,
          quantity: it.quantity,
          unit_price: it.unitPrice,
        })),
      };

      const res = await fetch('/api/telegram/app-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Order placement failed (${res.status})`);
      }

      haptic.notification('success');

      setConfirmation({
        orderId: json.data.id,
        total: json.data.total,
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        location: form.location.trim(),
        items: [...cart],
      });

      setCart([]);
      navigateTo('confirmation');
    } catch (err: any) {
      haptic.notification('error');
      setOrderError(err.message || 'Unable to place order');
    } finally {
      setSubmittingOrder(false);
      mainButton.setLoading(false);
    }
  };

  // MainButton synchronization
  useEffect(() => {
    if (activeView === 'catalog' && totalCartCount > 0) {
      mainButton.show(`View Cart (${totalCartCount}) - ETB ${cartTotal.toLocaleString()}`, () => {
        haptic.selection();
        navigateTo('cart');
      });
    } else if (activeView === 'cart' && cart.length > 0) {
      mainButton.show(`Checkout - ETB ${cartTotal.toLocaleString()}`, () => {
        haptic.selection();
        navigateTo('checkout');
      });
    } else if (activeView === 'checkout') {
      mainButton.show(`Place Order - ETB ${cartTotal.toLocaleString()}`, () => {
        void handlePlaceOrder();
      });
    } else {
      mainButton.hide();
    }

    return () => {
      mainButton.hide();
    };
  }, [activeView, totalCartCount, cartTotal, cart.length, mainButton, navigateTo, haptic]);

  return (
    <div className="telegram-mini-app-shell min-h-screen bg-stone-50 text-stone-900 pb-20 select-none">
      {/* ── Top Navigation Bar ──────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateTo('catalog')}
              className="text-left font-serif font-bold text-stone-800 tracking-tight leading-none"
            >
              <span className="block text-xs uppercase tracking-widest text-amber-700 font-sans font-semibold">
                Highland Ethiopia
              </span>
              <span className="text-lg">Asella Organic</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* Language Switcher */}
            <div className="flex bg-stone-100 rounded-lg p-0.5 text-xs font-medium border border-stone-200">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 rounded-md transition-all ${
                  language === 'en' ? 'bg-amber-700 text-white font-semibold' : 'text-stone-600'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('am')}
                className={`px-2 py-1 rounded-md transition-all ${
                  language === 'am' ? 'bg-amber-700 text-white font-semibold' : 'text-stone-600'
                }`}
              >
                አማ
              </button>
              <button
                type="button"
                onClick={() => setLanguage('or')}
                className={`px-2 py-1 rounded-md transition-all ${
                  language === 'or' ? 'bg-amber-700 text-white font-semibold' : 'text-stone-600'
                }`}
              >
                OR
              </button>
            </div>

            {/* Orders Tab Button */}
            <button
              onClick={() => {
                haptic.selection();
                void fetchMyOrders();
                navigateTo('orders');
              }}
              className="relative p-2 text-stone-600 hover:text-stone-900 rounded-lg bg-stone-100 border border-stone-200"
              title="My Orders"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </button>

            {/* Cart Button */}
            <button
              onClick={() => {
                haptic.selection();
                navigateTo('cart');
              }}
              className="relative p-2 text-stone-600 hover:text-stone-900 rounded-lg bg-stone-100 border border-stone-200"
              title="Cart"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {totalCartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-700 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ───────────────────────────────────────── */}
      <main className="max-w-md mx-auto px-4 pt-3">
        {/* User Greeting Banner */}
        <div className="bg-stone-100 rounded-lg p-3 mb-3 border border-stone-200">
          <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">
            Certified 100% Organic Products
          </p>
          <h2 className="text-sm font-semibold text-stone-800">
            {user?.first_name ? `Welcome back, ${user.first_name}` : 'Natural Highland Health Supplements'}
          </h2>
        </div>

        {/* ── VIEW 1: CATALOG ────────────────────────────────────── */}
        {activeView === 'catalog' && (
          <div>
            {/* Search Input */}
            <div className="relative mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Moringa, Shilajit, Black Seed..."
                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
              <svg
                className="w-4 h-4 text-stone-400 absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 p-0.5"
                  aria-label="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex space-x-1.5 overflow-x-auto pb-2 scrollbar-none mb-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    haptic.selection();
                    setSelectedCategory(cat);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-amber-800 text-white font-semibold'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Products List / Grid */}
            {productsLoading ? (
              <div className="py-16 text-center text-stone-400 text-sm">
                <div className="inline-block w-6 h-6 border-2 border-amber-700 border-t-transparent rounded-full animate-spin mb-2" />
                <p>Loading organic catalog...</p>
              </div>
            ) : productsError ? (
              <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 text-center">
                {productsError}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-stone-500 text-sm">
                No products match your search.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.map((product) => {
                  const currentVariantId = selectedVariants[product.name] || product.variants[0]?.id;
                  const activeVariant =
                    product.variants.find((v) => v.id === currentVariantId) || product.variants[0];

                  const inStock = activeVariant && activeVariant.inventory_quantity > 0;
                  const cartItem = cart.find((it) => it.productId === activeVariant?.id);
                  const imageUrl = resolveProductImage(product.image_url, product.name);

                  return (
                    <div
                      key={product.name}
                      className="bg-white rounded-lg border border-stone-200 p-3.5 shadow-sm transition-all hover:border-stone-300"
                    >
                      <div className="flex gap-3">
                        {/* Thumbnail */}
                        <div
                          onClick={() => {
                            setSelectedProduct(product);
                            navigateTo('details');
                          }}
                          className="w-20 h-20 bg-stone-100 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer border border-stone-100 relative"
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-300 text-xs font-mono">
                              Asella
                            </div>
                          )}
                          {product.tag && (
                            <span className="absolute top-1 left-1 bg-stone-900/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                              {product.tag}
                            </span>
                          )}
                        </div>

                        {/* Info & Price */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <h3
                              onClick={() => {
                                setSelectedProduct(product);
                                navigateTo('details');
                              }}
                              className="text-sm font-semibold text-stone-900 truncate cursor-pointer hover:text-amber-800"
                            >
                              {product.name}
                            </h3>
                          </div>

                          <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                            {product.description || 'Natural organic extract from Ethiopian highlands.'}
                          </p>

                          {/* Price & Stock */}
                          <div className="mt-1 flex items-baseline space-x-2">
                            <span className="text-sm font-bold text-amber-900 font-mono">
                              ETB {Number(activeVariant?.price || 0).toLocaleString()}
                            </span>
                            <span
                              className={`text-[10px] font-medium ${
                                inStock ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {inStock ? 'In Stock' : 'Out of stock'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Package Size Chips */}
                      {product.variants.length > 1 && (
                        <div className="mt-2.5 pt-2 border-t border-stone-100 flex flex-wrap gap-1.5">
                          {product.variants.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => {
                                haptic.impact('light');
                                setSelectedVariants((prev) => ({
                                  ...prev,
                                  [product.name]: v.id,
                                }));
                              }}
                              className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                                v.id === activeVariant?.id
                                  ? 'bg-amber-700 text-white font-medium border-amber-700'
                                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                              }`}
                            >
                              {v.package_size}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Action Row */}
                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-stone-100">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            navigateTo('details');
                          }}
                          className="text-xs text-stone-500 hover:text-stone-800 underline underline-offset-2"
                        >
                          View details
                        </button>

                        {/* Add to Cart / Stepper */}
                        {cartItem ? (
                          <div className="flex items-center space-x-2 bg-stone-100 rounded-lg p-0.5 border border-stone-200">
                            <button
                              onClick={() => updateQuantity(cartItem.productId, -1)}
                              className="w-7 h-7 flex items-center justify-center bg-white rounded-md text-stone-700 font-bold hover:bg-stone-50 text-sm shadow-sm"
                            >
                              -
                            </button>
                            <span className="text-xs font-semibold px-1 font-mono">
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(cartItem.productId, 1)}
                              className="w-7 h-7 flex items-center justify-center bg-white rounded-md text-stone-700 font-bold hover:bg-stone-50 text-sm shadow-sm"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={!inStock}
                            onClick={() => activeVariant && addToCart(product, activeVariant)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              inStock
                                ? 'bg-amber-700 hover:bg-amber-800 text-white shadow-sm'
                                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            }`}
                          >
                            {inStock ? 'Add to Cart' : 'Unavailable'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 2: PRODUCT DETAILS ────────────────────────────── */}
        {activeView === 'details' && selectedProduct && (
          <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
            <button
              onClick={() => navigateTo('catalog')}
              className="text-xs text-stone-500 hover:text-stone-900 mb-3 flex items-center space-x-1"
            >
              <span>Back to Products</span>
            </button>

            <div className="w-full h-48 bg-stone-100 rounded-lg overflow-hidden mb-4 border border-stone-100">
              {resolveProductImage(selectedProduct.image_url, selectedProduct.name) ? (
                <img
                  src={resolveProductImage(selectedProduct.image_url, selectedProduct.name)}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-300 font-mono text-sm">
                  Asella Organic
                </div>
              )}
            </div>

            <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1 uppercase tracking-wider">
              {selectedProduct.tag || 'Organic Supplement'}
            </span>
            <h1 className="text-lg font-bold text-stone-900">{selectedProduct.name}</h1>

            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              {selectedProduct.description ||
                'Ethically harvested and traditional Ethiopian organic formula. Formulated to support vitality, immune health, and balance.'}
            </p>

            {/* Sizes Selection */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-stone-700 block mb-1.5">
                Select Package Size:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {selectedProduct.variants.map((v) => {
                  const isSelected =
                    (selectedVariants[selectedProduct.name] || selectedProduct.variants[0]?.id) === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        haptic.impact('light');
                        setSelectedVariants((prev) => ({
                          ...prev,
                          [selectedProduct.name]: v.id,
                        }));
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-amber-700 bg-amber-50/50'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-stone-800">
                        {v.package_size}
                      </span>
                      <span className="block text-xs font-mono font-bold text-amber-900 mt-0.5">
                        ETB {Number(v.price).toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Add CTA */}
            <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
              <div>
                <span className="text-xs text-stone-500 block">Unit Price</span>
                <span className="text-base font-bold text-amber-900 font-mono">
                  ETB{' '}
                  {Number(
                    selectedProduct.variants.find(
                      (v) =>
                        v.id ===
                        (selectedVariants[selectedProduct.name] || selectedProduct.variants[0]?.id)
                    )?.price || 0
                  ).toLocaleString()}
                </span>
              </div>

              <button
                onClick={() => {
                  const currentVariant =
                    selectedProduct.variants.find(
                      (v) =>
                        v.id ===
                        (selectedVariants[selectedProduct.name] || selectedProduct.variants[0]?.id)
                    ) || selectedProduct.variants[0];
                  if (currentVariant) {
                    addToCart(selectedProduct, currentVariant);
                    navigateTo('cart');
                  }
                }}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                Add to Cart & Checkout
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW 3: CART ────────────────────────────────────────── */}
        {activeView === 'cart' && (
          <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
              <h2 className="text-base font-bold text-stone-800">Shopping Cart</h2>
              <span className="text-xs text-stone-500 font-mono">{totalCartCount} item(s)</span>
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-stone-500 mb-4">Your cart is empty.</p>
                <button
                  onClick={() => navigateTo('catalog')}
                  className="px-4 py-2 bg-amber-700 text-white rounded-lg text-xs font-semibold"
                >
                  Browse Products
                </button>
              </div>
            ) : (
              <div>
                {/* Cart Items */}
                <div className="space-y-3 divide-y divide-stone-100">
                  {cart.map((item) => (
                    <div key={item.productId} className="pt-3 first:pt-0 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-12 h-12 object-cover rounded-md border border-stone-100 flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-stone-900 truncate">{item.name}</h4>
                          <span className="text-[11px] text-stone-500 block">{item.packageSize}</span>
                          <span className="text-xs font-bold text-amber-900 font-mono">
                            ETB {(item.unitPrice * item.quantity).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <div className="flex items-center space-x-1 bg-stone-100 rounded-md p-0.5 border border-stone-200">
                          <button
                            onClick={() => updateQuantity(item.productId, -1)}
                            className="w-6 h-6 flex items-center justify-center bg-white rounded text-stone-700 font-bold text-xs"
                          >
                            -
                          </button>
                          <span className="text-xs font-mono px-1 font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, 1)}
                            className="w-6 h-6 flex items-center justify-center bg-white rounded text-stone-700 font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-stone-400 hover:text-red-600 p-1"
                          title="Remove item"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Referral Code Box */}
                <div className="mt-4 pt-3 border-t border-stone-100">
                  <label className="text-xs font-semibold text-stone-700 block mb-1">
                    Referral or Affiliate Code (Optional)
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="e.g. ASL-789"
                      className="flex-1 px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg font-mono uppercase"
                    />
                  </div>
                </div>

                {/* Totals */}
                <div className="mt-4 pt-3 border-t border-stone-200 space-y-1.5 text-xs">
                  <div className="flex justify-between text-stone-600">
                    <span>Subtotal</span>
                    <span className="font-mono">ETB {cartTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Delivery</span>
                    <span className="text-emerald-700 font-medium">Calculated upon dispatch</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-100">
                    <span>Total</span>
                    <span className="font-mono text-amber-900">ETB {cartTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* Checkout CTA */}
                <div className="mt-5">
                  <button
                    onClick={() => {
                      haptic.selection();
                      navigateTo('checkout');
                    }}
                    className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs rounded-lg shadow-sm"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 4: CHECKOUT ────────────────────────────────────── */}
        {activeView === 'checkout' && (
          <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
            <h2 className="text-base font-bold text-stone-800 mb-1">Delivery Details</h2>
            <p className="text-xs text-stone-500 mb-4">
              Enter your details. Payment is confirmed upon delivery via Telebirr, CBE, or Cash.
            </p>

            {orderError && (
              <div className="p-3 mb-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {orderError}
              </div>
            )}

            <form onSubmit={handlePlaceOrder} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  placeholder="e.g. Abebe Balcha"
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+251 900 000 000"
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">
                    City *
                  </label>
                  <select
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                  >
                    <option value="Addis Ababa">Addis Ababa</option>
                    <option value="Other Regions">Other Regions</option>
                    <option value="Abroad">Abroad</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-stone-700 block mb-1">
                    Order Type
                  </label>
                  <div className="py-2 text-xs font-medium text-stone-800">
                    Direct Delivery
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">
                  Specific Delivery Area / Landmark *
                </label>
                <input
                  type="text"
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Bole, Medhanialem, next to..."
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1">
                  Order Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Special instructions or delivery timing..."
                  className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>

              {/* Order Summary Recap */}
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs space-y-1">
                <div className="flex justify-between font-semibold text-stone-800">
                  <span>Order Total:</span>
                  <span className="font-mono text-amber-900">ETB {cartTotal.toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Receipt will be sent directly to your Telegram chat.
                </p>
              </div>

              <button
                type="submit"
                disabled={submittingOrder}
                className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs rounded-lg shadow-sm disabled:opacity-50"
              >
                {submittingOrder ? 'Submitting Order...' : `Confirm Order — ETB ${cartTotal.toLocaleString()}`}
              </button>
            </form>
          </div>
        )}

        {/* ── VIEW 5: ORDER CONFIRMATION ──────────────────────────── */}
        {activeView === 'confirmation' && confirmation && (
          <div className="bg-white rounded-lg border border-stone-200 p-5 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center font-bold text-lg mb-3">
              OK
            </div>
            <h2 className="text-base font-bold text-stone-900">Order Received</h2>
            <p className="text-xs text-stone-600 mt-1 mb-4">
              Thank you {confirmation.customerName}. Your order has been placed and registered.
            </p>

            <div className="bg-stone-50 rounded-lg p-3 text-left border border-stone-200 text-xs space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-stone-500">Order ID:</span>
                <span className="font-mono font-bold text-stone-800">{confirmation.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Total:</span>
                <span className="font-mono font-bold text-amber-900">
                  ETB {confirmation.total.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Destination:</span>
                <span className="text-stone-800">{confirmation.location}, {confirmation.city}</span>
              </div>
            </div>

            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              We have dispatched your order details to our delivery team and sent an official receipt to your Telegram chat.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => {
                  void fetchMyOrders();
                  navigateTo('orders');
                }}
                className="w-full py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold rounded-lg"
              >
                Track Order Status
              </button>
              <button
                onClick={() => navigateTo('catalog')}
                className="w-full py-2 border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold rounded-lg"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW 6: MY ORDERS / TRACKING ───────────────────────── */}
        {activeView === 'orders' && (
          <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
              <h2 className="text-base font-bold text-stone-800">Order History</h2>
              <button
                onClick={() => void fetchMyOrders()}
                className="text-xs text-amber-800 font-semibold hover:underline"
              >
                Refresh
              </button>
            </div>

            {loadingOrders ? (
              <div className="py-12 text-center text-stone-400 text-xs">
                Loading your orders...
              </div>
            ) : myOrders.length === 0 ? (
              <div className="py-10 text-center text-stone-500 text-xs">
                <p>No orders found for your Telegram account.</p>
                <button
                  onClick={() => navigateTo('catalog')}
                  className="mt-3 px-3 py-1.5 bg-amber-700 text-white rounded-lg text-xs font-semibold"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myOrders.map((ord) => (
                  <div key={ord.id} className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-bold text-stone-800">{ord.id}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          ord.status === 'Delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.status === 'In Transit'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>

                    <div className="text-stone-500 text-[11px] mb-2">
                      {new Date(ord.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>

                    <div className="border-t border-stone-200 pt-2 space-y-1">
                      {ord.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-stone-700">
                          <span>{it.item_name} [{it.package_size}] x {it.quantity}</span>
                          <span className="font-mono">ETB {(it.quantity * it.unit_price).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-stone-200 pt-2 mt-2 flex justify-between font-bold text-stone-900">
                      <span>Total</span>
                      <span className="font-mono text-amber-900">ETB {Number(ord.total).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default TelegramStore;
