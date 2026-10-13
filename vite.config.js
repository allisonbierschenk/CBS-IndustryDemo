import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite on :5173 proxies /api to the Express server on :3000.
// Prod: `npm run build` → dist/, served by Express with a BrowserRouter fallback.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true, // `npm run dev` opens the portal in your browser; React/CSS edits hot-reload

    proxy: { '/api': 'http://localhost:3000' }
  },
  build: { outDir: 'dist', sourcemap: false }
});
