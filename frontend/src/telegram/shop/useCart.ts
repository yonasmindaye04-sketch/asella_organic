/**
 * frontend/src/telegram/shop/useCart.ts
 * Cart state for the Telegram Mini App, persisted to localStorage so a
 * half-finished basket survives closing the Mini App.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GroupedProduct, Variant } from '../../hooks/useProducts';
import { resolveProductImage } from '../../utils/image';
import type { CartItem } from './types';

const STORAGE_KEY = 'asella_tma_cart';

function readStoredCart(): CartItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export interface UseCartOptions {
  onHaptic?: (style: 'light' | 'medium') => void;
  onNotify?: (type: 'error' | 'success' | 'warning') => void;
}

export interface UseCartReturn {
  cart: CartItem[];
  cartTotal: number;
  totalCartCount: number;
  addToCart: (product: GroupedProduct, variant: Variant) => void;
  updateQuantity: (productId: string, delta: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  quantityOf: (variantId: string | undefined) => number;
  /** Overwrites the cart wholesale, e.g. when hydrating from the server. */
  replace: (items: unknown[]) => void;
}

export interface UseCartOptions {
  onHaptic?: (style: 'light' | 'medium') => void;
  onNotify?: (type: 'error' | 'success' | 'warning') => void;
}

export function useCart({ onHaptic, onNotify }: UseCartOptions = {}): UseCartReturn {
  const [cart, setCart] = useState<CartItem[]>(readStoredCart);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage may be unavailable in private mode; the cart still works in-memory.
    }
  }, [cart]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart]
  );

  const totalCartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const addToCart = useCallback(
    (product: GroupedProduct, variant: Variant) => {
      onHaptic?.('medium');

      setCart((prev) => {
        const existing = prev.find((item) => item.productId === variant.id);
        if (existing) {
          if (existing.quantity >= variant.inventory_quantity) {
            onNotify?.('warning');
            return prev;
          }
          return prev.map((item) =>
            item.productId === variant.id ? { ...item, quantity: item.quantity + 1 } : item
          );
        }

        return [
          ...prev,
          {
            productId: variant.id,
            name: product.name,
            packageSize: variant.package_size,
            unitPrice: Number(variant.price),
            quantity: 1,
            imageUrl: resolveProductImage(product.image_url, product.name),
          },
        ];
      });
    },
    [onHaptic, onNotify]
  );

  const updateQuantity = useCallback(
    (productId: string, delta: number) => {
      onHaptic?.('light');
      setCart((prev) =>
        prev
          .map((item) => {
            if (item.productId !== productId) return item;
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          })
          .filter((item): item is CartItem => item !== null)
      );
    },
    [onHaptic]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      onHaptic?.('medium');
      setCart((prev) => prev.filter((item) => item.productId !== productId));
    },
    [onHaptic]
  );

  const clearCart = useCallback(() => setCart([]), []);

  const quantityOf = useCallback(
    (variantId: string | undefined) => {
      if (!variantId) return 0;
      return cart.find((item) => item.productId === variantId)?.quantity ?? 0;
    },
    [cart]
  );

  // Wholesale replacement, used when hydrating the basket the customer left
  // on another device. Entries are validated because the payload came from a
  // previous session's stored state rather than this render.
  const replace = useCallback((items: unknown[]) => {
    const cleaned: CartItem[] = [];

    for (const raw of Array.isArray(items) ? items : []) {
      if (!raw || typeof raw !== 'object') continue;

      const item = raw as Record<string, unknown>;
      const productId = String(item.productId ?? '');
      const name = String(item.name ?? '');
      const quantity = Math.floor(Number(item.quantity));

      if (!productId || !name || !Number.isFinite(quantity) || quantity < 1) continue;

      cleaned.push({
        productId,
        name,
        packageSize: String(item.packageSize ?? ''),
        unitPrice: Number(item.unitPrice) || 0,
        quantity,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
      });
    }

    setCart(cleaned);
  }, []);

  return {
    cart,
    cartTotal,
    totalCartCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    quantityOf,
    replace,
  };
}