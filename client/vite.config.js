import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy the API and WebSocket to the Express server on :3001
// so the client always talks to the same origin it's served from.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
