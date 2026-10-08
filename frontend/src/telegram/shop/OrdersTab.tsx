/**
 * frontend/src/telegram/shop/OrdersTab.tsx
 * Orders tab: search, status filter chips and order cards.
 */

import type { CustomerOrder, OrderStatusFilter } from './types';
import { formatEtb, formatOrderDate, orderStatusTone } from './types';

const STATUS_FILTERS: Array<{ id: OrderStatusFilter; label: string }> = [
  { id: 'all', label: 'All orders' },
  { id: 'processing', label: 'Processing' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'refunded', label: 'Refunded' },
];

export interface OrdersTabProps {
  orders: CustomerOrder[];
  loading: boolean;
  error: string | null;
  total: number;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: OrderStatusFilter;
  onStatusFilterChange: (value: OrderStatusFilter) => void;
  onRefresh: () => void;
  onKeepShopping: () => void;
  onViewDetails: (order: CustomerOrder) => void;
}

export function OrderCard({
  order,
  onViewDetails,
}: {
  order: CustomerOrder;
  onViewDetails: (order: CustomerOrder) => void;
}) {
  const tone = orderStatusTone(order.status);
  const firstItem = order.items[0];
  const extraItems = Math.max(0, order.items.length - 1);

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-brand-50 px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone.className}`}
        >
          <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
          {tone.label}
        </span>
        <span className="text-xs text-muted">{formatOrderDate(order.created_at)}</span>
      </div>

      <div className="flex gap-3 p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">
          {firstItem ? (
            <span className="flex h-full w-full items-center justify-center px-1 text-center font-mono text-xs text-muted">
              {firstItem.item_name}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {firstItem?.item_name ?? 'Order'}
          </p>
          <p className="text-xs text-muted">
            Asella Organic
            {firstItem ? ` · Qty ${firstItem.quantity}` : ''}
            {extraItems > 0 ? ` · +${extraItems} more` : ''}
          </p>
          <p className="mt-1 font-mono font-heading text-base font-bold text-brand-700">
            {formatEtb(order.total)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-brand-50 px-3 py-2">
        <span className="font-mono text-xs text-muted">{order.id}</span>
        <button
          type="button"
          onClick={() => onViewDetails(order)}
          className="flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-ink"
        >
          View my items
          <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function OrdersTab({
  orders,
  loading,
  error,
  total,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onKeepShopping,
  onViewDetails,
}: OrdersTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">My orders</h1>
          <p className="mt-0.5 text-xs text-muted">
            Your organic finds, all in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={onKeepShopping}
          className="shrink-0 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-ink"
        >
          Keep shopping
        </button>
      </div>

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search your purchases or order ID"
          aria-label="Search orders"
          className="w-full rounded-full border border-line bg-panel py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUS_FILTERS.map((filter) => {
          const isActive = filter.id === statusFilter;

          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onStatusFilterChange(filter.id)}
              aria-pressed={isActive}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-solid text-white'
                  : 'border border-line bg-panel text-ink2'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-1 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <p className="text-xs text-muted">
        {loading ? 'Loading orders...' : `${total} order${total === 1 ? '' : 's'}`}
      </p>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-xl border border-line bg-panel" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-muted">No orders found for this filter.</p>
          <button
            type="button"
            onClick={onKeepShopping}
            className="mt-3 rounded-lg bg-brand-solid px-4 py-2 text-xs font-semibold text-white"
          >
            Browse the store
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onViewDetails={onViewDetails} />
          ))}
        </ul>
      )}
    </div>
  );
}