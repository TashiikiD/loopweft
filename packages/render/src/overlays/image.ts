// An embedded image over the stage, with its caption and credit. New in Loopweft (the deck's images were
// one-off scene visuals).
import type { Overlay, Project } from '@loopweft/model';
import { land, type Motion, type Timeline } from '@loopweft/motion';
import { h, typeset } from '../dom.ts';
import { Step, type Transition } from '../step.ts';

export type ImageState = Extract<Overlay, { type: 'image' }>;

export class ImageView {
  readonly #host: HTMLElement;
  readonly #motion: Motion;
  readonly #project: Project;
  #el: HTMLElement | null = null;
  #key = '';
  #running: Timeline | null = null;

  constructor(host: HTMLElement, motion: Motion, project: Project) {
    this.#host = host;
    this.#motion = motion;
    this.#project = project;
  }

  apply(state: ImageState | undefined, transition: Transition): void {
    this.#running = land(this.#running);
    const key = state ? JSON.stringify({ ...state, citations: undefined }) : '';
    if (key === this.#key) return;
    this.#key = key;
    const step = new Step(this.#motion, transition);
    const old = this.#el;
    if (old) {
      old.removeAttribute('data-reserve');
      step.to(old, { opacity: 0 }, 0, Math.min(0.5, step.fade), { onComplete: () => old.remove() });
      this.#el = null;
    }
    const src = state ? this.#project.assets[state.asset] : undefined;
    if (state && src) {
      const note = [state.caption, state.credit].filter(Boolean).map((t) => typeset(t as string));
      const el = h(
        'figure',
        { class: `image place-${state.place ?? 'center'}`, 'data-reserve': true },
        h('img', { src, alt: state.alt }),
        note.length ? h('figcaption', null, note.join(' · ')) : null,
      );
      this.#host.appendChild(el);
      this.#el = el;
      step.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0 }, step.t(0.2), step.d(0.8), {
        ease: 'power3.out',
      });
    }
    this.#running = step.start();
  }
}
