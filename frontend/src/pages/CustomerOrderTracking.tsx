import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/storefront/Header';
import Footer from '../components/storefront/Footer';
import { useLanguage } from '../LanguageContext';

const API_BASE = (import.meta as { env: Record<string, string> }).env['VITE_API_URL'] ?? '';


interface TrackItem {
  item_name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

interface TrackHistory {
  old_status: string | null;
  new_status: string;
  note?: string | null;
  notes?: string | null;
  changed_by?: string | null;
  timestamp: string;
}

interface TrackOrder {
  id: string;
  customer_name: string;
  phone: string;
  status: string;
  total: number;
  city?: string | null;
  location?: string | null;
  order_type?: string | null;
  notes?: string | null;
  created_at: string;
  delivery_date?: string | null;
  items: TrackItem[];
  history: TrackHistory[];
}

const STEPS = [
  { key: 'pending', label: 'Order Placed', icon: 'schedule' },
  { key: 'confirmed', label: 'Confirmed', icon: 'check_circle' },
  { key: 'packed', label: 'Packed', icon: 'inventory_2' },
  { key: 'in_transit', label: 'In Transit', icon: 'local_shipping' },
  { key: 'delivered', label: 'Delivered', icon: 'package_2' },
];

const STATUS_LABELS_EN: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  packed: 'Packed',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replace(/\s+/g, '_');
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CustomerOrderTracking: React.FC = () => {
  const { orderId } = useParams();
  const [query, setQuery] = useState(orderId || '');
  const [order, setOrder] = useState<TrackOrder | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const { t } = useLanguage();

  // Use a ref to prevent double-fetching in strict mode or on remounts
  const hasFetched = useRef(false);

  // Declared with useCallback BEFORE the useEffect that references it,
  // so it's never accessed prior to declaration and has a stable
  // identity for the effect's dependency array.
  const handleSearch = useCallback(async (event?: React.FormEvent, directId?: string) => {
    event?.preventDefault();
    const searchId = (directId || query).trim();
    if (!searchId) return;

    setSearching(true);
    setNotFound(false);
    setError('');
    setOrder(null);

    try {
      const res = await fetch(`${API_BASE}/api/orders/track/${encodeURIComponent(searchId)}`);
      const contentType = res.headers.get('content-type');
      let json: any = null;
      if (contentType && contentType.includes('application/json')) {
        json = await res.json();
      }

      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        throw new Error(json?.error ?? 'Unable to track this order');
      }
      if (json && !json.success) {
        throw new Error(json.error ?? 'Unable to track this order');
      }

      setOrder(json.data as TrackOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to track this order');
    } finally {
      setSearching(false);
    }
  }, [query]);

  useEffect(() => {
    if (orderId && !hasFetched.current) {
      hasFetched.current = true;
      handleSearch(undefined, orderId);
    }
  }, [orderId, handleSearch]);

  const currentStatus = normalizeStatus(order?.status ?? 'pending');
  const currentStepIndex = useMemo(() => {
    if (currentStatus === 'cancelled') return -1;
    const idx = STEPS.findIndex(step => step.key === currentStatus);
    return idx >= 0 ? idx : 0;
  }, [currentStatus]);

  const progress = currentStepIndex <= 0 ? 0 : (currentStepIndex / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-parchment dark:bg-[#121212] flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-[900px] px-6 py-12 sm:px-8 md:py-16">

        <section className="text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-white/60 dark:bg-obsidian px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-highland-gold shadow-sm backdrop-blur-sm border border-border">
            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
            Order Tracking
          </div>
          <h1 className="font-bebas text-5xl md:text-7xl text-obsidian dark:text-white tracking-wide mb-4">
            {t('tracking.title')}
          </h1>
          <p className="text-slate-700 dark:text-slate-300 max-w-2xl mx-auto text-[18px] leading-relaxed">
            {t('tracking.desc')}
          </p>

          <form
            onSubmit={handleSearch}
            className="mx-auto mt-12 flex min-h-[76px] max-w-[700px] items-center gap-2 rounded-full border border-border bg-white dark:bg-obsidian p-2 shadow-lg hover:shadow-xl transition-shadow duration-300"
          >
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('tracking.placeholder')}
              className="min-w-0 flex-1 bg-transparent px-6 font-mono text-[18px] font-medium text-obsidian dark:text-white border-none outline-none focus:ring-0 focus:outline-none placeholder:text-gray-400"
              aria-label="Order ID"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="inline-flex min-h-[60px] items-center justify-center gap-2 rounded-full bg-obsidian text-parchment px-8 text-[15px] font-bold uppercase tracking-widest transition-all hover:bg-obsidian-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">search</span>
              {searching ? t('tracking.searching') : t('tracking.trackBtn')}
            </button>
          </form>
        </section>

        <section className="mx-auto mt-8 max-w-[720px] pb-14">
          {notFound && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              {t('tracking.notFound')}
            </div>
          )}
          {error && (
            <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              {error}
            </div>
          )}
          {order && (
            <article className="animate-fade-up space-y-6">
              <section className="rounded-3xl border border-border bg-white dark:bg-[#1a1a1a] p-8 shadow-md">
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.orderIdLabel')}</p>
                    <p className="font-mono text-[18px] font-bold text-obsidian dark:text-highland-gold">{order.id}</p>
                  </div>
                  <div className="hidden md:block" />
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.placedOnLabel')}</p>
                    <p className="font-mono text-[14px] text-obsidian dark:text-white">{new Date(order.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.customerLabel')}</p>
                    <p className="text-[15px] font-bold text-obsidian dark:text-white">{order.customer_name}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.totalAmountLabel')}</p>
                    <p className="text-[15px] font-bold text-highland-gold">{Number(order.total).toLocaleString()} {t('common.currency')}</p>
                  </div>
                  <div className="md:text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.statusLabel')}</p>
                    <p className="inline-block px-3 py-1 rounded-full bg-[#f0f5f0] dark:bg-obsidian-light text-obsidian dark:text-white text-[13px] font-bold uppercase tracking-wider">{STATUS_LABELS_EN[currentStatus] ?? order.status}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.locationLabel')}</p>
                    <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">{order.location || order.city || '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t('tracking.typeLabel')}</p>
                    <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">{order.order_type || t('tracking.typeOnline')}</p>
                  </div>
                </div>
              </section>

              {currentStatus === 'cancelled' ? (
                <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm">
                  <p className="font-bold text-lg">{t('tracking.cancelledMsg')}</p>
                  {order.notes && <p className="mt-2 text-[15px] leading-relaxed opacity-90">{order.notes}</p>}
                </section>
              ) : (
                <section className="rounded-3xl border border-border bg-white dark:bg-[#1a1a1a] p-8 shadow-md">
                  <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('tracking.progressTitle')}</p>
                  <div className="relative px-2 sm:px-4 pb-2">
                    <div className="absolute left-10 right-10 top-[20px] h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div
                      className="absolute left-10 top-[20px] h-1 bg-highland-gold transition-all duration-700 rounded-full"
                      style={{ width: `calc((100% - 5rem) * ${progress / 100})` }}
                    />
                    <div className="relative grid grid-cols-5 gap-2">
                      {STEPS.map((step, index) => {
                        const past = index < currentStepIndex;
                        const active = index === currentStepIndex;
                        return (
                          <div key={step.key} className="flex flex-col items-center text-center">
                            <div className={`flex h10 w-10 sm:h-[42px] sm:w-[42px] items-center justify-center rounded-full border-[3px] bg-white transition-all duration-300 z-10 ${
                              active
                                ? 'border-highland-gold text-highland-gold shadow-[0_0_15px_rgba(200,150,10,0.3)] scale-110'
                                : past
                                  ? 'border-obsidian bg-obsidian text-white'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:bg-[#1a1a1a]'
                            }`}>
                              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">{step.icon}</span>
                            </div>
                            <span className={`mt-4 max-w-[80px] font-mono text-[10px] uppercase tracking-widest font-bold leading-snug transition-colors duration-300 ${active ? 'text-highland-gold' : past ? 'text-obsidian dark:text-white' : 'text-gray-400'}`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {order.items.length > 0 && (
                <section className="rounded-3xl border border-border bg-white dark:bg-[#1a1a1a] p-8 shadow-md">
                  <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('tracking.itemsTitle')}</p>
                  <div className="overflow-hidden rounded-2xl border border-border bg-transparent">
                    {order.items.length === 0 ? (
                      <p className="p-6 text-[15px] text-slate-500">{t('tracking.noItemsMsg')}</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {order.items.map((item, index) => (
                          <div key={`${item.item_name}-${index}`} className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50 dark:hover:bg-[#222] transition-colors">
                            <div>
                              <p className="font-bold text-[16px] text-obsidian dark:text-white">{item.item_name}</p>
                              <p className="text-[14px] text-slate-500 mt-0.5">{item.package_size} &times; {item.quantity}</p>
                            </div>
                            <p className="font-mono text-[15px] font-bold text-highland-gold">
                              {Number(item.unit_price * item.quantity).toLocaleString()} {t('common.currency')}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="rounded-3xl border border-border bg-white dark:bg-[#1a1a1a] p-8 shadow-md">
                <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{t('tracking.timelineTitle')}</p>
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {order.history.length === 0 && (
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border-4 border-white dark:border-[#1a1a1a] bg-highland-gold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2" />
                      <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-4 rounded-xl border border-border bg-slate-50 dark:bg-obsidian-light shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[14px] font-bold text-obsidian dark:text-white">{t('tracking.orderPlacedTitle')}</p>
                          <span className="font-mono text-[10px] text-slate-500">{formatDate(order.created_at)}</span>
                        </div>
                        <p className="text-[13px] text-slate-600 dark:text-slate-400">{t('tracking.orderPlacedDesc')}</p>
                      </div>
                    </div>
                  )}
                  {order.history.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border-4 border-white dark:border-[#1a1a1a] bg-highland-gold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2" />
                      <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-4 rounded-xl border border-border bg-slate-50 dark:bg-[#222] shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[14px] font-bold text-obsidian dark:text-white">{entry.new_status}</p>
                          <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap ml-3">{formatDate(entry.timestamp)}</span>
                        </div>
                        {(entry.note || entry.notes) && <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-1">{entry.note || entry.notes}</p>}
                      </div>
                    </div>
                  ))}
                  </div>
              </section>
            </article>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CustomerOrderTracking;
