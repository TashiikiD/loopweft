// Source: PolycrisisPresentation src/audience/placeholder.ts @ 539bc8e (private), on @loopweft/motion: a step
// shows its scene's caption by listing a caption overlay, instead of a scene-wide setting and a hide flag.
import { land, type Motion, Timeline } from '@loopweft/motion';
import { h, typeset } from '../dom.ts';
import type { Transition } from '../step.ts';

export interface CaptionState {
  /** The scene's position in the story (00, 01…). */
  number: number;
  title: string;
  headline?: string;
}

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * The scene's caption above the map: its number and title, and its headline. A new scene's caption rises in
 * as the old one fades; a step without a caption fades it out, and the next one with it brings it back.
 */
export class CaptionView {
  readonly #host: HTMLElement;
  readonly #motion: Motion;
  #card: HTMLElement | null = null;
  #key = '';
  #shown = false;
  #running: Timeline | null = null;

  constructor(host: HTMLElement, motion: Motion) {
    this.#host = host;
    this.#motion = motion;
  }

  apply(state: CaptionState | undefined, transition: Transition): void {
    this.#running = land(this.#running);
    const instant = transition === 'instant';
    const tl = new Timeline();

    if (!state) {
      const card = this.#card;
      if (card && this.#shown) {
        card.removeAttribute('data-reserve');
        if (instant) this.#motion.set(card, { opacity: 0 });
        else tl.to(card, { opacity: 0 }, { duration: 0.6, ease: EASE_OUT });
      }
      this.#shown = false;
      this.#running = this.#motion.play(tl);
      return;
    }

    const key = JSON.stringify(state);
    if (key === this.#key && this.#card) {
      if (!this.#shown) {
        this.#card.setAttribute('data-reserve', '');
        if (instant) this.#motion.set(this.#card, { opacity: 1 });
        else tl.to(this.#card, { opacity: 1 }, { duration: 0.6, ease: EASE_OUT });
        this.#shown = true;
      }
      this.#running = this.#motion.play(tl);
      return;
    }

    // data-reserve tells the map to keep its labels clear of this text.
    const card = h(
      'div',
      { class: 'caption', 'data-reserve': true },
      h('div', { class: 'caption-kicker' }, `${String(state.number).padStart(2, '0')} · ${state.title}`),
      state.headline ? h('h1', { class: 'caption-headline' }, typeset(state.headline)) : null,
    );
    const old = this.#card;
    const wasShown = this.#shown;
    this.#card = card;
    this.#key = key;
    this.#shown = true;
    if (old) old.removeAttribute('data-reserve');
    if (instant || !old || !wasShown) old?.remove();
    this.#host.appendChild(card);
    if (instant) {
      this.#running = this.#motion.play(tl);
      return;
    }
    // Crossfade: the old text dims out while the new one rises in.
    if (old && wasShown) {
      tl.to(old, { opacity: 0 }, { duration: 0.35, ease: 'power1.out', onComplete: () => old.remove() });
    }
    tl.fromTo(card, { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, { duration: 0.8, ease: EASE_OUT, at: 0.15 });
    this.#running = this.#motion.play(tl);
  }
}
