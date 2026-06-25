import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/storefront/Header';
import Footer from '../components/storefront/Footer';

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

const STATUS_LABELS: Record<string, string> = {
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
  
  // Use a ref to prevent double-fetching in strict mode or on remounts
  const hasFetched = useRef(false);

  useEffect(() => {
    if (orderId && !hasFetched.current) {
      hasFetched.current = true;
      handleSearch(undefined, orderId);
    }
  }, [orderId]);

  const currentStatus = normalizeStatus(order?.status ?? 'pending');
  const currentStepIndex = useMemo(() => {
    if (currentStatus === 'cancelled') return -1;
    const idx = STEPS.findIndex(step => step.key === currentStatus);
    return idx >= 0 ? idx : 0;
  }, [currentStatus]);

  const progress = currentStepIndex <= 0 ? 0 : (currentStepIndex / (STEPS.length - 1)) * 100;

  const handleSearch = async (event?: React.FormEvent, directId?: string) => {
    event?.preventDefault();
    const searchId = (directId || query).trim();
    if (!searchId) return;

    setSearching(true);
    setNotFound(false);
    setError('');
    setOrder(null);

    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(searchId)}`);
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
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#083b11] flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-[840px] px-6 py-6 sm:px-8 md:py-8">

        <section className="pt-12 text-center md:pt-10">
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full bg-[#083b11] px-6 py-3 font-mono text-sm uppercase tracking-[0.18em] text-[#c5a059] shadow-sm">
            <span className="material-symbols-outlined text-[18px]">eco</span>
            Order Tracking
          </div>
          <h1 className="font-sans text-[44px] font-black leading-none tracking-[-0.04em] text-[#083b11] sm:text-[58px] md:text-[64px]">
            Track Your Order
          </h1>
          <p className="mt-7 text-[22px] font-medium leading-8 text-[#4d875a]">
            Enter your Order ID to see real-time status updates.
          </p>

          <form
            onSubmit={handleSearch}
            className="mx-auto mt-16 flex min-h-[82px] max-w-[840px] items-center gap-3 rounded-[20px] border border-[#cfe1d1] bg-white/80 p-2.5 shadow-[0_2px_8px_rgba(13,46,16,0.12)]"
          >
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Enter Order ID (e.g. ORD-001234)"
              className="min-w-0 flex-1 bg-transparent px-5 font-mono text-[20px] font-medium text-[#083b11] outline-none placeholder:text-[#9ca3b6]"
              aria-label="Order ID"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="inline-flex min-h-[60px] items-center justify-center gap-2 rounded-[16px] bg-[#083b11] px-7 text-base font-black text-white transition hover:bg-[#14551e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[22px]">search</span>
              {searching ? 'Tracking...' : 'Track'}
            </button>
          </form>
        </section>

        <section className="mx-auto mt-8 max-w-[720px] pb-14">
          {notFound && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              No order was found for that ID. Check the order number and try again.
            </div>
          )}
          {error && (
            <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              {error}
            </div>
          )}
          {order && (
            <article className="animate-fade-up space-y-6">
              <section className="rounded-[20px] border border-[#cfe1d1] bg-white/80 p-5 shadow-sm">
                <div className="grid grid-cols-2 gap-x-10 gap-y-4 md:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Order ID</p>
                    <p className="mt-1 font-mono text-[18px] font-black text-[#083b11]">{order.id}</p>
                  </div>
                  <div className="hidden md:block" />
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Placed</p>
                    <p className="mt-1 font-mono text-xs text-[#083b11]">{new Date(order.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Customer</p>
                    <p className="mt-1 text-sm font-semibold text-[#083b11]">{order.customer_name}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Total</p>
                    <p className="mt-1 text-sm font-semibold text-[#083b11]">{Number(order.total).toLocaleString()} ETB</p>
                  </div>
                  <div className="md:text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Status</p>
                    <p className="mt-1 text-sm font-semibold text-[#083b11]">{STATUS_LABELS[currentStatus] ?? order.status}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Location</p>
                    <p className="mt-1 text-sm font-semibold text-[#083b11]">{order.location || order.city || '-'}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Type</p>
                    <p className="mt-1 text-sm font-semibold text-[#083b11]">{order.order_type || 'Online'}</p>
                  </div>
                </div>
              </section>

              {currentStatus === 'cancelled' ? (
                <section className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-red-900">
                  <p className="font-bold">This order has been cancelled.</p>
                  {order.notes && <p className="mt-2 text-sm leading-6">{order.notes}</p>}
                </section>
              ) : (
                <section className="rounded-[20px] border border-[#cfe1d1] bg-white/80 p-5 shadow-sm">
                  <p className="mb-7 font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Order Progress</p>
                  <div className="relative px-4 pb-2">
                    <div className="absolute left-9 right-9 top-[15px] h-px bg-[#cfe1d1]" />
                    <div
                      className="absolute left-9 top-[15px] h-px bg-[#c5a059] transition-all duration-700"
                      style={{ width: `calc((100% - 4.5rem) * ${progress / 100})` }}
                    />
                    <div className="relative grid grid-cols-5 gap-2">
                      {STEPS.map((step, index) => {
                        const past = index < currentStepIndex;
                        const active = index === currentStepIndex;
                        return (
                          <div key={step.key} className="flex flex-col items-center text-center">
                            <div className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border transition ${
                              active
                                ? 'bg-[#d9b867] text-[#083b11] border-[#c5a059] shadow-[0_0_0_5px_rgba(197,160,89,0.22)]'
                                : past
                                  ? 'border-[#083b11] bg-[#083b11] text-white'
                                  : 'border-[#cfe1d1] bg-white text-[#6e9a73]'
                            }`}>
                              <span className="material-symbols-outlined text-[14px]">{step.icon}</span>
                            </div>
                            <span className="mt-2 max-w-[70px] font-mono text-[10px] font-semibold leading-[1.15] text-[#083b11]">
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
                <section className="rounded-[20px] border border-[#cfe1d1] bg-white/80 p-5 shadow-sm">
                  <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Items</p>
                  <div className="overflow-hidden rounded-2xl border border-[#e8f0e6] bg-white">
                    {order.items.length === 0 ? (
                      <p className="p-4 text-sm text-[#547255]">No item details available.</p>
                    ) : (
                      order.items.map((item, index) => (
                        <div key={`${item.item_name}-${index}`} className="flex items-center justify-between gap-4 border-b border-[#e8f0e6] p-4 last:border-b-0">
                          <div>
                            <p className="font-bold text-[#0D2E10]">{item.item_name}</p>
                            <p className="text-sm text-[#547255]">{item.package_size} x {item.quantity}</p>
                          </div>
                          <p className="font-mono text-sm font-bold text-[#0D2E10]">
                            {Number(item.unit_price * item.quantity).toLocaleString()} ETB
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              <section className="rounded-[20px] border border-[#cfe1d1] bg-white/80 p-5 shadow-sm">
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#4d875a]">Change History</p>
                <div className="space-y-3">
                  {order.history.length === 0 && (
                    <div className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c5a059]" />
                      <div>
                        <p className="text-sm font-semibold text-[#083b11]">Order placed</p>
                        <p className="text-xs text-[#4d875a]">Your order has been received.</p>
                        <p className="mt-1 font-mono text-[11px] text-[#4d875a]">Customer - {formatDate(order.created_at)}</p>
                      </div>
                    </div>
                  )}
                  {order.history.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c5a059]" />
                      <div>
                        <p className="text-sm font-semibold text-[#083b11]">
                          Status changed from {entry.old_status ?? 'Created'} to {entry.new_status}
                        </p>
                        {(entry.note || entry.notes) && <p className="text-xs text-[#4d875a]">{entry.note || entry.notes}</p>}
                        <p className="mt-1 font-mono text-[11px] text-[#4d875a]">
                          {(entry.changed_by ?? 'Asella team')} - {formatDate(entry.timestamp)}
                        </p>
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
