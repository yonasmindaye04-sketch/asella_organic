import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
      // Default Vite chunking is usually optimal
    },
  },
})
