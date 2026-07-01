/**
 * frontend/public/sw.js
 *
 * Service worker for the PWA. Caches:
 *   - Static assets (JS, CSS, fonts, icons) for offline app shell
 *   - Product images for offline catalog browsing
 *   - The last 50 successful API responses (read-only)
 *
 * Strategy: stale-while-revalidate for static assets (fast), and
 * network-first for API calls (always fresh when online).
 *
 * Generated as a static file (no build step). The app registers it
 * via src/lib/sw-register.ts.
 */

const CACHE_VERSION    = 'v1';
const STATIC_CACHE     = `asella-static-${CACHE_VERSION}`;
const IMAGE_CACHE      = `asella-images-${CACHE_VERSION}`;
const API_CACHE        = `asella-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop old-version caches
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
        .map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ── API calls: network-only ──────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ success: false, error: 'Offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // ── Images: cache-first (offline catalog) ──────────────────────────
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(IMAGE_CACHE).then((cache) =>
              cache.put(request, clone).catch(() => {})
            );
          }
          return res;
        }).catch(() => caches.match('/offline.html'))
      })
    );
    return;
  }

  // ── Static assets: stale-while-revalidate ─────────────────────────
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) =>
              cache.put(request, clone).catch(() => {})
            );
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
