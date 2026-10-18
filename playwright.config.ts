// End-to-end tests of the Studio in a real browser: the computer's own Chrome or Edge (tools/chrome.ts finds
// it), so no browser is downloaded. The Studio runs from its dev server; locally a running one is reused.
// With LOOPWEFT_REVIEW set to a folder, the tests also save screens there for a checkpoint review.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { findBrowser } from './tools/chrome.ts';

export default defineConfig({
  testDir: 'apps/studio/e2e',
  // Results stay out of the repository.
  outputDir: join(tmpdir(), 'loopweft-e2e'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5181',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: { executablePath: findBrowser() },
    // The Studio's own colours: dark, as the system's might be either.
    colorScheme: 'dark',
  },
  webServer: {
    command: 'npx vite apps/studio',
    url: 'http://localhost:5181',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
