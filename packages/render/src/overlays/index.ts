// Source: PolycrisisPresentation src/viz/stage.ts (VizStage) @ 539bc8e (private), adapted for Loopweft: a step
// lists its overlays, and they stack in list order, later ones on top; the scene caption stays above them.
import type { Overlay, Project } from '@loopweft/model';
import type { Motion } from '@loopweft/motion';
import { h } from '../dom.ts';
import type { Transition } from '../step.ts';
import { type CaptionState, CaptionView } from './caption.ts';
import { CardsView } from './cards.ts';
import { ImageView } from './image.ts';
import { LegendView } from './legend.ts';
import { StatementView } from './statement.ts';
import { TitleView } from './title.ts';

type Kind = Exclude<Overlay['type'], 'caption'>;

interface Slot {
  layer: HTMLElement;
  view: { apply(state: never, transition: Transition): void };
}

/**
 * Every overlay of a step, each in its own layer. A view stays from step to step while its overlay is listed
 * (so an unchanged statement stays put and cards change focus in place); overlays a step no longer lists
 * fade out. The n-th overlay of a type in one step continues the n-th of that type in the step before.
 */
export class OverlayStage {
  readonly #host: HTMLElement;
  readonly #motion: Motion;
  readonly #project: Project;
  readonly #captionLayer: HTMLElement;
  readonly #caption: CaptionView;
  readonly #slots = new Map<string, Slot>();

  constructor(host: HTMLElement, motion: Motion, project: Project) {
    this.#host = host;
    this.#motion = motion;
    this.#project = project;
    this.#captionLayer = h('div', { class: 'overlay-layer overlay-caption' });
    host.appendChild(this.#captionLayer);
    this.#caption = new CaptionView(this.#captionLayer, motion);
  }

  #slot(kind: Kind, key: string): Slot {
    const known = this.#slots.get(key);
    if (known) return known;
    const layer = h('div', { class: `overlay-layer overlay-${kind}`, 'data-slot': key });
    this.#host.insertBefore(layer, this.#captionLayer);
    const motion = this.#motion;
    const project = this.#project;
    const view =
      kind === 'title'
        ? new TitleView(layer, motion)
        : kind === 'statement'
          ? new StatementView(layer, motion)
          : kind === 'cards'
            ? new CardsView(layer, motion, project)
            : kind === 'legend'
              ? new LegendView(layer, motion, project)
              : new ImageView(layer, motion, project);
    const slot: Slot = { layer, view };
    this.#slots.set(key, slot);
    return slot;
  }

  /**
   * Shows a step's overlays. The caption goes first, then the rest, so the map can place its labels around
   * all of them afterwards.
   */
  apply(overlays: Overlay[], caption: CaptionState, transition: Transition): void {
    this.#caption.apply(overlays.some((o) => o.type === 'caption') ? caption : undefined, transition);
    const counts = new Map<Kind, number>();
    const wanted = new Map<string, { overlay: Exclude<Overlay, { type: 'caption' }>; order: number }>();
    overlays.forEach((overlay, order) => {
      if (overlay.type === 'caption') return;
      const n = counts.get(overlay.type) ?? 0;
      counts.set(overlay.type, n + 1);
      wanted.set(`${overlay.type}#${n}`, { overlay, order });
    });
    for (const [key, slot] of this.#slots) {
      if (!wanted.has(key)) slot.view.apply(undefined as never, transition);
    }
    for (const [key, { overlay, order }] of wanted) {
      const slot = this.#slot(overlay.type, key);
      slot.layer.style.zIndex = String(order + 1);
      slot.view.apply(overlay as never, transition);
    }
  }
}
