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
      <header className="sticky top-0 z-30 bg-[#1b3d1e] shadow-[0_2px_8px_rgba(0,0,0,0.3)] shrink-0">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-2.5">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t('header.back')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-transparent border-[1.5px] border-white/20 text-white hover:bg-white/10 transition"
            >
              <i className="fa-solid fa-chevron-left text-[14px]" aria-hidden="true" />
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!canGoBack && (
              <div className="w-7 h-7 rounded-md bg-[#2e7d32] flex items-center justify-center text-white shrink-0">
                <span className="material-symbols-outlined text-[16px]">eco</span>
              </div>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-black tracking-wide text-white">
                Asella — {t('header.brand')}
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
                className="h-9 cursor-pointer appearance-none rounded-lg bg-transparent border-[1.5px] border-white/20 py-0 pl-2.5 pr-7 text-[11px] font-bold text-white focus:border-white focus:outline-none"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <i
                className="fa-solid fa-chevron-down pointer-events-none absolute right-2 text-[9px] text-white/70"
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
              className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-transparent border-[1.5px] border-white/20 text-white hover:bg-white/10 transition"
            >
              <i className="fa-solid fa-bell text-[14px]" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#1b3d1e]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? t('header.theme.light') : t('header.theme.dark')}
              aria-pressed={isDark}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-transparent border-[1.5px] border-white/20 text-white hover:bg-white/10 transition"
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
              className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-transparent border-[1.5px] border-white/20 text-white hover:bg-white/10 transition"
            >
              <i className="fa-solid fa-cart-shopping text-[14px]" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2e7d32] px-1 text-[10px] font-bold leading-none text-white border border-[#1b3d1e]">
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