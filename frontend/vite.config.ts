import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Force same-origin relative API requests (/api/*) when building for the unified full-stack server
process.env.VITE_API_URL = ''

/**
 * Per-build id appended to the service worker URL as a query string.
 *
 * Cloudflare fronts production, and the server's .htaccess sends
 * `ExpiresByType text/javascript "access plus 1 month"`. That rule
 * matches /sw.js -- it is not fingerprinted, so it never reaches the
 * `<FilesMatch>` immutable rules -- giving the worker a 30-day edge TTL.
 * Measured on the live site: `CF-Cache-Status: HIT`, `Age: 58251`,
 * `Last-Modified: 2026-09-02`, while index.html and tma.html are both
 * DYNAMIC and always fresh.
 *
 * The consequence is that a newly deployed sw.js is never fetched:
 * returning PWA visitors keep the previous worker, and with it the old
 * app shell, for up to 30 days. That is exactly the failure
 * DEPLOYMENT_GOTCHAS.md section 1 describes, still live.
 *
 * A query string is a separate cache key at the edge, so a new id each
 * build turns a guaranteed HIT into a guaranteed MISS. Every deploy then
 * self-purges and no Cloudflare dashboard is required.
 *
 * The id is per-build rather than content-derived on purpose: sw.js
 * embeds a build hash (CACHE_VERSION), so its content changes every
 * build anyway, and a stable hash would only re-arm the 30-day cache.
 */
const swBuildId = Date.now().toString(36)
/**
 * Serves the standalone Telegram Mini App at clean URLs during development.
 *
 * `tma.html` is the real document; this only rewrites the request so that
 * `/tma` and `/telegram-store` (the two paths the bot has always used) reach
 * it instead of falling through to the SPA fallback in index.html, which is
 * what made the Mini App appear to "open the whole website".
 */
function miniAppEntryPlugin(): Plugin {
  const MINI_APP_PATHS = ['/tma', '/telegram-store']

  return {
    name: 'asella-miniapp-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/+$/, '')
        if (MINI_APP_PATHS.includes(pathname)) {
          req.url = '/tma.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), miniAppEntryPlugin()],
  define: {
    // Injected into the bundle; see swBuildId above for why it exists.
    __SW_BUILD_ID__: JSON.stringify(swBuildId),
  },
  resolve: {
    // motion/framer-motion is hoisted to the monorepo root while React lives in
    // frontend/node_modules. Without dedupe the dep optimizer cannot resolve
    // the "react" peer from framer-motion and the whole app fails to boot.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Fail loudly instead of silently moving to 5174, 5175, ...
    //
    // Without this, a leftover `npm run dev` on 5173 makes Vite pick the
    // next free port. The browser then sends that port as the Origin, and
    // the backend CSRF check rejects every POST including login — a 403
    // that looks like an auth bug and sends you hunting through the wrong
    // codebase entirely. Failing at startup names the real problem in one
    // line.
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'ngrok-skip-browser-warning': 'true',
      'X-Frame-Options': 'ALLOWALL',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    target: 'es2020',
    reportCompressedSize: false,
    rollupOptions: {
      // Two independent documents:
      //   index.html — the public website
      //   tma.html   — the standalone Telegram Mini App
      input: {
        main: 'index.html',
        tma: 'tma.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@reduxjs/toolkit') || id.includes('react-redux')) {
              return 'vendor-redux';
            }
          }
        },
      },
    },
  },
})
// trigger restart
