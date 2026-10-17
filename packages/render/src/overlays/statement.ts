// Source: PolycrisisPresentation src/viz/statement.ts @ 539bc8e (private), on @loopweft/motion.
import type { Overlay } from '@loopweft/model';
import { land, type Motion, type Timeline } from '@loopweft/motion';
import { h, typeset } from '../dom.ts';
import { Step, type Transition } from '../step.ts';

export type StatementState = Extract<Overlay, { type: 'statement' }>;

/**
 * Large type over the stage: an opening question, closing lines, a short title or a caveat. Lines arrive one
 * after another; a new statement crossfades with the old one, and an unchanged one stays put.
 */
export class StatementView {
  readonly #host: HTMLElement;
  readonly #motion: Motion;
  #el: HTMLElement | null = null;
  #key = '';
  #running: Timeline | null = null;

  constructor(host: HTMLElement, motion: Motion) {
    this.#host = host;
    this.#motion = motion;
  }

  apply(state: StatementState | undefined, transition: Transition): void {
    this.#running = land(this.#running);
    const key = state ? JSON.stringify({ ...state, citations: undefined }) : '';
    if (key === this.#key) return;
    this.#key = key;
    const step = new Step(this.#motion, transition);

    const old = this.#el;
    if (old) {
      old.removeAttribute('data-reserve');
      step.to(old, { opacity: 0 }, 0, Math.min(0.4, step.fade), { onComplete: () => old.remove() });
    }
    this.#el = null;
    if (state) {
      const style = state.style ?? 'question';
      const el = h(
        'div',
        { class: `statement st-${style} place-${state.place ?? 'bottom'}`, 'data-reserve': true },
        state.kicker ? h('div', { class: 'st-kicker' }, state.kicker) : null,
        ...state.lines.map((line, i) => h('div', { class: `st-line st-line-${i}` }, typeset(line))),
      );
      this.#host.appendChild(el);
      this.#el = el;
      // Closing lines land one by one, with weight; other statements arrive close together.
      const gap = style === 'closing' ? 0.8 : 0.3;
      const start = old ? 0.3 : 0.15;
      ([...el.children] as HTMLElement[]).forEach((part, i) => {
        step.fromTo(
          part,
          { opacity: 0, y: style === 'closing' ? 28 : 16 },
          { opacity: 1, y: 0 },
          start + i * gap,
          step.smooth ? 0.95 : step.fade,
          { ease: 'power3.out' },
        );
      });
    }
    this.#running = step.start();
  }
}
