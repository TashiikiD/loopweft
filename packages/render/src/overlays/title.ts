// Source: PolycrisisPresentation src/viz/title.ts @ 539bc8e (private), on @loopweft/motion: the title, subtitle
// and further lines come from the overlay instead of the deck's content.
import type { Overlay } from '@loopweft/model';
import { land, type Motion, type Timeline } from '@loopweft/motion';
import { h, typeset } from '../dom.ts';
import { Step, type Transition } from '../step.ts';

export type TitleState = Extract<Overlay, { type: 'title' }>;

/**
 * A title page over the living map: the title, its subtitle, a rule and any further lines (such as the
 * author and course). The map behind it can keep pulses wandering (an ambient map state), so the audience
 * sees the subject before a word is said.
 */
export class TitleView {
  readonly #host: HTMLElement;
  readonly #motion: Motion;
  #el: HTMLElement | null = null;
  #key = '';
  #running: Timeline | null = null;

  constructor(host: HTMLElement, motion: Motion) {
    this.#host = host;
    this.#motion = motion;
  }

  apply(state: TitleState | undefined, transition: Transition): void {
    this.#running = land(this.#running);
    const key = state ? JSON.stringify(state) : '';
    if (key === this.#key) return;
    this.#key = key;
    const step = new Step(this.#motion, transition);
    const old = this.#el;
    if (old) step.to(old, { opacity: 0 }, 0, step.d(0.7), { onComplete: () => old.remove() });
    this.#el = null;
    if (!state) {
      this.#running = step.start();
      return;
    }

    const title = h('h1', { class: 'tt-title' }, typeset(state.title));
    const subtitle = state.subtitle ? h('div', { class: 'tt-sub' }, typeset(state.subtitle)) : null;
    const rule = h('div', { class: 'tt-rule' });
    const lines = (state.lines ?? []).map((line, i) =>
      h('div', { class: i === 0 ? 'tt-name' : 'tt-meta' }, typeset(line)),
    );
    const el = h(
      'div',
      { class: 'title-page' },
      h('div', { class: 'tt-block' }, title, subtitle, rule, ...lines),
    );
    this.#host.appendChild(el);
    this.#el = el;

    // The stage holds dark for a beat; then the title arrives, then who is giving it.
    const lead = 0.55;
    step.fromTo(el, { opacity: 0 }, { opacity: 1 }, step.t(lead), step.d(0.6), { ease: 'none' });
    step.fromTo(title, { opacity: 0, y: 34 }, { opacity: 1, y: 0 }, step.t(lead + 0.4), step.d(1.2), {
      ease: 'power3.out',
    });
    if (subtitle) {
      step.fromTo(subtitle, { opacity: 0, y: 20 }, { opacity: 1, y: 0 }, step.t(lead + 0.95), step.d(1.0), {
        ease: 'power3.out',
      });
    }
    step.fromTo(
      rule,
      { scaleX: 0, transformOrigin: '0% 50%' },
      { scaleX: 1 },
      step.t(lead + 1.45),
      step.d(0.9),
      { ease: 'power2.inOut' },
    );
    lines.forEach((part, i) => {
      step.fromTo(
        part,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0 },
        step.t(lead + 1.7 + i * 0.18),
        step.d(0.8),
        {
          ease: 'power3.out',
        },
      );
    });
    this.#running = step.start();
  }
}
