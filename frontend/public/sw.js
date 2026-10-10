/**
 * frontend/public/sw.js
 *
 * Service worker for the PWA. Caches:
 *   - Static assets (JS, CSS, fonts, icons) for offline app shell
 *   - Product images for offline catalog browsing
 *
 * Strategy: stale-while-revalidate for static assets (fast), and
 * network-first for API calls (always fresh when online).
 *
 * Generated as a static file (no build step). The app registers it
 * via src/lib/sw-register.ts.
 */

const CACHE_VERSION    = '__VERSION__';
const STATIC_CACHE     = `asella-static-${CACHE_VERSION}`;
const IMAGE_CACHE      = `asella-images-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Precache each asset individually and ignore single failures
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Failed to precache ${asset}:`, err);
        }
      }
    })
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

  // API calls: network-only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ success: false, error: 'Offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Navigation requests: network-first (no cache), must be BEFORE same-origin branch
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Images: cache-first (offline catalog)
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
        }).catch(() => {
          // Return a small SVG or 404 instead of HTML fallback
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
            { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }
          );
        });
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate
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
    return;
  }
});
