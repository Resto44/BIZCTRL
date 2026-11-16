import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// Build a distinct deployable artifact that includes only the restricted
// Platform Owner routes. The normal ERP app uses vite.config.js unchanged.
export default defineConfig({
  root: path.resolve(process.cwd(), 'platform-console'),
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  build: {
    outDir: path.resolve(process.cwd(), 'dist-platform'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
});
