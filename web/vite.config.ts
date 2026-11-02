import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // `npm run dev` serves the API on :3000; the Vite dev server forwards to it.
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
