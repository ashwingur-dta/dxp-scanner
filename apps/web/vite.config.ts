import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: {
    proxy: {
      '/api': { target: process.env.DXP_API ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});
