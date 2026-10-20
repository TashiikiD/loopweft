import { defineConfig } from 'vite';

// The player's page: served on this machine with the polycrisis example (npm run player), and built into the
// one-file HTML export (packages/player/build). A relative base, so the built page runs from any folder.
export default defineConfig(({ command }) => ({
  base: './',
  // Only the page served on this machine plays the example: a built page (the one-file export) never holds it,
  // whatever NODE_ENV says (a test runner sets "test", which would make Vite's own DEV flag true).
  define: { __PLAYER_SERVED__: JSON.stringify(command === 'serve') },
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
}));
