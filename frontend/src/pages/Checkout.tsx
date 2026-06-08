/**
 * frontend/src/pages/Checkout.tsx
 *
 * Customer-facing checkout page. No account required — customers
 * fill in name, phone, address, and the cart contents, and the order
 * is placed via POST /api/v1/orders.
 *
 * Flow:
 *   1. Cart is held in localStorage (`asella-cart`) as an array of
 *      { product_id, name, package_size, quantity, unit_price }.
 *   2. Customer fills in contact info + delivery address.
 *   3. We POST to /api/v1/orders with the cart + customer info.
 *   4. On success, we show a confirmation with the order ID and a
 *      /track/:id link so the customer can check status.
 *
 * Cart management: add/remove items, change quantities, see totals.
 * The cart is sticky (localStorage) so it survives page reloads.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useToast } from '../components/ui/ToastProvider';
import Header from '../components/storefront/Header';
import Footer from '../components/storefront/Footer';
import { OptimizedImage } from '../components/ui/OptimizedImage';

interface CartItem {
  product_id:   string;
  name:         string;
  package_size: string;
  quantity:    number;
  unit_price:  number;
  image_url?:   string;
}

const CART_KEY = 'asella-cart';

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveCart(cart: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

interface CheckoutForm {
  customer_name: string;
  phone:         string;
  email:         string;
  city:          string;
  location:      string;
  notes:         string;
}

const EMPTY_FORM: CheckoutForm = {
  customer_name: '',
  phone:         '+251',
  email:         '',
  city:          'Addis Ababa',
  location:      '',
  notes:         '',
};

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { products, loading: productsLoading } = useProducts();
  const [cart, setCart] = useState<CartItem[]>(loadCart);
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    orderId: string;
    total:    number;
  } | null>(null);

  useEffect(() => { saveCart(cart); }, [cart]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
    [cart]
  );

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((it) => it.product_id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.product_id === product.id
            ? { ...it, quantity: it.quantity + 1 }
            : it
        );
      }
      return [...prev, {
        product_id:   product.id,
        name:         product.name,
        package_size: product.package_size,
        quantity:     1,
        unit_price:   Number(product.price),
        image_url:    product.image_url,
      }];
    });
    toast({ message: `Added ${product.name} to cart`, type: 'success' });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) => prev.map((it) =>
      it.product_id === productId ? { ...it, quantity } : it
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((it) => it.product_id !== productId));
  };

  const isValid =
    form.customer_name.trim().length >= 2 &&
    form.phone.replace(/\D/g, '').length >= 7 &&
    form.location.trim().length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      toast({ message: 'Please fill in your name, phone, and address', type: 'error' });
      return;
    }
    if (cart.length === 0) {
      toast({ message: 'Your cart is empty', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source:        'website',
          order_type:    'delivery',
          customer_name: form.customer_name.trim(),
          phone:         form.phone.trim(),
          email:         form.email.trim() || undefined,
          city:          form.city.trim(),
          location:      form.location.trim(),
          notes:         form.notes.trim() || undefined,
          items:         cart.map((it) => ({
            name:         it.name,
            package_size: it.package_size,
            quantity:     it.quantity,
            unit_price:   it.unit_price,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `Order failed (${res.status})`);
      }

      setConfirmation({ orderId: data.data.id, total });
      setCart([]);
      toast({ message: 'Order placed successfully!', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order failed';
      toast({ message: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Confirmation view ────────────────────────────────────────────
  if (confirmation) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-3xl">
              ✓
            </div>
            <h1 className="text-2xl font-bold text-stone-800 mb-2">Order placed!</h1>
            <p className="text-stone-600 mb-6">
              Your order has been received. We'll send you a Telegram message
              when it's ready for delivery.
            </p>
            <div className="bg-stone-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-stone-500 mb-1">Order ID</p>
              <p className="font-mono text-lg font-semibold text-stone-800">
                {confirmation.orderId}
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Link
                to={`/track/${confirmation.orderId}`}
                className="px-6 py-3 bg-[#0d1f10] text-white rounded-full font-semibold hover:bg-[#1a3520] transition"
              >
                Track order
              </Link>
              <Link
                to="/"
                className="px-6 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold hover:bg-stone-200 transition"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-stone-800 mb-8">Checkout</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Cart items (left, 2/3) ──────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="text-xl font-semibold text-stone-800 mb-4">
                Your cart ({cart.length})
              </h2>

              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-stone-500 mb-4">Your cart is empty.</p>
                  <Link
                    to="/"
                    className="text-[#0d1f10] font-semibold hover:underline"
                  >
                    Browse products →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-stone-200">
                  {cart.map((item) => (
                    <li
                      key={item.product_id}
                      className="py-4 flex gap-4 items-center"
                    >
                      {item.image_url ? (
                        <OptimizedImage
                          src={item.image_url}
                          alt={item.name}
                          aspectRatio={1}
                          className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden"
                          imgClassName="object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-stone-100" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-800 truncate">
                          {item.name}
                        </p>
                        <p className="text-sm text-stone-500">
                          {item.package_size} · ETB {item.unit_price}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                          className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                          className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200"
                        >
                          +
                        </button>
                      </div>
                      <div className="w-20 text-right font-semibold text-stone-800">
                        ETB {(item.unit_price * item.quantity).toFixed(0)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product_id)}
                        className="ml-2 text-stone-400 hover:text-red-500"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ── Add more from catalog ──────────────────────────── */}
              {cart.length > 0 && (
                <details className="mt-4 border-t border-stone-200 pt-4">
                  <summary className="cursor-pointer text-stone-600 font-medium">
                    + Add more items
                  </summary>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                    {products
                      .filter((p: any) => !cart.find((c) => c.product_id === p.id))
                      .slice(0, 12)
                      .map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addToCart(p)}
                          className="text-left p-3 border border-stone-200 rounded-lg hover:border-[#0d1f10] transition"
                        >
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-xs text-stone-500">ETB {Number(p.price)}</p>
                        </button>
                      ))}
                  </div>
                </details>
              )}
            </div>

            {/* ── Contact & delivery info ──────────────────────────── */}
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6">
              <h2 className="text-xl font-semibold text-stone-800 mb-4">
                Delivery details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Full name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d1f10]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d1f10]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d1f10]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d1f10]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Delivery address *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    placeholder="Sub-city, kebele, specific area"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d1f10]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d1f10]"
                    placeholder="Building, floor, delivery instructions…"
                  />
                </div>
              </div>
            </form>
          </div>

          {/* ── Order summary (right, 1/3) ─────────────────────────── */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow p-6 sticky top-6">
              <h2 className="text-xl font-semibold text-stone-800 mb-4">Order summary</h2>
              <div className="space-y-2 mb-4">
                {cart.length === 0 ? (
                  <p className="text-stone-500 text-sm">No items yet</p>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.product_id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-stone-600 truncate pr-2">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="text-stone-800 font-medium whitespace-nowrap">
                        ETB {(item.unit_price * item.quantity).toFixed(0)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-stone-200 pt-4">
                <div className="flex justify-between text-lg font-bold text-stone-800">
                  <span>Total</span>
                  <span>ETB {total.toFixed(0)}</span>
                </div>
                <p className="text-xs text-stone-500 mt-2">
                  Cash on delivery. Payment collected when your order arrives.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isValid || cart.length === 0 || submitting}
                className="w-full mt-6 px-6 py-3 bg-[#0d1f10] text-white rounded-full font-semibold hover:bg-[#1a3520] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Placing order…' : 'Place order'}
              </button>
              <p className="text-xs text-stone-500 text-center mt-3">
                No account required
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Checkout;
