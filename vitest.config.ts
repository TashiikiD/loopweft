import { defineConfig } from 'vitest/config';
import { exportPagePlugin } from './packages/export/build/plugin.ts';
import { playerTemplatePlugin } from './packages/player/build/plugin.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'apps/studio/**'],
          environment: 'node',
          // Counting every loop of the polycrisis example, or playing its whole story, takes a few seconds
          // alone and up to a minute on a busy laptop (on battery, other work beside the tests), where a
          // tighter limit failed the merge gate on load alone. A test that hangs still fails.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        // The Studio's components and state, in jsdom (React's automatic JSX runtime through esbuild). The
        // plugins give the Export workspace the player's page and the export page, as the Studio's build does.
        esbuild: { jsx: 'automatic' },
        plugins: [playerTemplatePlugin(), exportPagePlugin()],
        test: {
          name: 'studio',
          include: ['apps/studio/test/**/*.test.ts', 'apps/studio/test/**/*.test.tsx'],
          exclude: ['**/node_modules/**'],
          environment: 'jsdom',
          setupFiles: ['apps/studio/test/setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
