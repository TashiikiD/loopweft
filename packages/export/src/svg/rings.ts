// A radial gradient as rings of flat see-through colour, for the drawing "For PowerPoint and Word": their
// Convert to Shape turns a radial gradient into a solid disc, but keeps flat shapes and their opacity (tested in
// PowerPoint and Word, 2026-10-23). Each ring covers every ring inside it, so a band's colour is all the rings
// over it laid on each other; each ring's opacity is solved from the outside in so that this matches the
// gradient in the middle of its band.
import type { Colour, Stop } from './css.ts';

/** The most rings a gradient becomes: fewer show as steps, more are more shapes to edit. */
export const RINGS = 10;

/**
 * About how much opacity each ring adds, at most: a fainter glow gets fewer rings. A browser keeps a colour's
 * opacity in 256 steps, each ring laid on the others rounding the colour by up to a step, one way on one
 * computer and the other way on another (with or without a graphics card); ten rings of a glow at 7% came out
 * ten steps too dark on one and too bright on another. With rings of about 4% at most, a glow's few rings round
 * by a few steps, and each band differs from the gradient by about as little.
 */
export const RING_STEP = 0.04;

export interface Ring {
  /** Its radius, as a fraction of the gradient's (1 is where the gradient's last stop lies at offset 1). */
  r: number;
  hex: string;
  /** The ring's own opacity (fill-opacity), at most four decimals. */
  opacity: number;
}

