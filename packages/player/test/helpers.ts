import { readFileSync } from 'node:fs';
import { type Project, readProject } from '@loopweft/model';
import type { ChannelLike, LinkHost, PostTarget } from '../src/index.ts';

export const exampleText = (): string =>
  readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8');

export function example(): Project {
  const result = readProject(exampleText());
  if (!result.ok) throw new Error('The example does not open');
  return result.project;
}

/**
 * A pretend browser for links: windows that post to each other, BroadcastChannels shared by name, timers
 * and a clock moved by hand.
 */
export class FakeBrowser {
  now = 1_000_000;
  readonly #channels = new Map<string, Set<FakeChannel>>();
  readonly #timers = new Set<{ ms: number; next: number; fn: () => void }>();
  #ids = 0;
  /** Whether BroadcastChannels work here (a file opened from disk in Safari: no). */
  channels = true;

  window(opener: FakeWindow | null = null): FakeWindow {
    return new FakeWindow(this, opener);
  }

  openChannel(name: string, owner: FakeWindow): ChannelLike | null {
    if (!this.channels) return null;
    const channel = new FakeChannel(this, name, owner);
    const set = this.#channels.get(name) ?? new Set();
    set.add(channel);
    this.#channels.set(name, set);
    return channel;
  }

  broadcast(from: FakeChannel, data: unknown): void {
    for (const c of this.#channels.get(from.name) ?? [])
      if (c !== from && !c.closed) c.owner.run(() => c.onmessage?.({ data: structuredClone(data) }));
  }

  closeChannel(channel: FakeChannel): void {
    this.#channels.get(channel.name)?.delete(channel);
  }

  every(ms: number, fn: () => void): () => void {
    const timer = { ms, next: this.now + ms, fn };
    this.#timers.add(timer);
    return () => this.#timers.delete(timer);
  }

  /** Moves the clock on, running the timers due. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.#timers].filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      this.now = due.next;
      due.next += due.ms;
      due.fn();
    }
    this.now = end;
  }

  newId(): string {
    this.#ids += 1;
    return `w${this.#ids}`;
  }
}

class FakeChannel implements ChannelLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  closed = false;
  readonly name: string;
  readonly owner: FakeWindow;
  readonly #browser: FakeBrowser;

  constructor(browser: FakeBrowser, name: string, owner: FakeWindow) {
    this.#browser = browser;
    this.name = name;
    this.owner = owner;
  }

  postMessage(message: unknown): void {
    // Structured cloning: each receiver gets a copy.
    this.#browser.broadcast(this, message);
  }

  close(): void {
    this.closed = true;
    this.#browser.closeChannel(this);
  }
}

export class FakeWindow implements PostTarget {
  closed = false;
  readonly opener: FakeWindow | null;
  readonly #browser: FakeBrowser;
  readonly #listeners = new Set<(data: unknown, source: unknown) => void>();
  /** Messages posted to this window, as the sender's origin argument named them. */
  readonly origins: string[] = [];

  constructor(browser: FakeBrowser, opener: FakeWindow | null) {
    this.#browser = browser;
    this.opener = opener;
  }

  /** Who is posting: set by the sending window's host. */
  static sender: FakeWindow | null = null;

  postMessage(message: unknown, targetOrigin: string): void {
    if (this.closed) throw new Error('closed');
    this.origins.push(targetOrigin);
    const source = FakeWindow.sender;
    // The receiver handles it as itself: whatever it posts in reply comes from it.
    this.run(() => {
      for (const fn of [...this.#listeners]) fn(structuredClone(message), source);
    });
  }

  host(targetOrigin = 'https://example.test'): LinkHost {
    const browser = this.#browser;
    return {
      listen: (fn) => {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn);
      },
      opener: () => this.opener,
      targetOrigin,
      channel: (name) => browser.openChannel(name, this),
      every: (ms, fn) => browser.every(ms, () => this.run(fn)),
      now: () => browser.now,
      newId: () => browser.newId(),
    };
  }

  /** Runs `fn` as this window, so that what it posts names this window as its source. */
  run<T>(fn: () => T): T {
    const before = FakeWindow.sender;
    FakeWindow.sender = this;
    try {
      return fn();
    } finally {
      FakeWindow.sender = before;
    }
  }
}

/** A storage that keeps everything in memory, as a browser's local storage would. */
export class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}
