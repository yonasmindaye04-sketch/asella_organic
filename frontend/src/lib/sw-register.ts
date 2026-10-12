/**
 * frontend/src/lib/sw-register.ts
 *
 * Registers the service worker for PWA support. Called once at app
 * startup. The service worker is at /sw.js (served from /public).
 *
 * `__SW_BUILD_ID__` is injected by Vite (see vite.config.ts). It is
 * appended as a query string purely to defeat Cloudflare's edge cache:
 * the server sets a 30-day TTL on .js, so without a per-build id the
 * previously deployed worker is replayed from the edge and visitors
 * never pick up the new app shell. A query string is a distinct cache
 * key, so this makes the browser fetch the worker that was just
 * uploaded without anybody purging anything.
 *
 * The registration is wrapped in:
 *   - `if ('serviceWorker' in navigator)` — older browsers / tests
 *   - `import.meta.env.PROD` — only register in production builds
 *     (Vite dev mode has its own HMR service worker that would
 *     conflict).
 */

/** Injected at build time by Vite's `define`; see vite.config.ts. */
declare const __SW_BUILD_ID__: string

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Only register in production builds
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`/sw.js?v=${__SW_BUILD_ID__}`, { scope: "/" })
      .then((reg) => {
        console.log("[PWA] service worker registered:", reg.scope);

        // Update when tab regains focus
        window.addEventListener("focus", () => {
          reg.update();
        });
      })
      .catch((err) => {
        console.warn("[PWA] service worker registration failed:", err);
      });
  });

  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    if (!hadController) return;

    // Create a non-blocking in-page banner
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.bottom = "20px";
    banner.style.right = "20px";
    banner.style.backgroundColor = "#333";
    banner.style.color = "#fff";
    banner.style.padding = "16px";
    banner.style.borderRadius = "8px";
    banner.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
    banner.style.zIndex = "9999";
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.gap = "12px";
    banner.style.fontFamily = "sans-serif";

    const text = document.createElement("span");
    text.textContent = "New version available.";
    banner.appendChild(text);

    const reloadBtn = document.createElement("button");
    reloadBtn.textContent = "Reload";
    reloadBtn.style.backgroundColor = "#4CAF50";
    reloadBtn.style.color = "white";
    reloadBtn.style.border = "none";
    reloadBtn.style.padding = "8px 16px";
    reloadBtn.style.borderRadius = "4px";
    reloadBtn.style.cursor = "pointer";
    
    reloadBtn.addEventListener("click", () => {
      refreshing = true;
      window.location.reload();
    });
    
    banner.appendChild(reloadBtn);
    document.body.appendChild(banner);
  });
}
