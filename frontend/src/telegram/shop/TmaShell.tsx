/**
 * frontend/src/telegram/shop/TmaShell.tsx
 * Shared chrome for the Telegram Mini App: brand header, universal back
 * button, theme switch, tab bar host and full-screen overlay views.
 */

import React from 'react';
import { BottomNav } from './BottomNav';
import { LANGUAGES, type Language } from './i18n';
import { useMiniAppI18n } from './MiniAppI18n';
import type { Theme } from './useTelegramTheme';
import type { TmaTab } from './types';

export interface TmaShellProps {
  activeTab: TmaTab;
  onSelectTab: (tab: TmaTab) => void;
  cartCount: number;
  onCartPress: () => void;
  /** True whenever there is somewhere to go back to. Drives the back button. */
  canGoBack: boolean;
  onBack: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  /** Full-screen overlay content. When absent the active tab is rendered. */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}

export function TmaShell({
  activeTab,
  onSelectTab,
  cartCount,
  onCartPress,
  canGoBack,
  onBack,
  theme,
  onToggleTheme,
  unreadCount,
  onOpenNotifications,
  overlay,
  children,
}: TmaShellProps) {
  const isDark = theme === 'dark';
  const { t, language, setLanguage } = useMiniAppI18n();

  return (
    <div className="telegram-mini-app-shell flex min-h-screen flex-col bg-cream text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-panel backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-2.5">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t('header.back')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-ink"
            >
              <i className="fa-solid fa-chevron-left text-[14px]" aria-hidden="true" />
            </button>
          )}

          {/* Brand lockup, not a control. It used to be a button that jumped to
              the Store tab, which left a pointer cursor hovering over the logo
              and read as clickable when it is only a header. No icon tile: the
              pointed leaf mark read as an arrow rather than a brand mark, so the
              wordmark carries the header on its own. */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0">
              <span className="font-heading block truncate text-base font-bold leading-tight">
                {t('header.brand')}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <label className="relative flex items-center">
              <span className="sr-only">{t('header.language')}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
                aria-label={t('header.language')}
                className="h-9 cursor-pointer appearance-none rounded-lg border border-line bg-brand-50 py-0 pl-2.5 pr-7 text-[11px] font-semibold text-ink focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <i
                className="fa-solid fa-chevron-down pointer-events-none absolute right-2 text-[9px] text-ink2"
                aria-hidden="true"
              />
            </label>

            <button
              type="button"
              onClick={onOpenNotifications}
              aria-label={
                unreadCount > 0
                  ? `${t('header.notifications')}, ${unreadCount} unread`
                  : t('header.notifications')
              }
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-ink2"
            >
              <i className="fa-solid fa-bell text-[14px]" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-panel">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? t('header.theme.light') : t('header.theme.dark')}
              aria-pressed={isDark}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-ink2"
            >
              {isDark ? (
                <i className="fa-solid fa-sun text-[14px]" aria-hidden="true" />
              ) : (
                <i className="fa-solid fa-moon text-[14px]" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onCartPress}
              aria-label={`${t('header.cart')}, ${cartCount}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-ink2"
            >
              <i className="fa-solid fa-cart-shopping text-[14px]" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-solid px-1 text-[10px] font-bold leading-none text-white">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {overlay ?? children}
      </main>

      {!overlay && <BottomNav activeTab={activeTab} onSelect={onSelectTab} cartCount={cartCount} />}
    </div>
  );
}