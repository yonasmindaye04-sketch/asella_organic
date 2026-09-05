/**
 * frontend/src/telegram/webApp.ts
 * Safe WebApp accessor and platform detection
 */

import type { TelegramWebApp } from './types';

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;
  const webApp = getTelegramWebApp();
  return Boolean(
    webApp?.initData ||
    (webApp?.platform && webApp.platform !== 'unknown') ||
    window.location.search.includes('tgWebApp') ||
    window.location.hash.includes('tgWebAppData')
  );
}
