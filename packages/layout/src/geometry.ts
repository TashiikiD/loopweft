// Source: PolycrisisPresentation src/map/geometry.ts @ 539bc8e (private), adapted for Loopweft: a link of
// unknown sign (?) ends in an arrowhead, like +.
//
// Pure geometry for the map: curved directed edges trimmed to node rims,
// with "+" arrowheads and "−" bar ends. No DOM, so it is unit-testable.

export interface Pt {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  /** Path data for the visible line (start rim → arrowhead base). */
  d: string;
  /** Path data for the end marker: a triangle (+) or a bar (−). */
  head: string;
  /** Point halfway along the visible line, for callouts. */
  mid: Pt;
  /** Approximate visible line length in world units. */
  length: number;
  /** The visible segment as a quadratic Bézier, for pulse travel. */
  p0: Pt;
  c: Pt;
  p1: Pt;
}

export const EDGE_GAP = 4;
export const HEAD_LEN = 10;
export const HEAD_HALF_WIDTH = 5;
export const BAR_HALF_WIDTH = 7;
export const BAR_THICKNESS = 2.8;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt): number => Math.hypot(a.x, a.y);
const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtPt = (p: Pt) => `${r2(p.x)} ${r2(p.y)}`;

/** Point on a quadratic Bézier. */
export function quad(p0: Pt, c: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  };
}

/** Control points of the [t0, t1] piece of a quadratic Bézier (blossoming). */
export function quadSegment(p0: Pt, c: Pt, p2: Pt, t0: number, t1: number): [Pt, Pt, Pt] {
  const blossom = (a: number, b: number): Pt => ({
    x: (1 - a) * (1 - b) * p0.x + ((1 - a) * b + a * (1 - b)) * c.x + a * b * p2.x,
    y: (1 - a) * (1 - b) * p0.y + ((1 - a) * b + a * (1 - b)) * c.y + a * b * p2.y,
  });
  return [blossom(t0, t0), blossom(t0, t1), blossom(t1, t1)];
}

/**
 * The t where the curve crosses a circle of radius `dist` around `centre`.
 * `near` is the parameter at the centre's end of the curve, `far` the other
 * end; distance grows monotonically from near to far around a node.
 */
function tAtDistance(p0: Pt, c: Pt, p2: Pt, centre: Pt, dist: number, near: number, far: number): number {
  let inside = near;
  let outside = far;
  for (let i = 0; i < 40; i++) {
    const mid = (inside + outside) / 2;
    if (len(sub(quad(p0, c, p2, mid), centre)) < dist) inside = mid;
    else outside = mid;
  }
  return (inside + outside) / 2;
}

export function quadLength(p0: Pt, c: Pt, p2: Pt, samples = 24): number {
  let total = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const pt = quad(p0, c, p2, i / samples);
    total += len(sub(pt, prev));
    prev = pt;
  }
  return total;
}

/**
 * A directed edge from node a (radius ra) to node b (radius rb). `bend` bows
 * the curve to the right of its direction of travel, so A→B and B→A form
 * two distinct arcs instead of overlapping.
 */
export function edgeGeometry(
  a: Pt,
  ra: number,
  b: Pt,
  rb: number,
  bend: number,
  polarity: '+' | '-' | '?',
): EdgeGeometry {
  const chord = sub(b, a);
  const n = unit({ x: -chord.y, y: chord.x });
  return curveGeometry(a, ra, b, rb, add(mul(add(a, b), 0.5), mul(n, bend * len(chord))), polarity);
}

/** A directed quadratic curve from node a to node b through control point c, trimmed to the rims. */
export function curveGeometry(
  a: Pt,
  ra: number,
  b: Pt,
  rb: number,
  c: Pt,
  polarity: '+' | '-' | '?',
): EdgeGeometry {
  const tStart = tAtDistance(a, c, b, a, ra + EDGE_GAP, 0, 1);
  const tTip = tAtDistance(a, c, b, b, rb + EDGE_GAP, 1, 0);
  const tip = quad(a, c, b, tTip);
  const backoff = polarity === '-' ? BAR_THICKNESS / 2 : HEAD_LEN;
  const tBase = tAtDistance(a, c, b, b, rb + EDGE_GAP + backoff, 1, 0);

  const [p0, cc, p1] = quadSegment(a, c, b, Math.min(tStart, tBase), tBase);
  const dir = unit(sub(tip, quad(a, c, b, Math.max(0, tTip - 0.04))));
  const perp = { x: -dir.y, y: dir.x };

  let head: string;
  if (polarity !== '-') {
    const base = sub(tip, mul(dir, HEAD_LEN));
    const l = add(base, mul(perp, HEAD_HALF_WIDTH));
    const r = sub(base, mul(perp, HEAD_HALF_WIDTH));
    head = `M${fmtPt(tip)}L${fmtPt(l)}L${fmtPt(r)}Z`;
  } else {
    const centre = sub(tip, mul(dir, BAR_THICKNESS / 2));
    const h = BAR_THICKNESS / 2;
    const corners = [
      add(add(centre, mul(perp, BAR_HALF_WIDTH)), mul(dir, h)),
      sub(add(centre, mul(dir, h)), mul(perp, BAR_HALF_WIDTH)),
      sub(sub(centre, mul(dir, h)), mul(perp, BAR_HALF_WIDTH)),
      add(sub(centre, mul(dir, h)), mul(perp, BAR_HALF_WIDTH)),
    ];
    head = `M${corners.map(fmtPt).join('L')}Z`;
  }

  return {
    d: `M${fmtPt(p0)}Q${fmtPt(cc)} ${fmtPt(p1)}`,
    head,
    mid: quad(p0, cc, p1, 0.5),
    length: quadLength(p0, cc, p1),
    p0,
    c: cc,
    p1,
  };
}

/** Do two straight segments cross (excluding shared endpoints)? Used by the layout tools. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
