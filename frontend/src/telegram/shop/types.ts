/**
 * frontend/src/telegram/shop/types.ts
 * Shared types for the Telegram Mini App tabbed shop.
 */

export interface CartItem {
  productId: string;
  name: string;
  packageSize: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
}

export interface OrderConfirmation {
  orderId: string;
  total: number;
  customerName: string;
  phone: string;
  city: string;
  location: string;
  items: CartItem[];
}

export interface CustomerOrderItem {
  item_name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

export interface CustomerOrder {
  id: string;
  status: string;
  total: number;
  order_type: string;
  city: string;
  location: string;
  created_at: string;
  payment_status?: string;
  customer_name?: string;
  items: CustomerOrderItem[];
}

export interface OrdersMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface TelegramProfile {
  display_name: string;
  phone: string;
  city: string;
  location: string;
  updated_at: string | null;
}

export interface ProfileStats {
  order_count: number;
  delivered_count: number;
  active_count: number;
  total_spent: number;
}

export interface ProfileResponse {
  chat_id: number;
  telegram: {
    username: string | null;
    first_name: string;
    last_name: string | null;
    photo_url: string | null;
    is_premium: boolean;
  };
  profile: TelegramProfile;
  stats: ProfileStats;
}

export interface ProfileUpdate {
  display_name: string;
  phone: string;
  city: string;
  location: string;
}

/** Bottom tab identifiers, mirroring the Telegram bot's menu entries. */
export type TmaTab = 'store' | 'discover' | 'orders' | 'account';

/** Full-screen overlays pushed above the tab bar, driven by the MainButton. */
export type TmaView = 'tabs' | 'cart' | 'checkout' | 'details' | 'confirmation';

export type OrderStatusFilter = 'all' | 'processing' | 'delivered' | 'refunded';

export interface StatusTone {
  label: string;
  className: string;
}

/** Maps an order status onto the pill styling used by the Orders tab. */
export function orderStatusTone(status: string): StatusTone {
  switch (status) {
    case 'Delivered':
      return { label: 'Delivered', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
    case 'Cancelled':
    case 'Returned':
      return { label: status, className: 'bg-stone-100 text-stone-600 ring-stone-200' };
    case 'Issue':
      return { label: 'Issue', className: 'bg-red-50 text-red-700 ring-red-200' };
    case 'In Transit':
    case 'Out for Delivery':
      return { label: status, className: 'bg-blue-50 text-blue-700 ring-blue-200' };
    case 'Packed':
    case 'Confirmed':
      return { label: status, className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' };
    default:
      return { label: status, className: 'bg-amber-50 text-amber-700 ring-amber-200' };
  }
}

export function formatEtb(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  return `ETB ${amount.toLocaleString()}`;
}

export function formatOrderDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}