import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Exact SPA routes - only bypass proxy for these (not /assets/tables, /ddl/parse, etc.)
const SPA_ROUTES = new Set(['/', '/assets', '/ddl', '/compare', '/validate', '/compare/runs', '/validate/runs', '/query'])

function bypass(req: { method?: string; url?: string; headers?: { accept?: string } }) {
  if (req.method !== 'GET') return
  const path = (req.url || '').split('?')[0].replace(/\/$/, '') || '/'
  if (!SPA_ROUTES.has(path)) return
  const accept = (req.headers?.accept || '').toLowerCase()
  if (!accept.includes('text/html')) return
  return '/index.html'
}

const proxyTarget = { target: 'http://127.0.0.1:8000', changeOrigin: true }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/assets': { ...proxyTarget, bypass },
      '/ddl': { ...proxyTarget, bypass },
      '/compare': { ...proxyTarget, bypass },
      '/validate': { ...proxyTarget, bypass },
      '/query': { ...proxyTarget, bypass },
      '/docs': proxyTarget,
      '/openapi.json': proxyTarget,
      '/health': proxyTarget,
    },
  },
})