export interface Rings {
  /** Outermost first, in painting order; rings that would draw nothing are left out. */
  rings: Ring[];
  /** How many bands the gradient is cut into (the rings, before those drawing nothing are left out). */
  bands: number;
  /** False if the rings cannot match the gradient: its colour changes, or it grows more opaque outwards. */
  exact: boolean;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** A transparent stop takes the colour of its nearest coloured neighbour (as CSS mixes), then stops in order. */
function normalize(stops: Stop[]): Stop[] {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  return sorted.map((stop, k) => {
    if (stop.colour.alpha > 0) return stop;
    const near =
      sorted.slice(k + 1).find((n) => n.colour.alpha > 0) ??
      [...sorted.slice(0, k)].reverse().find((n) => n.colour.alpha > 0);
    return near ? { offset: stop.offset, colour: { hex: near.colour.hex, alpha: 0 } } : stop;
  });
}

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The gradient's colour at `t` (a fraction of its radius), padded past its ends. */
export function colourAt(stops: Stop[], t: number): Colour {
  const first = stops[0] as Stop;
  const last = stops[stops.length - 1] as Stop;
  if (t <= first.offset) return first.colour;
  if (t >= last.offset) return last.colour;
  const k = stops.findIndex((s) => s.offset >= t);
  const b = stops[k] as Stop;
  const a = stops[k - 1] as Stop;
  const f = b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 1;
  const [ca, cb] = [channels(a.colour.hex), channels(b.colour.hex)];
  return {
    hex: a.colour.hex === b.colour.hex ? a.colour.hex : toHex(ca.map((v, i) => v + ((cb[i] ?? 0) - v) * f)),
    alpha: a.colour.alpha + (b.colour.alpha - a.colour.alpha) * f,
  };
}

/**
 * Where the gradient has faded out for good: the offset after which every stop is transparent, or null if it
 * never fades out (its last colour then fills everything beyond).
 */
export function fadeEnd(stops: Stop[]): number | null {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (!sorted.length || (sorted[sorted.length - 1] as Stop).colour.alpha > 0) return null;
  let end = (sorted[sorted.length - 1] as Stop).offset;
  for (let k = sorted.length - 1; k >= 0 && (sorted[k] as Stop).colour.alpha === 0; k--)
    end = (sorted[k] as Stop).offset;
  return end;
}

/**
 * The rings for a radial gradient's stops, out to `extent` (a fraction of its radius: where the shape ends or
 * the gradient fades out), each band's opacity times `opacity` (the shape's own fill-opacity), in `count` bands
 * (by default as many as its strongest opacity needs at RING_STEP each, from 1 to RINGS).
 */
export function gradientRings(stops: Stop[], extent: number, opacity = 1, count?: number): Rings {
  const sorted = normalize(stops);
  const strongest = Math.min(1, Math.max(0, ...sorted.map((s) => s.colour.alpha)) * opacity);
  const bands = count ?? Math.max(1, Math.min(RINGS, Math.round(strongest / RING_STEP)));
  let exact = sorted.every((s) => s.colour.alpha === 0 || s.colour.hex === sorted[0]?.colour.hex);
  const rings: Ring[] = [];
  let below = 0; // the opacity of the rings drawn so far, laid on each other
  for (let k = 0; k < bands; k++) {
    const outer = (extent * (bands - k)) / bands;
    const middle = (extent * (bands - k - 0.5)) / bands;
    const want = Math.min(1, Math.max(0, colourAt(sorted, middle).alpha * opacity));
    let own = below >= 1 ? 0 : (want - below) / (1 - below);
    if (own < -0.002) exact = false;
    own = round4(Math.min(1, Math.max(0, own)));
    below = below + own * (1 - below);
    if (own > 0) rings.push({ r: outer, hex: colourAt(sorted, middle).hex, opacity: own });
  }
  return { rings, bands, exact };
}

/** The opacity the rings give at `t` (a fraction of the gradient's radius): all those that reach it, laid on each other. */
export function ringsOpacityAt(rings: Ring[], t: number): number {
  return rings.filter((ring) => ring.r >= t).reduce((below, ring) => below + ring.opacity * (1 - below), 0);
}

/** A point, as [x, y]. */
export type Pt = [number, number];

/**
 * What an opaque shape over a glow covers, about the glow's centre: a circle of radius `r`, or a convex polygon
 * (a variable's glyph). Rings are cut where it lies, so that in a faded group, where each carries the group's
 * opacity, no ring shows through it.
 */
export type Cover = { r: number } | { points: Pt[] };

/** The largest circle about the centre inside a cover. */
export function coverInradius(cover: Cover): number {
  if ('r' in cover) return cover.r;
  const pts = cover.points;
  return Math.min(
    ...pts.map(([x1, y1], k) => {
      const [x2, y2] = pts[(k + 1) % pts.length] as Pt;
      const length = Math.hypot(x2 - x1, y2 - y1);
      return length > 0 ? Math.abs(x1 * y2 - x2 * y1) / length : Math.hypot(x1, y1);
    }),
  );
}

/**
 * The part of a convex polygon inside a circle of radius `r` about the centre, as a polygon: the circle taken as
 * a polygon of `sides` sides inside it (Sutherland–Hodgman), so the part is a hair smaller than the true one.
 */
export function clipToCircle(points: Pt[], r: number, sides = 64): Pt[] {
  if (points.every(([x, y]) => Math.hypot(x, y) <= r)) return points;
  let out = points;
  for (let k = 0; k < sides && out.length > 0; k++) {
    const a = (2 * Math.PI * k) / sides;
    const b = (2 * Math.PI * (k + 1)) / sides;
    const p: Pt = [r * Math.cos(a), r * Math.sin(a)];
    const q: Pt = [r * Math.cos(b), r * Math.sin(b)];
    // Inside: on the centre's side of the chord p → q.
    const side = ([x, y]: Pt) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const inside = (pt: Pt) => side(pt) >= 0;
    const next: Pt[] = [];
    for (let i = 0; i < out.length; i++) {
      const c = out[i] as Pt;
      const d = out[(i + 1) % out.length] as Pt;
      const cross = (): Pt => {
        const t = side(c) / (side(c) - side(d));
        return [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t];
      };
      if (inside(c)) {
        next.push(c);
        if (!inside(d)) next.push(cross());
      } else if (inside(d)) next.push(cross());
    }
    out = next;
  }
  return out;
}
