import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite on :5173 proxies /api to the Express server on :3000.
// Prod: `npm run build` → dist/, served by Express with a BrowserRouter fallback.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true, // `npm run dev` opens the portal in your browser; React/CSS edits hot-reload

    // 127.0.0.1, not localhost: localhost resolves to IPv6 ::1 first, so any other dev server on [::1]:3000
    // (e.g. another project's Vite) would silently receive the portal's /api calls.
    proxy: { '/api': 'http://127.0.0.1:3000' }
  },
  build: { outDir: 'dist', sourcemap: false }
});
