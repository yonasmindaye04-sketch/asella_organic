import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App.tsx'
import './index.css'
import axios from 'axios'
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

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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