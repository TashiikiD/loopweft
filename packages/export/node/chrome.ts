// Chrome or Edge, headless, for the command line's drawn exports. It is the browser already on the computer:
// nothing is downloaded. Each run has a throwaway profile, so nothing touches the person's own browser, and
// switches off the browser's own background traffic (updates, sync, reports), so an export reaches no network.
// The browser is driven through its DevTools protocol over a pipe (no port is opened): JSON messages, each
// ended by a NUL byte, written to its fourth file descriptor and read from its fifth.
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const local = process.env.LOCALAPPDATA ?? '';

/** Where Chrome and Edge are installed on Windows, macOS and Linux, Chrome first. */
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

/** This computer's Chrome, or its Edge, if installed. */
export function findBrowserNamed(name: 'chrome' | 'edge'): string | null {
  const word = name === 'edge' ? /edge/i : /chrome/i;
  return BROWSERS.find((p) => word.test(p) && existsSync(p)) ?? null;
}

/** Chrome or Edge: LOOPWEFT_CHROME if set, else the first one installed; null if there is none. */
export function findBrowser(env: NodeJS.ProcessEnv = process.env): string | null {
  const named = env.LOOPWEFT_CHROME;
  if (named) return existsSync(named) ? named : null;
  return BROWSERS.find((p) => existsSync(p)) ?? null;
}

/**
 * Switches that keep a headless run to itself: no first-run pages, no background traffic, no reports, no field
 * trials (features a browser switches on for some people only), so every run draws the same way. Not
 * --disable-gpu: without the GPU's drawing path, text inside a drawn frame lands about a pixel from where the
 * page draws it.
 */
export const QUIET_SWITCHES = [
  '--headless',
  '--hide-scrollbars',
  '--disable-field-trial-config',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-client-side-phishing-detection',
  '--disable-breakpad',
  '--metrics-recording-only',
  '--no-pings',
  '--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication',
  '--force-color-profile=srgb',
  '--force-device-scale-factor=1',
];

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  method: string;
}

type Listener = (params: Record<string, unknown>, sessionId: string | undefined) => void;

/** One headless browser, and the protocol to it. */
export class Chrome {
  readonly #child: ChildProcess;
  readonly #in: Writable;
  readonly #profile: string;
  readonly #pending = new Map<number, Pending>();
  readonly #listeners = new Map<string, Set<Listener>>();
  #nextId = 1;
  #buffer = '';
  #stderr = '';
  #exited: Promise<void>;
  #closed = false;

  private constructor(child: ChildProcess, profile: string) {
    this.#child = child;
    this.#profile = profile;
    this.#in = child.stdio[3] as Writable;
    const out = child.stdio[4] as Readable;
    // A pipe that breaks as the browser exits is reported by the exit, not as an error of its own.
    this.#in.on('error', () => undefined);
    out.on('error', () => undefined);
    out.setEncoding('utf8');
    out.on('data', (text: string) => this.#receive(text));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (text: string) => {
      // The last lines only, to explain a browser that would not start.
      this.#stderr = (this.#stderr + text).slice(-4000);
    });
    this.#exited = new Promise((resolve) => {
      child.on('exit', () => {
        this.#closed = true;
        for (const pending of this.#pending.values()) {
          pending.reject(new Error(`The browser closed during ${pending.method}.${this.#why()}`));
        }
        this.#pending.clear();
        resolve();
      });
    });
  }

  /** Starts the browser at `executable` with a page of `width` × `height` CSS pixels. */
  static async launch(executable: string, size = { width: 1920, height: 1080 }): Promise<Chrome> {
    const profile = mkdtempSync(join(tmpdir(), 'loopweft-chrome-'));
    const child = spawn(
      executable,
      [
        ...QUIET_SWITCHES,
        `--window-size=${size.width},${size.height}`,
        `--user-data-dir=${profile}`,
        '--remote-debugging-pipe',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
    );
    const chrome = new Chrome(child, profile);
    await new Promise<void>((resolve, reject) => {
      child.once('error', (error) => reject(new Error(`${executable} could not start: ${error.message}`)));
      child.once('spawn', () => resolve());
    });
    try {
      await chrome.send('Browser.getVersion');
    } catch (error) {
      await chrome.close();
      throw error;
    }
    return chrome;
  }

  #why(): string {
    const last = this.#stderr.trim().split('\n').slice(-3).join('\n');
    return last ? `\n${last}` : '';
  }

  #receive(text: string): void {
    this.#buffer += text;
    for (let end = this.#buffer.indexOf('\0'); end >= 0; end = this.#buffer.indexOf('\0')) {
      const message = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      const data = JSON.parse(message) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { message: string };
        sessionId?: string;
      };
      if (typeof data.id === 'number') {
        const pending = this.#pending.get(data.id);
        this.#pending.delete(data.id);
        if (!pending) continue;
        if (data.error) pending.reject(new Error(`${pending.method}: ${data.error.message}`));
        else pending.resolve(data.result);
      } else if (data.method) {
        for (const listener of this.#listeners.get(data.method) ?? [])
          listener(data.params ?? {}, data.sessionId);
      }
    }
  }

  /** Sends one protocol command and waits for its answer. */
  send<T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (this.#closed) return Promise.reject(new Error(`The browser has closed.${this.#why()}`));
    const id = this.#nextId++;
    const message = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject, method });
      this.#in.write(`${message}\0`);
    });
  }

  /** Calls `listener` on every event named `method`, until the returned function is called. */
  on(method: string, listener: Listener): () => void {
    const set = this.#listeners.get(method) ?? new Set();
    set.add(listener);
    this.#listeners.set(method, set);
    return () => set.delete(listener);
  }

  /** Closes the browser and removes its profile. */
  async close(): Promise<void> {
    if (!this.#closed) {
      this.send('Browser.close').catch(() => undefined);
      const timer = setTimeout(() => this.#child.kill(), 5000);
      await this.#exited;
      clearTimeout(timer);
    }
    // The browser can hold its profile for a moment after it exits (Windows).
    try {
      rmSync(this.#profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }
}

/** A page of the browser: a tab it opened, with its own protocol session. */
export class ChromePage {
  readonly chrome: Chrome;
  readonly sessionId: string;

  private constructor(chrome: Chrome, sessionId: string) {
    this.chrome = chrome;
    this.sessionId = sessionId;
  }

  /** A new page of `width` × `height` CSS pixels at one device pixel each. */
  static async open(chrome: Chrome, size = { width: 1920, height: 1080 }): Promise<ChromePage> {
    const { targetId } = await chrome.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
    });
    const { sessionId } = await chrome.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const page = new ChromePage(chrome, sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: size.width,
      height: size.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    return page;
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}): Promise<T> {
    return this.chrome.send<T>(method, params, this.sessionId);
  }

  /** Opens `url` and waits for its load event. */
  async goto(url: string): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      const stop = this.chrome.on('Page.loadEventFired', (_params, session) => {
        if (session !== this.sessionId) return;
        stop();
        resolve();
      });
    });
    const answer = await this.send<{ errorText?: string }>('Page.navigate', { url });
    if (answer.errorText) throw new Error(`The browser could not open ${url}: ${answer.errorText}`);
    await loaded;
  }

  /** Runs `expression` in the page, waits for it if it is a promise, and returns its value as JSON. */
  async evaluate<T>(expression: string): Promise<T> {
    const answer = await this.send<{
      result: { value?: unknown };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (answer.exceptionDetails) {
      const description = answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text;
      throw new Error(description.split('\n    at ')[0] ?? description);
    }
    return answer.result.value as T;
  }
}
