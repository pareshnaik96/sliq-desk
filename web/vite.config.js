import { defineConfig } from 'vite';

// In dev, /api and /socket.io are proxied to the API so the browser sees a
// single origin (required for the SameSite=Strict session cookie).
const target = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  build: {
    rollupOptions: {
      // Libraries ship a "use client" directive meant for server components; it's
      // meaningless in a plain SPA build, so hide that one warning.
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target, ws: true, changeOrigin: true },
    },
  },
  test: { environment: 'node' },
});
