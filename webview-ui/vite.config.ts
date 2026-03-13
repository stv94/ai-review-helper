import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Produces a predictable single-bundle output that reviewPanel.ts can reference by name
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Fixed filenames — no content-hash — so the extension always knows the paths
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'main.css' : '[name][extname]',
      },
    },
  },
});
