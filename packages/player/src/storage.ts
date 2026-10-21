// Source: PolycrisisPresentation src/core/storage.ts and src/core/fresh.ts @ 3e5da10 (private), adapted for
// Loopweft: one browser can hold many presentations (every file opened from disk in Chrome shares one
// storage), so each presentation keeps its place, clock and preferences under its own id.
import { elapsedMs, sanitizeClock } from './clock.ts';
import { type Deck, firstPos, posKey, samePos } from './deck.ts';
import { restoreLimit, sanitizeShowState } from './show.ts';

/** The part of the browser's storage the player uses; it may be missing or throw (private windows, blocked site data). */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The window's local storage, or null where it is blocked. */
export function browserStorage(): KeyValue | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * A short id for a presentation, from the text of its project (FNV-1a, 32 bits, as 8 hex digits). The same
 * project always gives the same id, so a reloaded window finds its place again; another project, another id.
 */
export function presentationId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type StoreKey = 'show' | 'clock' | 'sceneEntry' | 'presenter' | 'audience';

/** A save the browser's storage did not take: kept by the window while it is open. */
interface Kept {
  /** What the window saved, as JSON. */
  text: string;
  /**
   * What storage held under that name when the save failed: what was read then, or, if storage could not be
   * read, what this window last saw there (null for nothing, or never seen).
   */
  under: string | null;
}

/**
 * One presentation's saved state. Every access is guarded: the show runs the same without storage. Where the
 * browser's storage is missing, blocked or full, the store keeps what this window saved for as long as it is
 * open, so reading it back (the clock, when the console leaves) finds it. Once storage can be read and holds
 * something else under that name (another window saved or reset it), storage counts again, so a reset made in
 * another window is seen here.
 */
export class PresentationStore {
  readonly id: string;
  readonly #storage: KeyValue | null;
  readonly #kept = new Map<StoreKey, Kept>();
  /** What this window last saw in storage under each name, by reading or saving it. */
  readonly #lastSeen = new Map<StoreKey, string | null>();

  constructor(id: string, storage: KeyValue | null = browserStorage()) {
    this.id = id;
    this.#storage = storage;
  }

  #key(name: StoreKey): string {
    return `loopweft.present.${this.id}.${name}`;
  }

  /** The key a change to `name` arrives under in another window's storage event. */
  keyOf(name: StoreKey): string {
    return this.#key(name);
  }

  /** What storage holds under `name`, or undefined where it cannot be read. */
  #read(name: StoreKey): string | null | undefined {
    try {
      if (!this.#storage) return undefined;
      const raw = this.#storage.getItem(this.#key(name));
      this.#lastSeen.set(name, raw);
      return raw;
    } catch {
      return undefined;
    }
  }

  load(name: StoreKey): unknown {
    const stored = this.#read(name);
    const kept = this.#kept.get(name);
    let raw = stored;
    if (kept) {
      // Storage counts again once it holds something other than it did when the save failed: another window
      // saved or reset it since. (Something there that this window never saw was saved by another.)
      if (stored === undefined || stored === kept.under) raw = kept.text;
      else this.#kept.delete(name);
    }
    try {
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  save(name: StoreKey, value: unknown): void {
    let text: string | undefined;
    try {
      text = JSON.stringify(value);
    } catch {
      // Not JSON (a cycle, a BigInt): nothing is saved, and what was saved stays.
    }
    if (typeof text !== 'string') return;
    try {
      if (this.#storage) {
        this.#storage.setItem(this.#key(name), text);
        this.#kept.delete(name);
        this.#lastSeen.set(name, text);
        return;
      }
    } catch {
      // Blocked or full: kept below.
    }
    // Not needed to present (the show runs without it); this window keeps it while it is open.
    const now = this.#read(name);
    this.#kept.set(name, { text, under: now !== undefined ? now : (this.#lastSeen.get(name) ?? null) });
  }

  remove(name: StoreKey): void {
    this.#kept.delete(name);
    try {
      if (!this.#storage) return;
      this.#storage.removeItem(this.#key(name));
      this.#lastSeen.set(name, null);
    } catch {
      // Nothing stored, or storage blocked: nothing to remove.
    }
  }
}

export interface SavedSession {
  /** The step where the last run stopped, e.g. "S05.3". */
  key: string;
  clockMs: number;
  clockRunning: boolean;
  /** At the first step, the clock at zero and stopped, nothing paused or blacked out: nothing to reset. */
  fresh: boolean;
}

/** What an earlier run (a rehearsal) left in this browser. */
export function savedSession(deck: Deck, store: PresentationStore, now: number): SavedSession {
  const show = sanitizeShowState(deck, store.load('show'), restoreLimit(now));
  const clock = sanitizeClock(store.load('clock'));
  const pos = show?.pos ?? firstPos();
  const clockMs = clock ? elapsedMs(clock, now) : 0;
  const clockRunning = !!clock?.running;
  return {
    key: deck.scenes.length > 0 ? posKey(deck, pos) : '',
    clockMs,
    clockRunning,
    fresh: samePos(pos, firstPos()) && clockMs < 1000 && !clockRunning && !show?.paused && !show?.blackout,
  };
}

/** Back to the first step, the clock at 0:00 and stopped. */
export function resetSession(store: PresentationStore): void {
  store.remove('show');
  store.remove('clock');
  store.remove('sceneEntry');
}
