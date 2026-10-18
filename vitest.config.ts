import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'apps/studio/**'],
          environment: 'node',
          // Counting every loop of the polycrisis example takes a few seconds on a slow runner.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        // The Studio's components and state, in jsdom (React's automatic JSX runtime through esbuild).
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'studio',
          include: ['apps/studio/test/**/*.test.ts', 'apps/studio/test/**/*.test.tsx'],
          exclude: ['**/node_modules/**'],
          environment: 'jsdom',
          setupFiles: ['apps/studio/test/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
