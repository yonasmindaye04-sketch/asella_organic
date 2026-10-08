/**
 * frontend/src/telegram/shop/BottomNav.tsx
 * Fixed bottom tab bar for the Telegram Mini App.
 */

import type { TmaTab } from './types';

export interface TabDefinition {
  id: TmaTab;
  label: string;
  icon: React.ReactNode;
}

export const TMA_TABS: TabDefinition[] = [
  { id: 'store', label: 'Store', icon: <i className="fa-solid fa-store" aria-hidden="true" /> },
  { id: 'discover', label: 'Discover', icon: <i className="fa-solid fa-compass" aria-hidden="true" /> },
  { id: 'orders', label: 'Orders', icon: <i className="fa-solid fa-receipt" aria-hidden="true" /> },
  { id: 'account', label: 'Account', icon: <i className="fa-solid fa-circle-user" aria-hidden="true" /> },
];

export interface BottomNavProps {
  activeTab: TmaTab;
  onSelect: (tab: TmaTab) => void;
  cartCount?: number;
}

export function BottomNav({ activeTab, onSelect, cartCount = 0 }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-panel backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Store sections"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {TMA_TABS.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors duration-200 active:scale-90 active:opacity-80 ${
                  isActive ? 'text-brand-800' : 'text-ink hover:text-ink2'
                }`}
              >
                {/* Selection is a solid green plate behind a bold icon, so the
                    active tab reads instantly against the bar. */}
                <span
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 [&>i]:text-[15px] ${
                    isActive
                      ? 'bg-brand-solid text-white shadow-sm shadow-brand-900/25'
                      : 'text-ink'
                  }`}
                >
                  {tab.icon}
                  {tab.id === 'store' && cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-solid px-1 text-[10px] font-bold leading-none text-white ring-2 ring-panel">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </span>
                <span
                  className={`text-xs leading-tight transition-colors ${
                    isActive ? 'font-bold' : 'font-semibold'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}