import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
  server: {
    host: true,
    port: 5173,
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