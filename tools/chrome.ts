// Source: PolycrisisPresentation tools/chrome.ts @ 539bc8e (private), adapted for Loopweft: it finds Chrome or
// Edge on Windows, macOS and Linux, and runs without blocking, so a server in the same process keeps serving.
//
// Headless Chrome for the review tools. Each run uses a throwaway profile, so nothing touches the user's own
// browser.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const local = process.env.LOCALAPPDATA ?? '';
export const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ...(local ? [join(local, 'Google/Chrome/Application/chrome.exe')] : []),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

/** This computer's Chrome, or its Edge, if installed (for tests that open a file in each). */
export function findBrowserNamed(name: 'chrome' | 'edge'): string | null {
  const word = name === 'edge' ? /edge/i : /chrome/i;
  return BROWSERS.find((p) => word.test(p) && existsSync(p)) ?? null;
}

/** Chrome or Edge: LOOPWEFT_CHROME if set, else the first one installed. */
export function findBrowser(): string {
  const browser = [process.env.LOOPWEFT_CHROME, ...BROWSERS].find((p) => p && existsSync(p));
  if (!browser) throw new Error('No Chrome or Edge found. Set LOOPWEFT_CHROME to its program file.');
  return browser;
}

/** Runs the browser headless with a fresh profile, removed afterwards. */
export async function headless(args: string[], timeout = 90_000): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), 'loopweft-chrome-'));
  try {
    await run(
      findBrowser(),
      ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, ...args],
      { timeout },
    );
  } finally {
    // The browser can hold its profile for a moment after it exits (Windows); a leftover temporary folder is
    // no reason to stop a capture.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  }
}

export interface StillOptions {
  width?: number;
  height?: number;
  /** Milliseconds of page time before the still is taken (headless Chrome's virtual time). */
  budgetMs?: number;
}

/** A still of a page; the format follows the file's extension (.png or .jpg). */
export async function still(url: string, file: string, options: StillOptions = {}): Promise<void> {
  const { width = 1920, height = 1080, budgetMs = 6000 } = options;
  await headless([
    '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${budgetMs}`,
    `--screenshot=${file}`,
    url,
  ]);
}

/** Runs `tasks` at most `limit` at a time. */
export async function pool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
