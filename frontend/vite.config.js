import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.VITE_BACKEND_URL ?? 'http://localhost:5001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin in dev too: no CORS, and the httpOnly cookie just works.
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
  optimizeDeps: {
    include: ['tweetnacl', 'ed2curve'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
