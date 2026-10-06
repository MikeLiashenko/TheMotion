import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative, so that the built site works from any folder: GitHub Pages serves it from /TheMotion/.
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    // three.js changes far less often than the site does: in a file of its own it stays cached between releases.
    rolldownOptions: { output: { advancedChunks: { groups: [{ name: 'three', test: /node_modules[\/]three/ }] } } },
    chunkSizeWarningLimit: 800,
  },
  test: { include: ['src/**/*.test.ts'] },
});
