/**
 * frontend/src/telegram/shop/useNotifications.ts
 * Bell badge state for the Mini App header.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUnreadCount } from './api';

const POLL_INTERVAL_MS = 60_000;

export interface UseNotificationsReturn {
  unread: number;
  refresh: () => Promise<void>;
  reset: () => void;
}

export function useNotifications(initData: string): UseNotificationsReturn {
  const [unread, setUnread] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!initData) return;
    try {
      const count = await fetchUnreadCount(initData);
      if (mountedRef.current) setUnread(count);
    } catch {
      // A failed poll is not worth surfacing; the badge simply keeps its
      // previous value and the next poll will retry.
    }
  }, [initData]);

  useEffect(() => {
    if (!initData) return;
    void refresh();

    const timer = setInterval(() => {
      // Only poll while the Mini App is actually visible, so a backgrounded
      // webview does not keep hitting the API.
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [initData, refresh]);

  const reset = useCallback(() => setUnread(0), []);

  return { unread, refresh, reset };
}