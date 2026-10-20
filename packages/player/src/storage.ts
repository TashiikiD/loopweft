// Source: PolycrisisPresentation src/core/storage.ts and src/core/fresh.ts @ 3e5da10 (private), adapted for
// Loopweft: one browser can hold many presentations (every file opened from disk in Chrome shares one
// storage), so each presentation keeps its place, clock and preferences under its own id.
import { elapsedMs, sanitizeClock } from './clock.ts';
import { type Deck, firstPos, posKey, samePos } from './deck.ts';
import { sanitizeShowState } from './show.ts';

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

/** One presentation's saved state. Every access is guarded: the show runs the same without storage. */
export class PresentationStore {
  readonly id: string;
  readonly #storage: KeyValue | null;

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

  load(name: StoreKey): unknown {
    try {
      const raw = this.#storage?.getItem(this.#key(name));
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  save(name: StoreKey, value: unknown): void {
    try {
      this.#storage?.setItem(this.#key(name), JSON.stringify(value));
    } catch {
      // Not needed to present: the show runs without it.
    }
  }

  remove(name: StoreKey): void {
    try {
      this.#storage?.removeItem(this.#key(name));
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
  const show = sanitizeShowState(deck, store.load('show'));
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
