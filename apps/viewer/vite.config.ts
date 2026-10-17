import { defineConfig } from 'vite';

// A relative base, so the built viewer runs from any folder of a site (it is published at /loopweft/demo/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Fonts stay real files rather than inlined blobs.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning, warn) {
        // zod carries a /* @__PURE__ */ comment where Rollup cannot use it; Rollup drops it, harmlessly.
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('node_modules/zod/')) return;
        warn(warning);
      },
    },
  },
  server: { port: 5180, strictPort: true },
});
