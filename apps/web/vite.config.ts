import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  plugins: [react()],
  resolve: {
    alias: {
      '@process-forge/canvas-ui': path.resolve(__dirname, '../../packages/canvas-ui/src'),
      '@process-forge/theme': path.resolve(__dirname, '../../packages/theme/src'),
      '@process-forge/protocol': path.resolve(__dirname, '../../packages/protocol/src'),
      '@process-forge/simulation-core': path.resolve(__dirname, '../../packages/simulation-core/src'),
      '@process-forge/scaffold-registry': path.resolve(__dirname, '../../packages/scaffold-registry/src'),
    }
  },
  server: {
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});

