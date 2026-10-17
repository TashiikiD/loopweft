// Source: PolycrisisPresentation src/viz/legend.ts (LegendView) @ 539bc8e (private), on @loopweft/motion: the
// roles and their names come from the project's types.
import type { Overlay, Project } from '@loopweft/model';
import { land, type Motion, type Timeline } from '@loopweft/motion';
import { glyph, h, svg } from '../dom.ts';
import { shapeGlyph } from '../glyphs.ts';
import { Step, type Transition } from '../step.ts';

export type LegendState = Extract<Overlay, { type: 'legend' }>;

/** The words for the link samples. */
export const LEGEND_LINKS = { plus: 'Increases', minus: 'Decreases', conditional: 'Conditional' };

/** A link sample: increases (arrowhead), decreases (bar) or conditional (dashed). */
function linkGlyph(kind: 'plus' | 'minus' | 'conditional'): SVGSVGElement {
  const el = svg('svg', { class: `lg-link ${kind}`, viewBox: '0 0 54 16', width: 54, height: 16 });
  el.appendChild(svg('path', { d: 'M2 8H42', class: 'lg-line' }));
  if (kind === 'minus') el.appendChild(svg('path', { d: 'M44 1.5H47.5V14.5H44Z', class: 'lg-head' }));
  else el.appendChild(svg('path', { d: 'M52 8L41 2.5V13.5Z', class: 'lg-head' }));
  return el;
}

/**
 * The map's grammar in a few seconds: each role's glyph and name, then what the link styles mean. The glyphs
 * are drawn exactly as on the map, in a neutral colour.
 */
export class LegendView {
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

  apply(state: LegendState | undefined, transition: Transition): void {
    this.#running = land(this.#running);
    const key = state ? (state.place ?? 'top-right') : '';
    if (key === this.#key) return;
    this.#key = key;
    const step = new Step(this.#motion, transition);
    const old = this.#el;
    if (old) {
      old.removeAttribute('data-reserve');
      step.to(old, { opacity: 0 }, 0, Math.min(0.5, step.fade), { onComplete: () => old.remove() });
      this.#el = null;
    }
    if (state) {
      const roles = this.#project.types.roles.map((role) => {
        const icon = svg('svg', { class: 'lg-glyph', viewBox: '-17 -17 34 34', width: 34, height: 34 });
        icon.append(...glyph(shapeGlyph(role.shape, role.shape === 'ring' ? 11 : 12.5)));
        return h('div', { class: 'lg-item' }, icon, h('span', null, role.name));
      });
      const kinds: ('plus' | 'minus' | 'conditional')[] = ['plus', 'minus'];
      if (this.#project.links.some((l) => l.conditional)) kinds.push('conditional');
      const links = kinds.map((kind) =>
        h('div', { class: 'lg-item' }, linkGlyph(kind), h('span', null, LEGEND_LINKS[kind])),
      );
      const el = h(
        'div',
        { class: `legend place-${key}`, 'data-reserve': true },
        roles.length ? h('div', { class: 'lg-row' }, ...roles) : null,
        h('div', { class: 'lg-row' }, ...links),
      );
      this.#host.appendChild(el);
      this.#el = el;
      [...roles, ...links].forEach((item, i) => {
        step.fromTo(item, { opacity: 0, y: 10 }, { opacity: 1, y: 0 }, step.t(0.5 + i * 0.07), step.d(0.7), {
          ease: 'power3.out',
        });
      });
    }
    this.#running = step.start();
  }
}
