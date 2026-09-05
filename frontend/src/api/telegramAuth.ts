/**
 * frontend/src/api/telegramAuth.ts
 * Asella Organic — Telegram Mini App Authentication API Client
 */

import type { TelegramWebAppUser } from '../telegram/types';

export interface TelegramAuthValidationResponse {
  success: boolean;
  valid: boolean;
  user?: TelegramWebAppUser;
  authDate?: string;
  error?: string;
}

export interface TelegramOrderItem {
  id?: string;
  order_id?: string;
  item_name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

export interface TelegramOrder {
  id: string;
  status: string;
  total: number;
  order_type: 'delivery' | 'pickup';
  city: string;
  location: string;
  created_at: string;
  payment_status: string;
  items: TelegramOrderItem[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function validateTelegramSession(initData: string): Promise<TelegramAuthValidationResponse> {
  const res = await fetch(`${API_BASE_URL}/api/telegram/validate-init-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData,
    },
    body: JSON.stringify({ initData }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      success: false,
      valid: false,
      error: data.error || `HTTP ${res.status}: Validation request failed`,
    };
  }

  return res.json();
}

export async function fetchTelegramOrders(initData?: string, chatId?: number, phone?: string): Promise<TelegramOrder[]> {
  const params = new URLSearchParams();
  if (chatId) params.set('chat_id', String(chatId));
  if (phone) params.set('phone', phone);
  if (initData) params.set('initData', initData);

  const headers: Record<string, string> = {};
  if (initData) {
    headers['x-telegram-init-data'] = initData;
  }

  const res = await fetch(`${API_BASE_URL}/api/telegram/my-orders?${params.toString()}`, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to load orders: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}
