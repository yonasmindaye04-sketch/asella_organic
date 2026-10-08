/**
 * frontend/src/telegram/shop/CartView.tsx
 * Full-screen cart overlay bound to the Telegram MainButton.
 */

import type { CartItem } from './types';
import { formatEtb } from './types';

export interface CartViewProps {
  cart: CartItem[];
  total: number;
  referralCode: string;
  onReferralCodeChange: (value: string) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onBrowse: () => void;
  onCheckout: () => void;
}

export function CartView({
  cart,
  total,
  referralCode,
  onReferralCodeChange,
  onIncrement,
  onDecrement,
  onRemove,
  onBrowse,
  onCheckout,
}: CartViewProps) {
  if (cart.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-sm text-muted">Your cart is empty.</p>
        <button
          type="button"
          onClick={onBrowse}
          className="rounded-lg bg-brand-solid px-4 py-2 text-xs font-semibold text-white"
        >
          Browse products
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b border-brand-50 pb-3">
        <h1 className="font-heading text-base font-bold text-ink">Shopping Cart</h1>
        <span className="font-mono text-xs text-muted">
          {cart.reduce((sum, item) => sum + item.quantity, 0)} item(s)
        </span>
      </div>

      <ul className="divide-y divide-brand-50">
        {cart.map((item) => (
          <li key={item.productId} className="flex items-center justify-between gap-2 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-12 w-12 shrink-0 rounded-md border border-brand-50 object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink">{item.name}</p>
                <span className="block text-xs text-muted">{item.packageSize}</span>
                <span className="block font-mono text-xs font-bold text-brand-900">
                  {formatEtb(item.unitPrice * item.quantity)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-md border border-line bg-brand-50 p-0.5">
                <button
                  type="button"
                  onClick={() => onDecrement(item.productId)}
                  aria-label={`Decrease ${item.name} quantity`}
                  className="flex h-6 w-6 items-center justify-center rounded bg-panel text-xs font-bold text-ink2"
                >
                  -
                </button>
                <span className="px-1 font-mono text-xs font-semibold">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => onIncrement(item.productId)}
                  aria-label={`Increase ${item.name} quantity`}
                  className="flex h-6 w-6 items-center justify-center rounded bg-panel text-xs font-bold text-ink2"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.productId)}
                aria-label={`Remove ${item.name}`}
                className="p-1 text-muted hover:text-red-600"
              >
                <i className="fa-solid fa-trash-can text-[13px]" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-brand-50 pt-3">
        <label htmlFor="tma-referral" className="mb-1 block text-xs font-semibold text-ink2">
          Referral or Affiliate Code (Optional)
        </label>
        <input
          id="tma-referral"
          type="text"
          value={referralCode}
          onChange={(event) => onReferralCodeChange(event.target.value.toUpperCase())}
          placeholder="e.g. ASL-789"
          className="w-full rounded-lg border border-line bg-cream px-3 py-1.5 font-mono text-xs uppercase focus:border-brand-700 focus:outline-none"
        />
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
        <div className="flex justify-between text-ink2">
          <dt>Subtotal</dt>
          <dd className="font-mono">{formatEtb(total)}</dd>
        </div>
        <div className="flex justify-between text-ink2">
          <dt>Delivery</dt>
          <dd className="font-medium text-brand-700">Calculated upon dispatch</dd>
        </div>
        <div className="flex justify-between border-t border-brand-50 pt-1 text-sm font-bold text-ink">
          <dt>Total</dt>
          <dd className="font-mono text-brand-900">{formatEtb(total)}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onCheckout}
        className="mt-5 w-full rounded-lg bg-brand-solid py-2.5 text-xs font-semibold text-white shadow-sm hover:brightness-95"
      >
        Proceed to Checkout
      </button>
    </div>
  );
}