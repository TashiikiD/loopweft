// Source: PolycrisisPresentation src/audience/chrome.ts, src/audience/render-mode.ts and src/core/wake.ts
// @ 3e5da10 (private), adapted for Loopweft: the progress bar is sized by the story's scene targets (or by
// their steps when no scene has one), and the wake lock can be let go of.
import { h } from '@loopweft/render';
import type { Deck, Pos } from './deck.ts';
import type { ChangeReason } from './session.ts';
import type { NavKind, ShowState } from './show.ts';

/** How a change of the show looks on the stage. */
export type RenderMode = 'instant' | Exclude<NavKind, 'sync'>;

export function renderMode(next: ShowState, prev: ShowState | null, reason: ChangeReason): RenderMode {
  if (!prev || reason === 'sync' || next.nav.kind === 'sync') return 'instant';
  if (next.nav.seq === prev.nav.seq) return 'instant';
  return next.nav.kind;
}

/** A whisper-thin bar along the bottom: one segment per scene, sized by its target time. */
export class ProgressBar {
  readonly el: HTMLElement;
  readonly #segs: HTMLElement[];
  readonly #fills: HTMLElement[];
  readonly #deck: Deck;
  #placed = false;

  constructor(layer: HTMLElement, deck: Deck) {
    this.#deck = deck;
    const timed = deck.targetSeconds > 0;
    this.#fills = deck.scenes.map(() => h('div', { class: 'lp-progress-fill' }));
    this.#segs = deck.scenes.map((scene, i) =>
      h(
        'div',
        { class: 'lp-progress-seg', style: `flex: ${timed ? scene.targetSeconds : scene.steps.length} 1 0` },
        this.#fills[i] as HTMLElement,
      ),
    );
    this.el = h('div', { class: 'lp-progress', 'aria-hidden': 'true' }, ...this.#segs);
    layer.appendChild(this.el);
  }

  update(pos: Pos): void {
    // The first placement lands at once, so the bar never sweeps across while the window opens.
    if (!this.#placed) this.el.style.transition = 'none';
    // An untimed scene (a title page) sits outside the talk, so the bar waits until the talk begins.
    const scene = this.#deck.scenes[pos.s];
    this.el.classList.toggle('untimed', this.#deck.targetSeconds > 0 && scene?.targetSeconds === 0);
    this.#deck.scenes.forEach((sc, i) => {
      (this.#segs[i] as HTMLElement).classList.toggle('done', i < pos.s);
      (this.#fills[i] as HTMLElement).style.width =
        i === pos.s ? `${((pos.b + 1) / sc.steps.length) * 100}%` : '0%';
    });
    if (!this.#placed) {
      this.#placed = true;
      void this.el.offsetWidth;
      this.el.style.transition = '';
    }
  }

  setVisible(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }
}

/**
 * Keeps the screen awake while this window is visible: a title page or a closing frame is held for minutes,
 * and a laptop or projector that dims mid-talk is worse than a little battery. The lock lapses whenever the
 * window is hidden, so it is asked for again each time the window comes back. Returns a function that lets go.
 */
export function keepAwake(doc: Document = document): () => void {
  const nav = doc.defaultView?.navigator as (Navigator & { wakeLock?: WakeLock }) | undefined;
  if (!nav?.wakeLock) return () => {};
  let lock: WakeLockSentinel | null = null;
  let stopped = false;
  const request = () => {
    if (stopped || doc.visibilityState !== 'visible') return;
    nav.wakeLock?.request('screen').then(
      (l) => {
        if (stopped) void l.release();
        else lock = l;
      },
      () => {
        // Not granted (battery saver, a policy): the show runs the same without it.
      },
    );
  };
  request();
  doc.addEventListener('visibilitychange', request);
  return () => {
    stopped = true;
    doc.removeEventListener('visibilitychange', request);
    void lock?.release();
  };
}
