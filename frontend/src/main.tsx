import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App.tsx'
import './index.css'
import { registerServiceWorker } from './lib/sw-register'
import { initSentry, SentryErrorBoundary, getSentry } from './lib/sentry'

// Initialize Sentry (no-op if VITE_SENTRY_DSN is not set)
void initSentry();

// Wrap console.error to forward to Sentry
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (args[0] instanceof Error) {
    getSentry().captureException(args[0]);
  }
  originalConsoleError.apply(console, args);
};

// Wrap unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  getSentry().captureException(event.reason);
});

// Handle dynamic chunk load failures (e.g. when a new deployment invalidates old chunk hashes)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Chunk preload error detected, reloading to fetch new build assets...', event);
  const storageKey = 'asella_vite_preload_error_reload';
  const lastReload = sessionStorage.getItem(storageKey);
  const now = Date.now();
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem(storageKey, String(now));
    window.location.reload();
  }
});

// PWA: register the service worker for offline catalog + install-to-home-screen.
// Only runs in production builds (see src/lib/sw-register.ts).
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SentryErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </SentryErrorBoundary>
  </React.StrictMode>,
)
