// A radial gradient as rings of flat see-through colour, for the drawing "For PowerPoint and Word": their
// Convert to Shape turns a radial gradient into a solid disc, but keeps flat shapes and their opacity (tested in
// PowerPoint and Word, 2026-10-23). Each ring covers every ring inside it, so a band's colour is all the rings
// over it laid on each other; each ring's opacity is solved from the outside in so that this matches the
// gradient in the middle of its band.
import type { Colour, Stop } from './css.ts';

/** How many rings a gradient becomes: fewer show as steps, more are more shapes to edit. */
export const RINGS = 10;

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
 * the gradient fades out), each band's opacity times `opacity` (the shape's own fill-opacity).
 */
export function gradientRings(stops: Stop[], extent: number, opacity = 1, count = RINGS): Rings {
  const sorted = normalize(stops);
  let exact = sorted.every((s) => s.colour.alpha === 0 || s.colour.hex === sorted[0]?.colour.hex);
  const rings: Ring[] = [];
  let below = 0; // the opacity of the rings drawn so far, laid on each other
  for (let k = 0; k < count; k++) {
    const outer = (extent * (count - k)) / count;
    const middle = (extent * (count - k - 0.5)) / count;
    const want = Math.min(1, Math.max(0, colourAt(sorted, middle).alpha * opacity));
    let own = below >= 1 ? 0 : (want - below) / (1 - below);
    if (own < -0.002) exact = false;
    own = round4(Math.min(1, Math.max(0, own)));
    below = below + own * (1 - below);
    if (own > 0) rings.push({ r: outer, hex: colourAt(sorted, middle).hex, opacity: own });
  }
  return { rings, exact };
}

/** The opacity the rings give at `t` (a fraction of the gradient's radius): all those that reach it, laid on each other. */
export function ringsOpacityAt(rings: Ring[], t: number): number {
  return rings.filter((ring) => ring.r >= t).reduce((below, ring) => below + ring.opacity * (1 - below), 0);
}
