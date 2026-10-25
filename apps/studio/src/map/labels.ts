// Where the canvas puts a variable's label, in map units at the canvas's zoom: on its preferred side, unless the
// ▲/▼ badge a ripple draws on the canvas sits there (badgeOffset can put it at any corner); then on the first
// side clear of it, of the arrowheads arriving there and of the other variables. The preferred side stored in the
// project is not changed.
import { BADGE_R, distanceToPolygon, type Pt, segmentsCross } from '@loopweft/layout';
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

/** Whether a box and a polygon meet: one holds a corner of the other, or their edges cross. */
const meetsPolygon = (b: { x: number; y: number; w: number; h: number }, poly: readonly Pt[]) => {
  const box: Pt[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  const edges = (ps: readonly Pt[]) => ps.map((p, i) => [p, ps[(i + 1) % ps.length] as Pt] as const);
  return (
    poly.some((p) => distanceToPolygon(box, p) === 0) ||
    box.some((c) => distanceToPolygon(poly, c) === 0) ||
    edges(poly).some(([p, q]) => edges(box).some(([c, d]) => segmentsCross(p, q, c, d)))
  );
};

/**
 * A label's place: on its preferred side, or, with a ▲/▼ badge at `badge` (its offset from the variable's
 * centre) on that side, on another side (below, above, right, left) clear of the badge: moved, it must not cover
 * something else instead, so the first that also meets none of `marks` (the arrowheads arriving at the variable)
 * and none of `glyphs` (the other variables on show), else the one meeting fewest of them (the first, between
 * equals); with no side clear of the badge, the preferred one.
 */
export function clearLabelPlace(
  n: GraphNode,
  k: number,
  badge?: Pt,
  marks: readonly Pt[][] = [],
  glyphs: ReadonlyArray<{ x: number; y: number; r: number }> = [],
): LabelPlace {
  const preferred = labelPlace(n, k);
  if (!badge) return preferred;
  const at = { x: n.x + badge.x, y: n.y + badge.y };
  const offBadge = (place: LabelPlace) => !meets(labelBox(place), at, BADGE_R + 2);
  if (offBadge(preferred)) return preferred;
  const covered = (place: LabelPlace) => {
    const box = labelBox(place);
    return marks.filter((m) => meetsPolygon(box, m)).length + glyphs.filter((g) => meets(box, g, g.r)).length;
  };
  let best: LabelPlace | undefined;
  let fewest = Number.POSITIVE_INFINITY;
  for (const side of ['below', 'above', 'right', 'left'] as Side[]) {
    if (side === n.labelSide) continue;
    const place = labelPlace(n, k, side);
    if (!offBadge(place)) continue;
    const count = covered(place);
    if (count < fewest) {
      best = place;
      fewest = count;
    }
    if (count === 0) break;
  }
  return best ?? preferred;
}
