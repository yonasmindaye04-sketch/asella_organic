/**
 * frontend/src/telegram/shop/api.ts
 * Typed client for the Telegram Mini App endpoints.
 *
 * Every call is authenticated with the signed `initData` payload. The backend
 * rejects requests without a valid HMAC signature, so there is no fallback to
 * a caller-supplied chat id.
 */

import type {
  CustomerOrder,
  OrdersMeta,
  ProfileResponse,
  ProfileUpdate,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export class MiniAppApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MiniAppApiError';
    this.status = status;
  }
}

/** Returns the whole `{ success, data, meta }` envelope. */
async function requestEnvelope(
  path: string,
  initData: string,
  init?: RequestInit
): Promise<{ data: any; meta?: any }> {
  const response = await fetch(`${API_BASE_URL}/api/telegram${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData,
      ...(init?.headers ?? {}),
    },
  });

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new MiniAppApiError(`Unexpected response (${response.status})`, response.status);
  }

  if (!response.ok || !payload?.success) {
    throw new MiniAppApiError(
      payload?.error || `Request failed (${response.status})`,
      response.status
    );
  }

  return { data: payload?.data, meta: payload?.meta };
}

/** Returns only the `data` field of a successful envelope. */
async function request<T>(path: string, initData: string, init?: RequestInit): Promise<T> {
  const { data } = await requestEnvelope(path, initData, init);
  return data as T;
}

export interface OrdersQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface OrdersResult {
  orders: CustomerOrder[];
  meta: OrdersMeta;
}

export async function fetchMyOrders(
  initData: string,
  query: OrdersQuery = {}
): Promise<OrdersResult> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));

  const suffix = params.toString();
const envelope = await requestEnvelope(`/my-orders${suffix ? `?${suffix}` : ''}`, initData);

  return {
    orders: Array.isArray(envelope.data) ? (envelope.data as CustomerOrder[]) : [],
    meta: envelope.meta ?? { total: 0, page: 1, limit: 20, pages: 0 },
  };
}

export async function fetchProfile(initData: string): Promise<ProfileResponse> {
  return request<ProfileResponse>('/profile', initData);
}

export async function updateProfile(
  initData: string,
  payload: ProfileUpdate
): Promise<{ chat_id: number; profile: ProfileResponse['profile'] }> {
  return request('/profile', initData, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export interface PlaceOrderItem {
  name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

export interface PlaceOrderPayload {
  customer_name: string;
  phone: string;
  city: string;
  location: string;
  order_type: 'delivery';
  notes?: string;
  referral_code?: string;
  items: PlaceOrderItem[];
}

export async function placeOrder(
  initData: string,
  payload: PlaceOrderPayload
): Promise<{ id: string; total: number }> {
  return request('/app-order', initData, {
    method: 'POST',
    body: JSON.stringify({ ...payload, initData }),
  });
}

// ── Persisted per-customer state ──────────────────────────────────────

export interface PersistedPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'am' | 'or';
  referralCode: string;
  category: string;
  sort: string;
}

export interface MiniAppState {
  cart: Array<{
    productId: string;
    name: string;
    packageSize: string;
    unitPrice: number;
    quantity: number;
    imageUrl?: string;
  }>;
  preferences: Partial<PersistedPreferences>;
  updated_at: string | null;
}

export async function fetchState(initData: string): Promise<MiniAppState> {
  return request<MiniAppState>('/state', initData);
}

export async function saveState(
  initData: string,
  payload: { cart: unknown[]; preferences: Partial<PersistedPreferences> }
): Promise<MiniAppState> {
  return request<MiniAppState>('/state', initData, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function clearState(initData: string): Promise<MiniAppState> {
  return request<MiniAppState>('/state', initData, { method: 'DELETE' });
}

// ── Notifications ─────────────────────────────────────────────────────

export interface CustomerNotification {
  id: string;
  order_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(
  initData: string
): Promise<{ notifications: CustomerNotification[]; unread: number }> {
  return request('/notifications', initData);
}

export async function fetchUnreadCount(initData: string): Promise<number> {
  const data = await request<{ unread: number }>('/notifications/unread-count', initData);
  return data.unread;
}

export async function markNotificationsRead(
  initData: string,
  ids?: string[]
): Promise<void> {
  await request('/notifications/read', initData, {
    method: 'POST',
    body: JSON.stringify(ids ? { ids } : {}),
  });
}