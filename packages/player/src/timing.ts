// Source: PolycrisisPresentation src/presenter/presenter.ts @ 3e5da10 (private): the console's clock, scene
// entry and pace, taken out into one place, so the rehearsal notes and the console keep the same clock (in
// the presentation's storage: a rehearsal's clock shows on the start page, which offers a reset).
import {
  type ClockState,
  elapsedMs,
  fmt,
  newClock,
  type Pace,
  pace,
  type SceneEntry,
  sanitizeClock,
  toggleClock,
} from './clock.ts';
import { type Deck, type DeckScene, type Pos, sceneAt } from './deck.ts';
import type { PresentationStore } from './storage.ts';

export interface Timing {
  scene: DeckScene;
  /** Seconds on the presenter's clock. */
  elapsed: number;
  /** Seconds since this scene came up, on that clock. */
  sceneElapsed: number;
  started: boolean;
  running: boolean;
  pace: Pace;
}

function sanitizeEntry(value: unknown): SceneEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<SceneEntry>;
  return typeof v.sceneId === 'string' && typeof v.atMs === 'number'
    ? { sceneId: v.sceneId, atMs: v.atMs }
    : null;
}

/** The presenter's clock: started by hand (T), never moving the show. */
export class PresenterClock {
  clock: ClockState = newClock();
  entry: SceneEntry = { sceneId: '', atMs: 0 };
  readonly #store: PresentationStore;
  readonly #deck: Deck;
  readonly #now: () => number;

  constructor(store: PresentationStore, deck: Deck, now: () => number) {
    this.#store = store;
    this.#deck = deck;
    this.#now = now;
    this.reload();
  }

  /** Reads the clock again from storage (another window may have changed it). */
  reload(): void {
    this.clock = sanitizeClock(this.#store.load('clock')) ?? newClock();
    this.entry = sanitizeEntry(this.#store.load('sceneEntry')) ?? { sceneId: '', atMs: 0 };
  }

  /** Notes when a new scene comes up, on the clock. */
  noteScene(pos: Pos): void {
    if (this.#deck.scenes.length === 0) return;
    const scene = sceneAt(this.#deck, pos);
    if (this.entry.sceneId === scene.id) return;
    this.entry = { sceneId: scene.id, atMs: elapsedMs(this.clock, this.#now()) };
    this.#store.save('sceneEntry', this.entry);
  }

  /** Starts or pauses the clock. Starting from 0:00 counts this scene from zero. */
  toggle(pos: Pos): void {
    this.clock = toggleClock(this.clock, this.#now());
    if (this.clock.running && this.clock.accumulatedMs === 0 && this.#deck.scenes.length > 0)
      this.entry = { sceneId: sceneAt(this.#deck, pos).id, atMs: 0 };
    this.#save();
  }

  reset(pos: Pos): void {
    this.clock = newClock();
    if (this.#deck.scenes.length > 0) this.entry = { sceneId: sceneAt(this.#deck, pos).id, atMs: 0 };
    this.#save();
  }

  read(pos: Pos): Timing {
    const scene = sceneAt(this.#deck, pos);
    const elapsed = elapsedMs(this.clock, this.#now()) / 1000;
    const sceneElapsed = this.entry.sceneId === scene.id ? Math.max(0, elapsed - this.entry.atMs / 1000) : 0;
    const started = this.clock.running || this.clock.accumulatedMs > 0;
    return {
      scene,
      elapsed,
      sceneElapsed,
      started,
      running: this.clock.running,
      pace: pace(scene, elapsed, sceneElapsed, started),
    };
  }

  #save(): void {
    this.#store.save('clock', this.clock);
    this.#store.save('sceneEntry', this.entry);
  }
}

/** How the presenter is doing, in words: "On pace", "0:20 behind", "Clock not started". */
export function paceText(t: Pick<Timing, 'pace'>): string {
  const { behind, status } = t.pace;
  switch (status) {
    case 'idle':
      return 'Clock not started';
    case 'ahead':
      return `${fmt(-behind)} ahead`;
    case 'on':
      return behind > 3
        ? `On pace (+${fmt(behind)})`
        : behind < -3
          ? `On pace (${fmt(-behind)} early)`
          : 'On pace';
    default:
      return `${fmt(behind)} behind`;
  }
}
