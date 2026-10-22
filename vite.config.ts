import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds ONE self-contained HTML file (dist/index.html) that works by double-clicking — no server needed.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 3000 },
});
