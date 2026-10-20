import { defineConfig } from 'vite';

// The player's page: served on this machine with the polycrisis example (npm run player), and built into the
// one-file HTML export (packages/player/build). A relative base, so the built page runs from any folder.
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
  server: { port: 5182, strictPort: true },
});
