/**
 * frontend/src/telegram/shop/ConfirmationView.tsx
 * Order confirmation and order-detail overlays.
 */

import type { CustomerOrder, OrderConfirmation } from './types';
import { formatEtb, formatOrderDate, orderStatusTone } from './types';

export interface ConfirmationViewProps {
  confirmation: OrderConfirmation;
  onTrackOrder: () => void;
  onContinueShopping: () => void;
}

export function ConfirmationView({
  confirmation,
  onTrackOrder,
  onContinueShopping,
}: ConfirmationViewProps) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 font-heading text-lg font-bold text-brand-800">
        OK
      </div>
      <h1 className="font-heading text-base font-bold text-ink">Order Received</h1>
      <p className="mb-4 mt-1 text-xs text-ink2">
        Thank you {confirmation.customerName}. Your order has been placed and registered.
      </p>

      <dl className="mb-4 space-y-1 rounded-lg border border-line bg-cream p-3 text-left text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">Order ID:</dt>
          <dd className="font-mono font-bold text-ink">{confirmation.orderId}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Total:</dt>
          <dd className="font-mono font-bold text-brand-900">{formatEtb(confirmation.total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Destination:</dt>
          <dd className="text-ink">
            {confirmation.location}, {confirmation.city}
          </dd>
        </div>
      </dl>

      <p className="mb-4 text-xs leading-relaxed text-muted">
        We have dispatched your order details to our delivery team and sent an official receipt to
        your Telegram chat.
      </p>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onTrackOrder}
          className="w-full rounded-lg bg-ink py-2 text-xs font-semibold text-white hover:bg-ink"
        >
          Track Order Status
        </button>
        <button
          type="button"
          onClick={onContinueShopping}
          className="w-full rounded-lg border border-line py-2 text-xs font-semibold text-ink2 hover:bg-cream"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
}

export interface OrderDetailViewProps {
  order: CustomerOrder;
  onBack: () => void;
}

export function OrderDetailView({ order, onBack }: OrderDetailViewProps) {
  const tone = orderStatusTone(order.status);

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-xs text-muted hover:text-ink"
      >
        Back to orders
      </button>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="font-mono text-sm font-bold text-ink">{order.id}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone.className}`}
        >
          {tone.label}
        </span>
      </div>

      <p className="mb-3 text-xs text-muted">{formatOrderDate(order.created_at)}</p>

      <ul className="space-y-1.5 border-y border-line py-3 text-xs">
        {order.items.map((item, index) => (
          <li key={`${item.item_name}-${index}`} className="flex justify-between gap-3 text-ink2">
            <span>
              {item.item_name} [{item.package_size}] x {item.quantity}
            </span>
            <span className="shrink-0 font-mono">
              {formatEtb(item.quantity * item.unit_price)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex justify-between text-sm font-bold text-ink">
        <span>Total</span>
        <span className="font-mono text-brand-900">{formatEtb(order.total)}</span>
      </div>

      <dl className="mt-3 space-y-1 rounded-lg border border-line bg-cream p-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">Destination:</dt>
          <dd className="text-right text-ink">
            {order.location}, {order.city}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Payment:</dt>
          <dd className="text-ink">{order.payment_status ?? 'Pending'}</dd>
        </div>
      </dl>
    </div>
  );
}