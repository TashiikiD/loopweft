import { defineConfig } from 'vite';

// A relative base, so the built Studio runs from any folder of a site (it is published at /loopweft/studio/).
export default defineConfig({
  base: './',
  // React's automatic JSX runtime through esbuild; no React plugin (and no Fast Refresh) needed.
  esbuild: { jsx: 'automatic' },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      onwarn(warning, warn) {
        // Harmless notes about dependencies: zod's comments confuse Rollup's tree-shaking hints, and
        // Mantine marks its modules "use client" for React Server Components.
        const fromDependency = (warning.id ?? warning.loc?.file ?? '').includes('node_modules');
        if (
          fromDependency &&
          ['INVALID_ANNOTATION', 'MODULE_LEVEL_DIRECTIVE', 'SOURCEMAP_ERROR'].includes(warning.code ?? '')
        )
          return;
        warn(warning);
      },
    },
  },
  server: { port: 5181, strictPort: true },
});
