// Where the canvas puts a variable's label, in map units at the canvas's zoom: on its preferred side, unless the
// ▲/▼ badge a ripple draws on the canvas sits there (badgeOffset can put it at any corner); then on the first
// side clear of it. The preferred side stored in the project is not changed.
import { BADGE_R, type Pt } from '@loopweft/layout';
import type { GraphNode } from '@loopweft/render';

/**
 * Label size on screen: in proportion to the zoom, as the presentation's labels are to its stage (24 px at
 * the whole-map zoom of about 0.9), but never smaller than can be read nor larger than the Studio's text.
 */
export const labelPx = (k: number): number => Math.max(9, Math.min(15, 28 * k));

type Side = GraphNode['labelSide'];

export interface LabelPlace {
  x: number;
  /** The first line's baseline. */
  y: number;
  anchor: 'start' | 'middle' | 'end';
  lines: string[];
  size: number;
}

/** Where a label goes on one side of its variable, at zoom `k`. */
export function labelPlace(n: GraphNode, k: number, side: Side = n.labelSide): LabelPlace {
  const gap = n.r + 6 / k;
  const size = labelPx(k) / k;
  const lines = n.label.split('\n');
  const middle = n.y - ((lines.length - 1) * size * 1.15) / 2 + size * 0.35;
  switch (side) {
    case 'above':
      return {
        x: n.x,
        y: n.y - gap - (lines.length - 1) * size * 1.15 - size * 0.25,
        anchor: 'middle',
        lines,
        size,
      };
    case 'left':
      return { x: n.x - gap, y: middle, anchor: 'end', lines, size };
    case 'right':
      return { x: n.x + gap, y: middle, anchor: 'start', lines, size };
    default:
      return { x: n.x, y: n.y + gap + size * 0.9, anchor: 'middle', lines, size };
  }
}

/** The box a placed label covers, near enough: each letter about 0.56 of the size wide. */
export function labelBox(p: LabelPlace): { x: number; y: number; w: number; h: number } {
  const w = Math.max(...p.lines.map((l) => l.length)) * p.size * 0.56;
  const h = (p.lines.length - 1) * p.size * 1.15 + p.size;
  const x = p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2;
  return { x, y: p.y - p.size * 0.8, w, h };
}

/** Whether a box and a disc meet. */
const meets = (b: { x: number; y: number; w: number; h: number }, c: Pt, r: number) => {
  const dx = c.x - Math.max(b.x, Math.min(c.x, b.x + b.w));
  const dy = c.y - Math.max(b.y, Math.min(c.y, b.y + b.h));
  return dx * dx + dy * dy < r * r;
};

/**
 * A label's place: on its preferred side, or, with a ▲/▼ badge at `badge` (its offset from the variable's
 * centre), on the first side clear of the badge (below, above, right, left), else the preferred one.
 */
export function clearLabelPlace(n: GraphNode, k: number, badge?: Pt): LabelPlace {
  const preferred = labelPlace(n, k);
  if (!badge) return preferred;
  const at = { x: n.x + badge.x, y: n.y + badge.y };
  const sides = [...new Set<Side>([n.labelSide, 'below', 'above', 'right', 'left'])];
  for (const side of sides) {
    const place = labelPlace(n, k, side);
    if (!meets(labelBox(place), at, BADGE_R + 2)) return place;
  }
  return preferred;
}
