import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          // Counting every loop of the polycrisis example takes a few seconds on a slow runner.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
