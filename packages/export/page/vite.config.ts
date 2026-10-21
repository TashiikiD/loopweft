import { defineConfig } from 'vite';

// The export page: built into one HTML file (build/page.ts) that the Studio runs in a hidden frame and the
// command line in a headless Chrome or Edge. A relative base, so it runs from any folder.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      onwarn(warning, warn) {
        // zod carries a /* @__PURE__ */ comment where Rollup cannot use it; Rollup drops it, harmlessly.
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('node_modules/zod/')) return;
        warn(warning);
      },
    },
  },
  server: { port: 5183, strictPort: true },
});
