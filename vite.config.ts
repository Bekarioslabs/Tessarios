import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import pkg from './package.json';

export default defineConfig(() => {
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5173,
      // Without strictPort, Vite silently falls back to 5174 when 5173 is taken — while
      // Electron still loads 5173 and gets whatever stale server is squatting there.
      // That mismatch is the root cause of the recurring "white screen / index.css 404,
      // fixed by a force reload" bug. Fail loudly instead; scripts/dev-preflight.cjs
      // clears leftover listeners before we get here.
      strictPort: true,
    },
  };
});
