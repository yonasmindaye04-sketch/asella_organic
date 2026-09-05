/**
 * frontend/src/telegram/useTelegramMiniApp.ts
 * React hook for Telegram Mini App integration (Bot API 6.0 - 8.0+)
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import type {
  TelegramWebApp,
  TelegramWebAppUser,
  TelegramThemeParams,
  TelegramMainButton,
  TelegramSecondaryButton,
  TelegramBackButton,
  TelegramHapticFeedback,
  TelegramSafeAreaInset,
} from './types';
import { getTelegramWebApp, isTelegramMiniApp } from './webApp';

export interface UseTelegramMiniAppReturn {
  webApp: TelegramWebApp | null;
  isReady: boolean;
  isTelegram: boolean;
  initData: string;
  unsafeUser: TelegramWebAppUser | null;
  themeParams: TelegramThemeParams;
  colorScheme: 'light' | 'dark';
  mainButton: TelegramMainButton | null;
  secondaryButton: TelegramSecondaryButton | null;
  backButton: TelegramBackButton | null;
  haptic: TelegramHapticFeedback | null;
  safeAreaInset: TelegramSafeAreaInset | null;
  contentSafeAreaInset: TelegramSafeAreaInset | null;
  isFullscreen: boolean;
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  disableVerticalSwipes: () => void;
  enableVerticalSwipes: () => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
}

export function useTelegramMiniApp(): UseTelegramMiniAppReturn {
  const webApp = useMemo(() => getTelegramWebApp(), []);
  const [isReady, setIsReady] = useState(false);
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');
  const [themeParams, setThemeParams] = useState<TelegramThemeParams>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isTelegram = isTelegramMiniApp();

  useEffect(() => {
    if (!webApp) {
      setIsReady(true);
      return;
    }

    try {
      webApp.ready();
      webApp.expand();

      if (webApp.colorScheme) {
        setColorScheme(webApp.colorScheme);
      }
      if (webApp.themeParams) {
        setThemeParams(webApp.themeParams);
      }
      if (typeof webApp.isFullscreen === 'boolean') {
        setIsFullscreen(webApp.isFullscreen);
      }

      // Sync CSS custom properties with Telegram theme
      const root = document.documentElement;
      if (webApp.themeParams.bg_color) {
        root.style.setProperty('--tg-theme-bg-color', webApp.themeParams.bg_color);
      }
      if (webApp.themeParams.text_color) {
        root.style.setProperty('--tg-theme-text-color', webApp.themeParams.text_color);
      }
      if (webApp.themeParams.button_color) {
        root.style.setProperty('--tg-theme-button-color', webApp.themeParams.button_color);
      }
      if (webApp.themeParams.button_text_color) {
        root.style.setProperty('--tg-theme-button-text-color', webApp.themeParams.button_text_color);
      }
      if (webApp.themeParams.secondary_bg_color) {
        root.style.setProperty('--tg-theme-secondary-bg-color', webApp.themeParams.secondary_bg_color);
      }
      if (webApp.themeParams.header_bg_color) {
        root.style.setProperty('--tg-theme-header-bg-color', webApp.themeParams.header_bg_color);
      }
      if (webApp.themeParams.bottom_bar_bg_color) {
        root.style.setProperty('--tg-theme-bottom-bar-bg-color', webApp.themeParams.bottom_bar_bg_color);
      }

      // Safe area insets
      if (webApp.contentSafeAreaInset) {
        root.style.setProperty('--tg-content-safe-area-inset-top', `${webApp.contentSafeAreaInset.top}px`);
        root.style.setProperty('--tg-content-safe-area-inset-bottom', `${webApp.contentSafeAreaInset.bottom}px`);
        root.style.setProperty('--tg-content-safe-area-inset-left', `${webApp.contentSafeAreaInset.left}px`);
        root.style.setProperty('--tg-content-safe-area-inset-right', `${webApp.contentSafeAreaInset.right}px`);
      }

      const handleThemeChange = () => {
        if (webApp.colorScheme) setColorScheme(webApp.colorScheme);
        if (webApp.themeParams) setThemeParams(webApp.themeParams);
      };

      const handleFullscreenChange = () => {
        if (typeof webApp.isFullscreen === 'boolean') {
          setIsFullscreen(webApp.isFullscreen);
        }
      };

      webApp.onEvent('themeChanged', handleThemeChange);
      webApp.onEvent('fullscreenChanged', handleFullscreenChange);

      setIsReady(true);

      return () => {
        webApp.offEvent('themeChanged', handleThemeChange);
        webApp.offEvent('fullscreenChanged', handleFullscreenChange);
      };
    } catch {
      setIsReady(true);
    }
  }, [webApp]);

  const requestFullscreen = useCallback(() => {
    try {
      webApp?.requestFullscreen?.();
    } catch {
      // safe fallback
    }
  }, [webApp]);

  const exitFullscreen = useCallback(() => {
    try {
      webApp?.exitFullscreen?.();
    } catch {
      // safe fallback
    }
  }, [webApp]);

  const disableVerticalSwipes = useCallback(() => {
    try {
      webApp?.disableVerticalSwipes?.();
    } catch {
      // safe fallback
    }
  }, [webApp]);

  const enableVerticalSwipes = useCallback(() => {
    try {
      webApp?.enableVerticalSwipes?.();
    } catch {
      // safe fallback
    }
  }, [webApp]);

  const enableClosingConfirmation = useCallback(() => {
    try {
      webApp?.enableClosingConfirmation();
    } catch {
      // safe fallback
    }
  }, [webApp]);

  const disableClosingConfirmation = useCallback(() => {
    try {
      webApp?.disableClosingConfirmation();
    } catch {
      // safe fallback
    }
  }, [webApp]);

  const showAlert = useCallback(
    (message: string, callback?: () => void) => {
      if (webApp?.showAlert) {
        webApp.showAlert(message, callback);
      } else {
        window.alert(message);
        callback?.();
      }
    },
    [webApp]
  );

  const showConfirm = useCallback(
    (message: string, callback?: (confirmed: boolean) => void) => {
      if (webApp?.showConfirm) {
        webApp.showConfirm(message, callback);
      } else {
        const confirmed = window.confirm(message);
        callback?.(confirmed);
      }
    },
    [webApp]
  );

  const openLink = useCallback(
    (url: string) => {
      if (webApp?.openLink) {
        webApp.openLink(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [webApp]
  );

  const openTelegramLink = useCallback(
    (url: string) => {
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [webApp]
  );

  return {
    webApp,
    isReady,
    isTelegram,
    initData: webApp?.initData ?? '',
    unsafeUser: webApp?.initDataUnsafe?.user ?? null,
    themeParams,
    colorScheme,
    mainButton: webApp?.MainButton ?? null,
    secondaryButton: webApp?.SecondaryButton ?? null,
    backButton: webApp?.BackButton ?? null,
    haptic: webApp?.HapticFeedback ?? null,
    safeAreaInset: webApp?.safeAreaInset ?? null,
    contentSafeAreaInset: webApp?.contentSafeAreaInset ?? null,
    isFullscreen,
    requestFullscreen,
    exitFullscreen,
    disableVerticalSwipes,
    enableVerticalSwipes,
    enableClosingConfirmation,
    disableClosingConfirmation,
    showAlert,
    showConfirm,
    openLink,
    openTelegramLink,
  };
}
