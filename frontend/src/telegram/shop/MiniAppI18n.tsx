/**
 * frontend/src/telegram/shop/MiniAppI18n.tsx
 * Language context for the Telegram Mini App.
 *
 * Deliberately separate from the website's LanguageContext: the Mini App has
 * its own vocabulary (checkout, delivery, order status) that the site never
 * renders, and merging them would leave each context carrying half-unused keys.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isLanguage, translate, type Language, type TranslateVars } from './i18n';

const STORAGE_KEY = 'asella_tma_language';

interface MiniAppI18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: TranslateVars) => string;
}

const MiniAppI18nContext = createContext<MiniAppI18nValue | null>(null);

export const MiniAppI18nProvider: React.FC<{
  children: React.ReactNode;
  /** Telegram's client locale, used only for the initial default. */
  initialLanguage?: string;
  /**
   * Forces a specific starting language and skips the stored/client lookup.
   * Used by tests; production should leave this unset so a returning customer
   * keeps the language they picked.
   */
  forceLanguage?: Language;
}> = ({ children, initialLanguage, forceLanguage }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (forceLanguage) return forceLanguage;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLanguage(stored)) return stored;
    } catch {
      // Storage unavailable — fall through to the client locale.
    }

    // Telegram sends a BCP-47 tag like "am-ET" or "om-ET". Oromo uses "om".
    const base = (initialLanguage || '').split('-')[0].toLowerCase();
    if (base === 'am') return 'am';
    if (base === 'om' || base === 'or') return 'or';
    return 'en';
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures; the in-memory choice still applies.
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslateVars) => translate(language, key, vars ?? {}),
    [language]
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <MiniAppI18nContext.Provider value={value}>{children}</MiniAppI18nContext.Provider>;
};

export function useMiniAppI18n(): MiniAppI18nValue {
  const ctx = useContext(MiniAppI18nContext);
  if (!ctx) {
    throw new Error('useMiniAppI18n must be used within a MiniAppI18nProvider');
  }
  return ctx;
}