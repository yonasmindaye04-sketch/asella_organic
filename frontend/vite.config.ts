import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
    },
  },
})
// trigger restart
