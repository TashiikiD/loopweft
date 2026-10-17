// Source: PolycrisisPresentation src/map/map-view.ts (roleShape, TREND_GLYPH, LOOP_ARROW and the side-effect
// flag) @ 539bc8e (private), generalized to every role shape of the format.
//
// The map's glyphs as plain element descriptions, so the screen and exports without a browser draw the same.
import type { Trend } from '@loopweft/model';
import type { Shape } from './graph.ts';

export interface GlyphPart {
  tag: 'circle' | 'rect' | 'polygon' | 'path';
  attrs: Record<string, string | number>;
}

const f = (n: number) => n.toFixed(2);

/** A regular polygon of `sides` corners on radius `R`, the first at `start` radians. */
function polygon(sides: number, R: number, start: number): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / sides;
    return `${f(R * Math.cos(a))},${f(R * Math.sin(a))}`;
  }).join(' ');
}

/**
 * A variable's glyph for its role's shape, at radius `r` (rounded square = slow stress, circle = trigger,
 * octagon = crisis and ring = response, in the polycrisis example). Filled parts carry `node-core`; a ring is
 * `node-ring` with a `node-dot` at its centre.
 */
export function shapeGlyph(shape: Shape, r: number): GlyphPart[] {
  switch (shape) {
    case 'ring':
      return [
        { tag: 'circle', attrs: { r, class: 'node-ring' } },
        { tag: 'circle', attrs: { r: f(r * 0.42), class: 'node-dot' } },
      ];
    case 'rounded-square':
    case 'square': {
      const s = r * 0.9;
      const rx = shape === 'square' ? s * 0.08 : s * 0.34;
      return [
        {
          tag: 'rect',
          attrs: { x: f(-s), y: f(-s), width: f(2 * s), height: f(2 * s), rx: f(rx), class: 'node-core' },
        },
      ];
    }
    case 'octagon':
      // Large enough that its flat sides read as an octagon, not a circle, on a projector.
      return [{ tag: 'polygon', attrs: { points: polygon(8, r * 1.24, Math.PI / 8), class: 'node-core' } }];
    case 'diamond':
      return [{ tag: 'polygon', attrs: { points: polygon(4, r * 1.3, -Math.PI / 2), class: 'node-core' } }];
    case 'triangle':
      return [{ tag: 'polygon', attrs: { points: polygon(3, r * 1.42, -Math.PI / 2), class: 'node-core' } }];
    case 'hexagon':
      return [{ tag: 'polygon', attrs: { points: polygon(6, r * 1.16, -Math.PI / 2), class: 'node-core' } }];
    default:
      return [{ tag: 'circle', attrs: { r, class: 'node-core' } }];
  }
}

/** ▲, ▼ and ± badges beside a variable. */
export const TREND_GLYPH: Record<Trend, string> = {
  up: 'M0 -4.5L4.5 3H-4.5Z',
  down: 'M0 4.5L4.5 -3H-4.5Z',
  mixed: 'M0 -6L3.4 -1.2H-3.4Z M0 6L3.4 1.2H-3.4Z',
};

/** A circular arrow around a loop's letter, as in hand-drawn causal loop diagrams. */
export const LOOP_ARROW = (() => {
  const R = 15;
  const a0 = (-60 * Math.PI) / 180;
  const a1 = (230 * Math.PI) / 180;
  const p = (a: number) => `${f(R * Math.cos(a))} ${f(R * Math.sin(a))}`;
  const tip = { x: R * Math.cos(a1), y: R * Math.sin(a1) };
  // The arrowhead points along the clockwise tangent at the end of the arc.
  const tx = -Math.sin(a1);
  const ty = Math.cos(a1);
  const nx = Math.cos(a1);
  const ny = Math.sin(a1);
  const head =
    `M${f(tip.x + tx * 5)} ${f(tip.y + ty * 5)}` +
    `L${f(tip.x + nx * 3.6)} ${f(tip.y + ny * 3.6)}` +
    `L${f(tip.x - nx * 3.6)} ${f(tip.y - ny * 3.6)}Z`;
  return { arc: `M${p(a0)}A${R} ${R} 0 1 1 ${p(a1)}`, head, length: R * (a1 - a0) };
})();

/** The "!" in a link's flag (its type's marker), drawn on a disc of radius 9. */
export const FLAG_MARK = 'M-1.4 -5.2H1.4L0.9 1.4H-0.9Z M0 2.8A1.5 1.5 0 1 1 0 5.8A1.5 1.5 0 1 1 0 2.8Z';
