// Source: PolycrisisPresentation src/stage/stage.ts @ 539bc8e (private), adapted for Loopweft: it fills its
// host instead of the window, and carries the theme's tokens as CSS variables.
import { STAGE } from '@loopweft/layout';
import { h } from './dom.ts';
import { type ThemeBase, type ThemeTokens, themeVariables } from './theme.ts';

export interface StageLayers {
  bg: HTMLElement;
  map: HTMLElement;
  overlay: HTMLElement;
  /** Above everything: progress, hints. */
  chrome: HTMLElement;
}

/**
 * A fixed 1920 × 1080 stage, scaled to fit its host and centred (letterboxed on 4:3 projectors). Everything
 * on it is laid out in stage pixels, so text sizes are true 1080p sizes on the projector.
 */
export class Stage {
  readonly viewport: HTMLElement;
  readonly root: HTMLElement;
  readonly layers: StageLayers;
  scale = 1;
  readonly #observer: ResizeObserver | null = null;
  readonly #onResize = () => this.fit();

  constructor(host: HTMLElement, theme: { base: ThemeBase; tokens: ThemeTokens }) {
    this.layers = {
      bg: h('div', { class: 'layer layer-bg' }),
      map: h('div', { class: 'layer layer-map' }),
      overlay: h('div', { class: 'layer layer-overlay' }),
      chrome: h('div', { class: 'layer layer-chrome' }),
    };
    const { bg, map, overlay, chrome } = this.layers;
    this.root = h('div', { class: 'lw-stage' }, bg, map, overlay, chrome);
    this.viewport = h('div', { class: 'lw-viewport', 'data-theme': theme.base }, this.root);
    for (const [name, value] of Object.entries(themeVariables(theme.tokens))) {
      this.viewport.style.setProperty(name, value);
    }
    host.appendChild(this.viewport);
    if (typeof window !== 'undefined') window.addEventListener('resize', this.#onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(this.#onResize);
      this.#observer.observe(this.viewport);
    }
    this.fit();
  }

  fit(): void {
    const w = this.viewport.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : STAGE.w);
    const hgt = this.viewport.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : STAGE.h);
    this.scale = Math.min(w / STAGE.w, hgt / STAGE.h) || 1;
    this.root.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
  }

  /** Where an element sits on the stage, in stage pixels. */
  boxOf(el: Element): { x: number; y: number; w: number; h: number } {
    const origin = this.root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - origin.left) / this.scale,
      y: (r.top - origin.top) / this.scale,
      w: r.width / this.scale,
      h: r.height / this.scale,
    };
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.#onResize);
    this.#observer?.disconnect();
    this.viewport.remove();
  }
}
