// Source: PolycrisisPresentation src/viz/cards.ts @ 539bc8e (private), on @loopweft/motion: the cards come
// from the overlay, numbered, with the sources it cites beneath.
import type { Citation, Overlay, Project } from '@loopweft/model';
import { land, type Motion, type Props, type Timeline } from '@loopweft/motion';
import { h, typeset } from '../dom.ts';
import { Step, type Transition } from '../step.ts';

export type CardsState = Extract<Overlay, { type: 'cards' }>;

/** The cited sources as a short line: each source's in-text label, with its pages. */
export function citationLine(project: Project, citations: Citation[] | undefined): string | null {
  if (!citations?.length) return null;
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  return citations
    .map((c) => {
      const label = sources.get(c.source)?.label ?? c.source;
      return c.pages ? `${label}, p. ${c.pages}` : label;
    })
    .join('; ');
}

/** Cards in the top or bottom band of the stage sit in a compact grid, out of the map's way. */
export const isCompact = (place: CardsState['place']): boolean => /^(top|bottom)/.test(place ?? 'left');

/**
 * A titled column of cards beside the map, or a compact grid above or below it. The active cards stand
 * forward; the rest recede. A set that arrives with one card active first shows every card, so the audience
 * sees them all before attention narrows to one.
 */
export class CardsView {
  readonly #host: HTMLElement;
  readonly #motion: Motion;
  readonly #project: Project;
  #el: HTMLElement | null = null;
  #cards: HTMLElement[] = [];
  #set = '';
  #activeKey = '';
  #running: Timeline | null = null;

  constructor(host: HTMLElement, motion: Motion, project: Project) {
    this.#host = host;
    this.#motion = motion;
    this.#project = project;
  }

  apply(state: CardsState | undefined, transition: Transition): void {
    this.#running = land(this.#running);
    const step = new Step(this.#motion, transition);
    const set = state ? JSON.stringify({ ...state, active: undefined }) : '';
    if (!state || set !== this.#set) {
      if (this.#el) {
        const old = this.#el;
        old.removeAttribute('data-reserve');
        step.to(old, { opacity: 0 }, 0, step.d(0.45), { onComplete: () => old.remove() });
        this.#el = null;
        this.#cards = [];
        this.#set = '';
        this.#activeKey = '';
      }
      if (!state) {
        this.#running = step.start();
        return;
      }
    }
    const key = JSON.stringify(state.active ?? null);
    const entering = !this.#el;
    if (!entering && key === this.#activeKey) return;
    if (entering) this.#build(state, set);
    const active = new Set(state.active ?? this.#cards.map((_, i) => i));
    const settle = entering ? 0.45 + this.#cards.length * 0.12 + 0.85 : 0;
    // A column slides in from the side and its active cards stand forward; a compact grid rises in place.
    const compact = isCompact(state.place);
    const enter: Props = compact ? { y: 10 } : { x: -24 };
    const rest: Props = compact ? { y: 0 } : { x: 0 };
    const forward = (on: boolean): Props => (compact ? {} : { x: on ? 8 : 0 });
    this.#cards.forEach((card, i) => {
      const on = active.has(i);
      const opacity = on ? 1 : 0.34;
      if (entering) {
        step.fromTo(
          card,
          { opacity: 0, ...enter },
          { opacity: state.active ? 1 : opacity, ...rest },
          step.t(0.45 + i * 0.12),
          step.d(0.75),
          { ease: 'power3.out' },
        );
        if (state.active) {
          step.call(() => card.classList.toggle('on', on), step.t(settle));
          step.to(card, { opacity, ...forward(on) }, step.t(settle), step.d(0.6), { ease: 'power3.out' });
        } else card.classList.remove('on');
      } else {
        card.classList.toggle('on', on && !!state.active);
        step.to(card, { opacity, ...forward(on && !!state.active) }, 0, step.d(0.6), { ease: 'power3.out' });
      }
    });
    const head = this.#el?.querySelector('.cd-head');
    if (entering && head)
      step.fromTo(head, { opacity: 0, y: 8 }, { opacity: 1, y: 0 }, step.t(0.3), step.d(0.6));
    this.#activeKey = key;
    this.#running = step.start();
  }

  #build(state: CardsState, set: string): void {
    this.#cards = state.items.map((c, i) =>
      h(
        'div',
        { class: 'cd-card' },
        h('span', { class: 'cd-index' }, String(i + 1).padStart(2, '0')),
        h(
          'div',
          { class: 'cd-text' },
          h('div', { class: 'cd-title' }, typeset(c.title)),
          c.sub ? h('div', { class: 'cd-sub' }, typeset(c.sub)) : null,
        ),
      ),
    );
    const source = citationLine(this.#project, state.citations);
    const el = h(
      'div',
      {
        class: `cards place-${state.place ?? 'left'}${isCompact(state.place) ? ' compact' : ''}`,
        'data-reserve': true,
      },
      state.title ? h('div', { class: 'cd-head' }, typeset(state.title)) : null,
      ...this.#cards,
      source ? h('div', { class: 'cd-source' }, source) : null,
    );
    this.#host.appendChild(el);
    this.#el = el;
    this.#set = set;
  }
}
