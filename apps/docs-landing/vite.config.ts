import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/process-forge/',
  plugins: [react()],
  server: {
    port: 3001,
    open: false
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
});
