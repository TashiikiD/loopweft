// Source: PolycrisisPresentation src/map/minimap.ts @ 539bc8e (private), on @loopweft/motion, and fitted to
// maps that reach beyond the stage.
import { type Camera, STAGE, viewRect } from '@loopweft/layout';
import type { Motion } from '@loopweft/motion';
import { svg } from './dom.ts';
import type { Graph } from './graph.ts';

const W = 240;
const H = 135;
const PAD = 40;

/** Where the minimap sits on the stage (matches .minimap in render.css). */
export const MINIMAP_BOX = { x: STAGE.w - 56 - W, y: STAGE.h - 56 - H, w: W, h: H };

/** Orientation inset: the whole map in miniature, with the camera's view outlined. */
export class Minimap {
  readonly el: SVGSVGElement;
  readonly #view: SVGRectElement;
  readonly #motion: Motion;
  /** World → minimap: the stage, grown to take in any variable beyond it. */
  readonly #world: { x: number; y: number; k: number };

  constructor(host: HTMLElement, graph: Graph, motion: Motion) {
    this.#motion = motion;
    const nodes = [...graph.nodes.values()];
    const x0 = Math.min(0, ...nodes.map((n) => n.x - PAD));
    const y0 = Math.min(0, ...nodes.map((n) => n.y - PAD));
    const x1 = Math.max(STAGE.w, ...nodes.map((n) => n.x + PAD));
    const y1 = Math.max(STAGE.h, ...nodes.map((n) => n.y + PAD));
    const k = Math.min(W / (x1 - x0), H / (y1 - y0));
    this.#world = { x: x0, y: y0, k };

    this.el = svg('svg', { class: 'minimap', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    this.el.appendChild(svg('rect', { class: 'minimap-frame', width: W, height: H, rx: 8 }));
    for (const n of nodes) {
      const at = this.#map(n.x, n.y);
      this.el.appendChild(
        svg('circle', {
          cx: at.x.toFixed(1),
          cy: at.y.toFixed(1),
          r: n.response ? 2.2 : 1.9,
          fill: n.colour,
        }),
      );
    }
    this.#view = svg('rect', { class: 'minimap-view', rx: 3 });
    this.el.appendChild(this.#view);
    this.el.style.opacity = '0';
    host.appendChild(this.el);
  }

  #map(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.#world.x) * this.#world.k, y: (y - this.#world.y) * this.#world.k };
  }

  update(cam: Camera): void {
    const r = viewRect(cam);
    const a = this.#map(r.x, r.y);
    const b = this.#map(r.x + r.w, r.y + r.h);
    const x = Math.max(0, a.x);
    const y = Math.max(0, a.y);
    this.#view.setAttribute('x', x.toFixed(1));
    this.#view.setAttribute('y', y.toFixed(1));
    this.#view.setAttribute('width', Math.max(4, Math.min(W, b.x) - x).toFixed(1));
    this.#view.setAttribute('height', Math.max(4, Math.min(H, b.y) - y).toFixed(1));
  }

  /** Shows or hides the minimap: at once for an instant step (a still, a jump), else fading over `duration`. */
  setVisible(visible: boolean, duration: number): void {
    const props = { opacity: visible ? 1 : 0 };
    if (duration <= 0) this.#motion.set(this.el, props);
    else this.#motion.to(this.el, props, { duration });
  }
}
