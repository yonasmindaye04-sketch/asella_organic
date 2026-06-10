/**
 * frontend/src/lib/sw-register.ts
 *
 * Registers the service worker for PWA support. Called once at app
 * startup. The service worker is at /sw.js (served from /public).
 *
 * The registration is wrapped in:
 *   - `if ('serviceWorker' in navigator)` — older browsers / tests
 *   - `import.meta.env.PROD` — only register in production builds
 *     (Vite dev mode has its own HMR service worker that would
 *     conflict).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Only register in production builds
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[PWA] service worker registered:", reg.scope);
      })
      .catch((err) => {
        console.warn("[PWA] service worker registration failed:", err);
      });
  });
}
