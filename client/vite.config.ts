import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://localhost:4000' } },
  preview: { proxy: { '/api': 'http://localhost:4000' } },
});
