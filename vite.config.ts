import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Prepare lazy map dependencies before the first map request.
  optimizeDeps: { include: ['leaflet', 'react-leaflet'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 3000, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
  preview: { host: '127.0.0.1', port: 4173, proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
});
