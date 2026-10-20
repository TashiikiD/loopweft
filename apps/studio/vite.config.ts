import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { playerTemplatePlugin } from '../../packages/player/build/plugin.ts';

const here = dirname(fileURLToPath(import.meta.url));

// A relative base, so the built Studio runs from any folder of a site (it is published at /loopweft/studio/).
// Two pages: the Studio, and the audience window its presenter console opens (audience.html). The player's
// one-file page reaches the Studio's Export through a virtual module.
export default defineConfig({
  base: './',
  plugins: [playerTemplatePlugin()],
  // React's automatic JSX runtime through esbuild; no React plugin (and no Fast Refresh) needed.
  esbuild: { jsx: 'automatic' },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: { main: join(here, 'index.html'), audience: join(here, 'audience.html') },
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
