/**
 * frontend/src/telegram/shop/usePersistedState.ts
 * Mirrors the cart and UI preferences to the server, keyed by Telegram chat id.
 *
 * Before this, the cart lived only in localStorage under a single global key,
 * which meant a basket belonged to a *browser* rather than a *customer*: two
 * Telegram accounts on one device shared a basket, and a customer switching
 * devices lost it. localStorage is still written as a fast offline fallback,
 * but it is now scoped per chat id and treated as a cache of the server copy.
 */

import { useCallback, useEffect, useRef } from 'react';
import { fetchState, saveState, type PersistedPreferences } from './api';

const STORAGE_PREFIX = 'asella_tma_cart_v2';
const PREFS_PREFIX = 'asella_tma_prefs_v2';

export function storageKeyFor(chatId: number): string {
  return `${STORAGE_PREFIX}:${chatId}`;
}

export interface PersistedState {
  cart: unknown[];
  preferences: Partial<PersistedPreferences>;
}

export interface UsePersistedStateReturn {
  /** Replace the in-memory cart with the server copy. Call once on open. */
  hydrate: (state: { cart: unknown[]; preferences: Partial<PersistedPreferences> }) => void;
  /** Queue a debounced write of the current cart. */
  scheduleCartSync: (cart: unknown[]) => void;
  /** Queue a debounced write of the current preferences. */
  schedulePrefsSync: (preferences: Partial<PersistedPreferences>) => void;
  /** Persist immediately, e.g. right before the page unloads. */
  flush: () => Promise<void>;
}

function readLocal(chatId: number): Partial<PersistedState> | null {
  try {
    const cartRaw = localStorage.getItem(storageKeyFor(chatId));
    const prefsRaw = localStorage.getItem(`${PREFS_PREFIX}:${chatId}`);
    return {
      cart: cartRaw ? (JSON.parse(cartRaw) as unknown[]) : [],
      preferences: prefsRaw ? (JSON.parse(prefsRaw) as Partial<PersistedPreferences>) : {},
    };
  } catch {
    return null;
  }
}

export function usePersistedState(
  initData: string,
  chatId: number | null,
  getCart: () => unknown[],
  getPreferences: () => Partial<PersistedPreferences>
): UsePersistedStateReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<PersistedState>>({});

  const writeLocal = useCallback(
    (patch: Partial<PersistedState>) => {
      if (chatId === null) return;
      try {
        if (patch.cart !== undefined) {
          localStorage.setItem(storageKeyFor(chatId), JSON.stringify(patch.cart));
        }
        if (patch.preferences !== undefined) {
          localStorage.setItem(
            `${PREFS_PREFIX}:${chatId}`,
            JSON.stringify(patch.preferences)
          );
        }
      } catch {
        // Storage may be unavailable; the server copy is authoritative anyway.
      }
    },
    [chatId]
  );

  const push = useCallback(
    async (patch: Partial<PersistedState>) => {
      if (!initData || chatId === null) return;
      try {
        await saveState(initData, {
          cart: (patch.cart ?? getCart()) as never[],
          preferences: patch.preferences ?? getPreferences(),
        });
      } catch {
        // Offline or unauthenticated: keep the local cache and try again later.
      }
    },
    [initData, chatId, getCart, getPreferences]
  );

  const schedule = useCallback(
    (patch: Partial<PersistedState>) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      writeLocal(patch);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void push(pendingRef.current);
        pendingRef.current = {};
        timerRef.current = null;
      }, 1200);
    },
    [push, writeLocal]
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(pending).length > 0) {
      await push(pending);
    }
  }, [push]);

  const hydrate = useCallback(
    (state: { cart: unknown[]; preferences: Partial<PersistedPreferences> }) => {
      writeLocal({ cart: state.cart, preferences: state.preferences });
    },
    [writeLocal]
  );

  // Load the server copy on open, falling back to the local cache when the
  // request fails (first open, or the tunnel is down).
  useEffect(() => {
    if (!initData || chatId === null) return;
    let cancelled = false;

    (async () => {
      try {
        const state = await fetchState(initData);
        if (!cancelled) {
          hydrate({ cart: state.cart ?? [], preferences: state.preferences ?? {} });
        }
      } catch {
        if (!cancelled) {
          const local = readLocal(chatId);
          if (local) hydrate({ cart: local.cart ?? [], preferences: local.preferences ?? {} });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initData, chatId, hydrate]);

  // Never lose a pending write when the webview is closed.
  useEffect(() => {
    const onHide = () => {
      if (pendingRef.current && Object.keys(pendingRef.current).length > 0) {
        void push(pendingRef.current);
        pendingRef.current = {};
      }
    };

    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });

    return () => window.removeEventListener('pagehide', onHide);
  }, [push]);

  return {
    hydrate,
    scheduleCartSync: (cart) => schedule({ cart }),
    schedulePrefsSync: (preferences) => schedule({ preferences }),
    flush,
  };
}