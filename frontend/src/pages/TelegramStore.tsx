/**
 * frontend/src/pages/TelegramStore.tsx
 * Asella Organic — Telegram Mini App
 *
 * Tabbed mobile-first store that runs natively inside Telegram. Composes the
 * shell, four tabs (Store, Discover, Orders, Account) and the full-screen
 * overlays (details, cart, checkout, confirmation) from
 * `frontend/src/telegram/shop/`. The Telegram MainButton and BackButton are
 * driven from one place so every overlay stays consistent with the SDK.
 * Adheres strictly to the zero-emoji policy.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTelegram } from '../context/TelegramContext';
import { useGroupedProducts, type GroupedProduct } from '../hooks/useProducts';

import { AccountTab } from '../telegram/shop/AccountTab';
import { CartView } from '../telegram/shop/CartView';
import { CheckoutView, type CheckoutFormState } from '../telegram/shop/CheckoutView';
import { ConfirmationView, OrderDetailView } from '../telegram/shop/ConfirmationView';
import { DetailView } from '../telegram/shop/DetailView';
import { DiscoverTab } from '../telegram/shop/DiscoverTab';
import { NotificationsOverlay } from '../telegram/shop/NotificationsOverlay';
import { OrdersTab } from '../telegram/shop/OrdersTab';
import { StoreTab, selectDefaultVariant, useFilteredProducts, type SortKey } from '../telegram/shop/StoreTab';
import { TmaShell } from '../telegram/shop/TmaShell';
import { useMiniAppI18n } from '../telegram/shop/MiniAppI18n';
import { useTelegramTheme } from '../telegram/shop/useTelegramTheme';
import { useNotifications } from '../telegram/shop/useNotifications';
import { usePersistedState } from '../telegram/shop/usePersistedState';
import { fetchMyOrders, fetchState, placeOrder } from '../telegram/shop/api';
import { useCart } from '../telegram/shop/useCart';
import { useMiniAppProfile } from '../telegram/shop/useMiniAppProfile';
import {
  formatEtb,
  type CustomerOrder,
  type OrderConfirmation,
  type OrderStatusFilter,
  type OrdersMeta,
  type TmaTab,
} from '../telegram/shop/types';

type Overlay =
  | 'cart'
  | 'checkout'
  | 'details'
  | 'confirmation'
  | 'orderDetail'
  | 'notifications'
  | null;

export const TelegramStore: React.FC = () => {
  const {
    user,
    initData,
    haptic,
    mainButton,
    backButton,
    colorScheme,
    enableClosingConfirmation,
    disableClosingConfirmation,
    disableVerticalSwipes,
  } = useTelegram();

  const theme = useTelegramTheme(colorScheme);
  const notifications = useNotifications(initData);
  const { language } = useMiniAppI18n();

  // Read inside the persisted-state callbacks without making them depend on
  // the language value, which would re-queue a write on every switch.
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    disableVerticalSwipes();
  }, [disableVerticalSwipes]);

  const { groupedProducts, loading: productsLoading, error: productsError } = useGroupedProducts();

  const [activeTab, setActiveTab] = useState<TmaTab>('store');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selectedProduct, setSelectedProduct] = useState<GroupedProduct | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);

  // Navigation history powers the universal back button. Entries are
  // { tab, overlay } pairs so both tab switches and overlay pushes can be
  // undone, and both the in-app button and Telegram's native BackButton
  // replay the same stack.
  const [history, setHistory] = useState<Array<{ tab: TmaTab; overlay: Overlay }>>([]);

  // Mirrors of the live screen state so the stable navigate() callback can
  // read the current screen without capturing it as a dependency.
  const activeTabRef = useRef<TmaTab>(activeTab);
  const overlayRef = useRef<Overlay>(overlay);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  const navigate = useCallback((tab: TmaTab, nextOverlay: Overlay) => {
    const fromTab = activeTabRef.current;
    const fromOverlay = overlayRef.current;

    setHistory((prev) => {
      // Ignore no-op navigation so back never dead-ends.
      if (fromTab === tab && fromOverlay === nextOverlay) return prev;
      // The header cart button is a shortcut, not a step: remembering it
      // would make back bounce between the same two screens.
      if (fromOverlay === 'cart' && nextOverlay === null) return prev;

      return [...prev, { tab, overlay: nextOverlay }].slice(-12);
    });

    activeTabRef.current = tab;
    overlayRef.current = nextOverlay;
    setActiveTab(tab);
    setOverlay(nextOverlay);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;

      const next = prev.slice(0, -1);
      const target = next[next.length - 1] ?? { tab: 'store' as TmaTab, overlay: null as Overlay };

      activeTabRef.current = target.tab;
      overlayRef.current = target.overlay;
      setActiveTab(target.tab);
      setOverlay(target.overlay);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      return next;
    });
  }, []);

  const canGoBack = history.length > 0;

  // Selected package size per product name.
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('recommended');
  const [inStockOnly, setInStockOnly] = useState(false);

  const [referralCode, setReferralCode] = useState('');

  const [form, setForm] = useState<CheckoutFormState>({
    customerName: '',
    phone: '+251',
    city: 'Addis Ababa',
    location: '',
    notes: '',
  });
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  const [orderSearch, setOrderSearch] = useState('');
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [myOrders, setMyOrders] = useState<CustomerOrder[]>([]);
  const [ordersMeta, setOrdersMeta] = useState<OrdersMeta>({
    total: 0,
    page: 1,
    limit: 20,
    pages: 0,
  });
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const cart = useCart({
    onHaptic: (style) => haptic.impact(style),
    onNotify: (type) => haptic.notification(type),
  });

  const profile = useMiniAppProfile(initData);

  // Mirror the cart and preferences to the server, keyed by the customer's
  // verified chat id, so a basket follows the customer rather than the browser.
  const chatId = user?.id ?? null;
  const persisted = usePersistedState(
    initData,
    chatId,
    () => cart.cart,
    () => ({
      theme: theme.preference,
      language: languageRef.current,
      referralCode,
      category: activeCategory,
      sort: sortKey,
    })
  );

  const cartHydratedRef = useRef(false);

  // Apply the server copy once, without clobbering a basket the customer has
  // already started in this session.
  useEffect(() => {
    if (cartHydratedRef.current) return;
    if (!initData || chatId === null) return;

    let cancelled = false;
    (async () => {
      try {
        const state = await fetchState(initData);
        if (cancelled || cartHydratedRef.current) return;
        cartHydratedRef.current = true;

        if (state.cart?.length) {
          cart.replace(state.cart as never[]);
        }
        if (state.preferences?.referralCode) {
          setReferralCode(state.preferences.referralCode);
        }
        if (state.preferences?.category) {
          setActiveCategory(state.preferences.category);
        }
        if (state.preferences?.sort) {
          setSortKey(state.preferences.sort as SortKey);
        }
        if (state.preferences?.theme) {
          theme.setPreference(state.preferences.theme);
        }
      } catch {
        // Offline or unauthenticated: keep whatever is already in memory.
        cartHydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally run once per session; persisted owns its own re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, chatId]);

  // Push local changes back to the server.
  useEffect(() => {
    if (!cartHydratedRef.current) return;
    persisted.scheduleCartSync(cart.cart);
  }, [cart.cart]);

  useEffect(() => {
    if (!cartHydratedRef.current) return;
    persisted.schedulePrefsSync({
      theme: theme.preference,
      language: languageRef.current,
      referralCode,
      category: activeCategory,
      sort: sortKey,
    });
  }, [theme.preference, referralCode, activeCategory, sortKey]);

  // Warn before discarding a basket when closing the Mini App.
  useEffect(() => {
    if (cart.cart.length > 0) {
      enableClosingConfirmation();
    } else {
      disableClosingConfirmation();
    }
  }, [cart.cart.length, enableClosingConfirmation, disableClosingConfirmation]);

  // Pre-fill the checkout name from the Telegram profile, then from the
  // saved Account tab profile.
  useEffect(() => {
    const fromTelegram = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
    const fromProfile = profile.data?.profile.display_name ?? '';
    const phone = profile.data?.profile.phone;
    const city = profile.data?.profile.city;
    const location = profile.data?.profile.location;

    setForm((prev) => ({
      ...prev,
      customerName: prev.customerName || fromTelegram || fromProfile,
      phone: phone && prev.phone === '+251' ? phone : prev.phone,
      city: city && prev.city === 'Addis Ababa' ? city : prev.city,
      location: prev.location || location || '',
    }));
  }, [user, profile.data]);

  // Default each product to its first purchasable package size. The previous
  // state is returned untouched when nothing changed so a fresh `groupedProducts`
  // identity on every render cannot retrigger this effect indefinitely.
  useEffect(() => {
    if (groupedProducts.length === 0) return;

    setSelectedVariants((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const product of groupedProducts) {
        if (next[product.name]) continue;
        const variant = selectDefaultVariant(product);
        if (variant) {
          next[product.name] = variant.id;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [groupedProducts]);

  // Debounce the order search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOrderSearch(orderSearch), 350);
    return () => clearTimeout(timer);
  }, [orderSearch]);

  const loadOrders = useCallback(async () => {
    if (!initData) {
      setOrdersError('Open the store from Telegram to see your orders.');
      return;
    }

    setLoadingOrders(true);
    setOrdersError(null);

    try {
      const result = await fetchMyOrders(initData, {
        search: debouncedOrderSearch,
        status: statusFilter,
        limit: 20,
      });
      setMyOrders(result.orders);
      setOrdersMeta(result.meta);
    } catch (err: any) {
      setOrdersError(err?.message || 'Unable to load your orders.');
    } finally {
      setLoadingOrders(false);
    }
  }, [initData, debouncedOrderSearch, statusFilter]);

  // Load orders whenever the Orders tab becomes visible or its filters change.
  useEffect(() => {
    if (activeTab === 'orders' && overlay === null) {
      void loadOrders();
    }
  }, [activeTab, overlay, loadOrders]);

  const filteredProducts = useFilteredProducts(groupedProducts, {
    searchQuery,
    activeCategory,
    sortKey,
    inStockOnly,
  });

  const openProduct = useCallback(
    (product: GroupedProduct) => {
      setSelectedProduct(product);
      navigate(activeTab, 'details');
    },
    []
  );

  const handleAddFromDetail = useCallback(() => {
    if (!selectedProduct) return;
    const variantId = selectedVariants[selectedProduct.name] ?? selectedProduct.variants[0]?.id;
    const variant = selectedProduct.variants.find((v) => v.id === variantId);
    if (variant) {
      cart.addToCart(selectedProduct, variant);
      navigate(activeTab, 'cart');
    }
  }, [selectedProduct, selectedVariants, cart]);

  const handlePlaceOrder = useCallback(async () => {
    if (form.customerName.trim().length < 2) {
      setOrderError('Please provide your full name');
      haptic.notification('error');
      return;
    }
    if (form.phone.replace(/\D/g, '').length < 9) {
      setOrderError('Please provide a valid phone number');
      haptic.notification('error');
      return;
    }
    if (form.location.trim().length < 2) {
      setOrderError('Please provide your delivery address or area');
      haptic.notification('error');
      return;
    }
    if (cart.cart.length === 0) {
      setOrderError('Your cart is empty');
      haptic.notification('error');
      return;
    }

    setSubmittingOrder(true);
    setOrderError(null);
    mainButton.setLoading(true);

    try {
      const result = await placeOrder(initData, {
        customer_name: form.customerName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        location: form.location.trim(),
        order_type: 'delivery',
        notes: form.notes.trim() || undefined,
        referral_code: referralCode.trim() || undefined,
        items: cart.cart.map((item) => ({
          product_id: item.productId,
          name: item.name,
          package_size: item.packageSize,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
      });

      haptic.notification('success');

      setConfirmation({
        orderId: result.id,
        total: result.total,
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        location: form.location.trim(),
        items: [...cart.cart],
      });

      cart.clearCart();
      navigate(activeTab, 'confirmation');
    } catch (err: any) {
      haptic.notification('error');
      setOrderError(err?.message || 'Unable to place order');
    } finally {
      setSubmittingOrder(false);
      mainButton.setLoading(false);
    }
  }, [form, cart, initData, referralCode, mainButton, haptic]);

  // Telegram BackButton drives the overlay stack.
  useEffect(() => {
    if (overlay === null) {
      backButton.hide();
      return;
    }

    // Telegram's native BackButton replays the same stack as the in-app button,
    // so hardware/system back and the header chevron always agree.
    backButton.show(() => {
      haptic.selection();
      goBack();
    });

    return () => {
      backButton.hide();
    };
  }, [canGoBack, backButton, haptic, goBack]);

  // MainButton reflects the current overlay, mirroring the checkout CTA.
  useEffect(() => {
    if (overlay === 'cart' && cart.cart.length > 0) {
      mainButton.show(`Checkout - ${formatEtb(cart.cartTotal)}`, () => {
        haptic.selection();
        navigate(activeTab, 'checkout');
      });
    } else if (overlay === 'checkout') {
      mainButton.show(`Place Order - ${formatEtb(cart.cartTotal)}`, () => {
        void handlePlaceOrder();
      });
    } else if (overlay === 'details' && cart.totalCartCount > 0) {
      mainButton.show(`View Cart (${cart.totalCartCount}) - ${formatEtb(cart.cartTotal)}`, () => {
        haptic.selection();
        navigate(activeTab, 'cart');
      });
    } else {
      mainButton.hide();
    }

    return () => {
      mainButton.hide();
    };
  }, [overlay, cart.cart.length, cart.cartTotal, cart.totalCartCount, mainButton, handlePlaceOrder, haptic]);

  const overlayContent = useMemo(() => {
    switch (overlay) {
      case 'cart':
        return (
          <CartView
            cart={cart.cart}
            total={cart.cartTotal}
            referralCode={referralCode}
            onReferralCodeChange={setReferralCode}
            onIncrement={(id) => cart.updateQuantity(id, 1)}
            onDecrement={(id) => cart.updateQuantity(id, -1)}
            onRemove={cart.removeFromCart}
            onBrowse={() => navigate('store', null)}
            onCheckout={() => navigate(activeTab, 'checkout')}
          />
        );

      case 'checkout':
        return (
          <CheckoutView
            form={form}
            onChange={setForm}
            total={cart.cartTotal}
            submitting={submittingOrder}
            error={orderError}
            onSubmit={() => void handlePlaceOrder()}
          />
        );

      case 'details':
        return selectedProduct ? (
          <DetailView
            product={selectedProduct}
            selectedVariantId={
              selectedVariants[selectedProduct.name] ?? selectedProduct.variants[0]?.id
            }
            onSelectVariant={(variantId) =>
              setSelectedVariants((prev) => ({ ...prev, [selectedProduct.name]: variantId }))
            }
            onAddToCart={handleAddFromDetail}
            onBack={goBack}
          />
        ) : null;

      case 'confirmation':
        return confirmation ? (
          <ConfirmationView
            confirmation={confirmation}
            onTrackOrder={() => {
              setStatusFilter('all');
              navigate('orders', null);
            }}
            onContinueShopping={() => navigate('store', null)}
          />
        ) : null;

      case 'orderDetail':
        return selectedOrder ? (
          <OrderDetailView order={selectedOrder} onBack={goBack} />
        ) : null;

      case 'notifications':
        return (
          <NotificationsOverlay
            initData={initData}
            onClose={goBack}
            onViewOrder={(orderId) => {
              void loadOrders();
              setStatusFilter('all');
              setOrderSearch(orderId);
              navigate('orders', null);
            }}
          />
        );

      default:
        return null;
    }
  }, [
    overlay,
    cart,
    referralCode,
    form,
    submittingOrder,
    orderError,
    handlePlaceOrder,
    selectedProduct,
    selectedVariants,
    handleAddFromDetail,
    confirmation,
    selectedOrder,
  ]);

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'discover':
        return (
          <DiscoverTab
            products={groupedProducts}
            onOpenProduct={openProduct}
            onBrowseCategory={(categoryId) => {
              setActiveCategory(categoryId);
              navigate('store', null);
            }}
          />
        );

      case 'orders':
        return (
          <OrdersTab
            orders={myOrders}
            loading={loadingOrders}
            error={ordersError}
            total={ordersMeta.total}
            search={orderSearch}
            onSearchChange={setOrderSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={(value) => {
              haptic.selection();
              setStatusFilter(value);
            }}
            onRefresh={() => void loadOrders()}
            onKeepShopping={() => {
              haptic.selection();
              navigate('store', null);
            }}
            onViewDetails={(order) => {
              setSelectedOrder(order);
              navigate(activeTab, 'orderDetail');
            }}
          />
        );

      case 'account':
        return (
          <AccountTab
            telegramUser={user}
            profile={profile}
            onViewOrders={() => navigate('orders', null)}
            onBrowseStore={() => navigate('store', null)}
            onHapticImpact={(style) => haptic.impact(style)}
            onHapticNotify={(type) => haptic.notification(type)}
          />
        );

      default:
        if (productsLoading) {
          return (
            <div className="py-16 text-center text-sm text-muted">
              <div className="mb-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-brand-700 border-t-transparent" />
              <p>Loading organic catalog...</p>
            </div>
          );
        }

        if (productsError) {
          return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
              {productsError}
            </div>
          );
        }

        return (
          <StoreTab
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            sortKey={sortKey}
            onSortChange={setSortKey}
            inStockOnly={inStockOnly}
            onInStockOnlyChange={setInStockOnly}
            totalProducts={groupedProducts.length}
            onHapticSelection={() => haptic.selection()}
            products={filteredProducts}
            selectedVariants={selectedVariants}
            cart={cart.cart}
            onSelectVariant={(productName, variantId) =>
              setSelectedVariants((prev) => ({ ...prev, [productName]: variantId }))
            }
            onOpenProduct={openProduct}
            onAddToCart={cart.addToCart}
            onIncrement={(variantId) => cart.updateQuantity(variantId, 1)}
          />
        );
    }
  }, [
    activeTab,
    productsLoading,
    productsError,
    groupedProducts,
    filteredProducts,
    searchQuery,
    activeCategory,
    sortKey,
    inStockOnly,
    selectedVariants,
    cart,
    openProduct,
    myOrders,
    loadingOrders,
    ordersError,
    ordersMeta.total,
    orderSearch,
    statusFilter,
    loadOrders,
    haptic,
    profile,
    user,
  ]);

  return (
    <TmaShell
      activeTab={activeTab}
      onSelectTab={(tab) => {
        haptic.selection();
        navigate(tab, null);
      }}
      cartCount={cart.totalCartCount}
      onCartPress={() => navigate(activeTab, 'cart')}
      canGoBack={canGoBack}
      onBack={goBack}
      theme={theme.theme}
      onToggleTheme={theme.toggle}
      unreadCount={notifications.unread}
      onOpenNotifications={() => {
        haptic.selection();
        setOverlay('notifications');
        notifications.reset();
      }}
      overlay={overlayContent}
    >
      {tabContent}
    </TmaShell>
  );
};

export default TelegramStore;