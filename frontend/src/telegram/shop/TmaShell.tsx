/**
 * frontend/src/telegram/shop/TmaShell.tsx
 * Shared chrome for the Telegram Mini App: brand header, universal back
 * button, theme switch, tab bar host and full-screen overlay views.
 */

import React from 'react';
import { BottomNav } from './BottomNav';
import type { Theme } from './useTelegramTheme';
import type { TmaTab } from './types';

type LanguageCode = 'en' | 'am' | 'or';

export interface TmaShellProps {
  activeTab: TmaTab;
  onSelectTab: (tab: TmaTab) => void;
  cartCount: number;
  headerTitle: string;
  onCartPress: () => void;
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  /** True whenever there is somewhere to go back to. Drives the back button. */
  canGoBack: boolean;
  onBack: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  /** Full-screen overlay content. When absent the active tab is rendered. */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}

const LANGUAGES: Array<{ id: LanguageCode; label: string }> = [
  { id: 'en', label: 'EN' },
  { id: 'am', label: 'አማ' },
  { id: 'or', label: 'OR' },
];

export function TmaShell({
  activeTab,
  onSelectTab,
  cartCount,
  headerTitle,
  onCartPress,
  language,
  onLanguageChange,
  canGoBack,
  onBack,
  theme,
  onToggleTheme,
  overlay,
  children,
}: TmaShellProps) {
  const isDark = theme === 'dark';

  return (
    <div className="telegram-mini-app-shell flex min-h-screen flex-col bg-cream text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-panel backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-2.5">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
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
                {headerTitle}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div
              className="flex rounded-lg border border-line bg-brand-50 p-0.5 text-[10px] font-semibold"
              role="group"
              aria-label="Language"
            >
              {LANGUAGES.map((item) => {
                const isActive = language === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onLanguageChange(item.id)}
                    aria-pressed={isActive}
                    className={`rounded-md px-1.5 py-0.5 transition-colors ${
                      isActive ? 'bg-brand-solid font-semibold text-white' : 'text-ink2'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
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
              aria-label={`Open cart, ${cartCount} items`}
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