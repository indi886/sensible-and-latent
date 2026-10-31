import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Ports 5211 / 4211: unused by any sibling project in C:\Users\indik.
export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 5211, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4211, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\/]three/ }, { name: 'motion', test: /node_modules[\/](gsap|lenis)/ }] },
      },
    },
  },
});
