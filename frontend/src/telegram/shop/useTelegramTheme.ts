/**
 * frontend/src/telegram/shop/useTelegramTheme.ts
 * Universal light/dark theme for the Mini App.
 *
 * Resolution order:
 *   1. An explicit choice the user made in the header (persisted).
 *   2. Telegram's `colorScheme`, so the Mini App matches the client's theme.
 *   3. The operating system preference.
 *
 * Because every colour in the Mini App resolves through the CSS tokens in
 * `tma.css`, switching themes only means toggling `.dark` on <html> — no
 * component needs to re-render or hold theme state.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'asella_tma_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable (private mode) — fall back to the client theme.
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

export interface UseTelegramThemeReturn {
  /** The theme actually applied. */
  theme: Theme;
  /** What the user asked for, which may be "system". */
  preference: ThemePreference;
  /** True when the applied theme differs from Telegram's colour scheme. */
  isOverridden: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

export function useTelegramTheme(telegramScheme?: 'light' | 'dark'): UseTelegramThemeReturn {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS while the user has not made an explicit choice.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(DARK_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);

    media.addEventListener('change', handleChange);
    setSystemDark(media.matches);

    return () => media.removeEventListener('change', handleChange);
  }, []);

  const telegramDark = telegramScheme === 'dark';

  const resolved: Theme =
    preference === 'system' ? (telegramScheme ? (telegramDark ? 'dark' : 'light') : systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Ignore storage failures; the in-memory preference still applies.
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setPreference]);

  return {
    theme: resolved,
    preference,
    isOverridden: preference !== 'system',
    setPreference,
    toggle,
  };
}