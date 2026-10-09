/**
 * frontend/src/tma.tsx
 * Asella Organic — Telegram Mini App entry point.
 *
 * A standalone React root that boots ONLY the Mini App. Nothing from the
 * marketing site is pulled in: no BrowserRouter, no Redux Provider, no
 * dashboard routes, no Sentry bootstrap and no PWA service worker.
 *
 * Customers reach this page from the Telegram bot and can browse, add to cart,
 * check out and track orders without ever visiting the website.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

import { TelegramProvider } from './context/TelegramContext';
import { MiniAppI18nProvider } from './telegram/shop/MiniAppI18n';
import { TelegramStore } from './pages/TelegramStore';

// miniApp.css first, then tma.css: the brand surface override in tma.css is
// unlayered and must win over the Telegram theme background.
import './telegram/miniApp.css';
import './tma.css';

// Font Awesome (Free). Only the Mini App entry pulls this in — the website
// bundle is untouched. fontawesome.css carries the icon metadata and
// solid.css declares the font-face, so only fa-solid-900.woff2 is downloaded.
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Mini App root element (#root) is missing from tma.html');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <TelegramProvider>
      <MiniAppI18nProvider initialLanguage={window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code}>
        <TelegramStore />
      </MiniAppI18nProvider>
    </TelegramProvider>
  </React.StrictMode>
);