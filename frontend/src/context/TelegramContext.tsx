/**
 * frontend/src/context/TelegramContext.tsx
 * Asella Organic — Telegram WebApp React Context & Hook
 *
 * Provides reactive access to Telegram WebApp features, user profile,
 * native buttons, theme parameters, and tactile haptic feedback.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { TelegramWebApp, TelegramWebAppUser, TelegramThemeParams } from '../types/telegram';

interface TelegramContextValue {
  isTelegram: boolean;
  webApp: TelegramWebApp | null;
  user: TelegramWebAppUser | null;
  initData: string;
  startParam: string | null;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  isFullscreen?: boolean;
  haptic: {
    impact: (style?: 'light' | 'medium' | 'heavy') => void;
    notification: (type?: 'success' | 'warning' | 'error') => void;
    selection: () => void;
  };
  mainButton: {
    show: (text: string, onClick: () => void) => void;
    hide: () => void;
    setLoading: (loading: boolean) => void;
  };
  secondaryButton?: {
    show: (text: string, onClick: () => void) => void;
    hide: () => void;
  };
  backButton: {
    show: (onClick: () => void) => void;
    hide: () => void;
  };
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  disableVerticalSwipes: () => void;
  enableVerticalSwipes: () => void;
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  close: () => void;
}

const TelegramContext = createContext<TelegramContextValue | null>(null);

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  const isTelegram = Boolean(tg && (tg.initData || (tg.platform && tg.platform !== 'unknown')));

  const [user, setUser] = useState<TelegramWebAppUser | null>(() => {
    return tg?.initDataUnsafe?.user || null;
  });
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() => {
    return tg?.colorScheme || 'light';
  });
  const [themeParams, setThemeParams] = useState<TelegramThemeParams>(() => {
    return tg?.themeParams || {};
  });

  const initData = useMemo(() => tg?.initData || '', [tg]);
  const startParam = useMemo(() => tg?.initDataUnsafe?.start_param || null, [tg]);

  useEffect(() => {
    if (!tg) return;

    try {
      tg.ready();
      tg.expand();

      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }
      if (tg.colorScheme) {
        setColorScheme(tg.colorScheme);
      }
      if (tg.themeParams) {
        setThemeParams(tg.themeParams);
      }

      const handleThemeChange = () => {
        if (tg.colorScheme) setColorScheme(tg.colorScheme);
        if (tg.themeParams) setThemeParams(tg.themeParams);
      };

      tg.onEvent('themeChanged', handleThemeChange);
      return () => {
        tg.offEvent('themeChanged', handleThemeChange);
      };
    } catch {
      // Graceful fallback outside Telegram container
    }
  }, [tg]);

  // Haptic feedback helpers
  const haptic = useMemo(() => ({
    impact: (style: 'light' | 'medium' | 'heavy' = 'light') => {
      try {
        tg?.HapticFeedback?.impactOccurred(style);
      } catch {
        // Ignored outside native client
      }
    },
    notification: (type: 'success' | 'warning' | 'error' = 'success') => {
      try {
        tg?.HapticFeedback?.notificationOccurred(type);
      } catch {
        // Ignored
      }
    },
    selection: () => {
      try {
        tg?.HapticFeedback?.selectionChanged();
      } catch {
        // Ignored
      }
    },
  }), [tg]);

  // MainButton manager
  const mainButtonCallbackRef = React.useRef<(() => void) | null>(null);

  const showMainButton = useCallback((text: string, onClick: () => void) => {
    if (!tg?.MainButton) return;
    if (mainButtonCallbackRef.current) {
      tg.MainButton.offClick(mainButtonCallbackRef.current);
    }
    mainButtonCallbackRef.current = onClick;
    tg.MainButton.setText(text);
    tg.MainButton.onClick(onClick);
    tg.MainButton.show();
  }, [tg]);

  const hideMainButton = useCallback(() => {
    if (!tg?.MainButton) return;
    if (mainButtonCallbackRef.current) {
      tg.MainButton.offClick(mainButtonCallbackRef.current);
      mainButtonCallbackRef.current = null;
    }
    tg.MainButton.hide();
  }, [tg]);

  const setMainButtonLoading = useCallback((loading: boolean) => {
    if (!tg?.MainButton) return;
    if (loading) {
      tg.MainButton.showProgress(false);
      tg.MainButton.disable();
    } else {
      tg.MainButton.hideProgress();
      tg.MainButton.enable();
    }
  }, [tg]);

  const mainButton = useMemo(() => ({
    show: showMainButton,
    hide: hideMainButton,
    setLoading: setMainButtonLoading,
  }), [showMainButton, hideMainButton, setMainButtonLoading]);

  // BackButton manager
  const backButtonCallbackRef = React.useRef<(() => void) | null>(null);

  const showBackButton = useCallback((onClick: () => void) => {
    if (!tg?.BackButton) return;
    if (backButtonCallbackRef.current) {
      tg.BackButton.offClick(backButtonCallbackRef.current);
    }
    backButtonCallbackRef.current = onClick;
    tg.BackButton.onClick(onClick);
    tg.BackButton.show();
  }, [tg]);

  const hideBackButton = useCallback(() => {
    if (!tg?.BackButton) return;
    if (backButtonCallbackRef.current) {
      tg.BackButton.offClick(backButtonCallbackRef.current);
      backButtonCallbackRef.current = null;
    }
    tg.BackButton.hide();
  }, [tg]);

  const backButton = useMemo(() => ({
    show: showBackButton,
    hide: hideBackButton,
  }), [showBackButton, hideBackButton]);

  const secondaryButtonCallbackRef = React.useRef<(() => void) | null>(null);

  const showSecondaryButton = useCallback((text: string, onClick: () => void) => {
    if (!tg?.SecondaryButton) return;
    if (secondaryButtonCallbackRef.current) {
      tg.SecondaryButton.offClick(secondaryButtonCallbackRef.current);
    }
    secondaryButtonCallbackRef.current = onClick;
    tg.SecondaryButton.setText(text);
    tg.SecondaryButton.onClick(onClick);
    tg.SecondaryButton.show();
  }, [tg]);

  const hideSecondaryButton = useCallback(() => {
    if (!tg?.SecondaryButton) return;
    if (secondaryButtonCallbackRef.current) {
      tg.SecondaryButton.offClick(secondaryButtonCallbackRef.current);
      secondaryButtonCallbackRef.current = null;
    }
    tg.SecondaryButton.hide();
  }, [tg]);

  const secondaryButton = useMemo(() => ({
    show: showSecondaryButton,
    hide: hideSecondaryButton,
  }), [showSecondaryButton, hideSecondaryButton]);

  const enableClosingConfirmation = useCallback(() => {
    try {
      tg?.enableClosingConfirmation();
    } catch {
      // Ignored
    }
  }, [tg]);

  const disableClosingConfirmation = useCallback(() => {
    try {
      tg?.disableClosingConfirmation();
    } catch {
      // Ignored
    }
  }, [tg]);

  const disableVerticalSwipes = useCallback(() => {
    try {
      tg?.disableVerticalSwipes?.();
    } catch {
      // Ignored
    }
  }, [tg]);

  const enableVerticalSwipes = useCallback(() => {
    try {
      tg?.enableVerticalSwipes?.();
    } catch {
      // Ignored
    }
  }, [tg]);

  const requestFullscreen = useCallback(() => {
    try {
      tg?.requestFullscreen?.();
    } catch {
      // Ignored
    }
  }, [tg]);

  const exitFullscreen = useCallback(() => {
    try {
      tg?.exitFullscreen?.();
    } catch {
      // Ignored
    }
  }, [tg]);

  const close = useCallback(() => {
    try {
      tg?.close();
    } catch {
      // Ignored
    }
  }, [tg]);

  const value = useMemo(() => ({
    isTelegram,
    webApp: tg || null,
    user,
    initData,
    startParam,
    colorScheme,
    themeParams,
    isFullscreen: tg?.isFullscreen ?? false,
    haptic,
    mainButton,
    secondaryButton,
    backButton,
    enableClosingConfirmation,
    disableClosingConfirmation,
    disableVerticalSwipes,
    enableVerticalSwipes,
    requestFullscreen,
    exitFullscreen,
    close,
  }), [
    isTelegram,
    tg,
    user,
    initData,
    startParam,
    colorScheme,
    themeParams,
    haptic,
    mainButton,
    secondaryButton,
    backButton,
    enableClosingConfirmation,
    disableClosingConfirmation,
    disableVerticalSwipes,
    enableVerticalSwipes,
    requestFullscreen,
    exitFullscreen,
    close,
  ]);

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};

export const useTelegram = (): TelegramContextValue => {
  const ctx = useContext(TelegramContext);
  if (!ctx) {
    throw new Error('useTelegram must be used within a TelegramProvider');
  }
  return ctx;
};
