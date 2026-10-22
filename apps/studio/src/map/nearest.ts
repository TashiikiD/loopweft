// Which link a click on the map means. A link's click target is a band 14 pixels wide along its curve, wider
// than the line, so where links run close together their bands overlap and the band drawn last would take every
// click, even one right on another link's line. Instead, of the links whose bands are under the pointer, the
// click goes to the one whose curve passes nearest it.
import { quad } from '@loopweft/layout';

type Pt = { x: number; y: number };

/**
 * How much nearer another link's line must be to take a click from the link clicked: a seventh of the 14-pixel click
 * band, in the pixels the band is drawn in (the screen's on the Map canvas, the stage's on the Story stage).
 */
export const CLEARLY_NEARER = 2;
export type Curve = { p0: Pt; c: Pt; p1: Pt };

/** How far a point is from a quadratic curve, in the curve's own units. */
export function distanceToCurve(p: Pt, { p0, c, p1 }: Curve): number {
  const d = (t: number) => {
    const q = quad(p0, c, p1, t);
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  // Coarse samples, then the best one refined: a quadratic curve has no sharp turns to hide a closer point.
  const N = 32;
  let best = 0;
  for (let i = 1; i <= N; i++) if (d(i / N) < d(best / N)) best = i;
  let lo = Math.max(0, (best - 1) / N);
  let hi = Math.min(1, (best + 1) / N);
  for (let i = 0; i < 24; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (d(a) < d(b)) hi = b;
    else lo = a;
  }
  return d((lo + hi) / 2);
}

/** The links whose click targets (elements matching `selector`, carrying `data-edge`) are under the pointer. */
function linksUnder(doc: Document, clientX: number, clientY: number, selector: string): string[] {
  return [
    ...new Set(
      doc
        .elementsFromPoint(clientX, clientY)
        .filter((el) => el.matches(selector))
        .map((el) => el.closest('[data-edge]')?.getAttribute('data-edge'))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

/**
 * The link a click at (`clientX`, `clientY`) means: of the links whose click targets (`selector`) are under the
 * pointer, the one whose curve is nearest `at` (the pointer in map units). `fallback` is the link whose target
 * the browser found on top: it keeps the click unless another line is nearer by more than `margin` (map units),
 * so where lines cross, the click goes where it went before. `fallback` too where the browser cannot say what is
 * under the pointer. For selecting only: a click that changes the map uses `nearestOtherLink`, with no margin.
 */
export function nearestLink(
  doc: Document,
  clientX: number,
  clientY: number,
  selector: string,
  at: Pt,
  curves: (id: string) => Curve | undefined,
  fallback: string,
  margin = 0,
): string {
  if (typeof doc.elementsFromPoint !== 'function') return fallback;
  const own = curves(fallback);
  let best = fallback;
  let distance = own ? distanceToCurve(at, own) - margin : Number.POSITIVE_INFINITY;
  for (const id of linksUnder(doc, clientX, clientY, selector)) {
    if (id === fallback) continue;
    const curve = curves(id);
    if (!curve) continue;
    const here = distanceToCurve(at, curve);
    if (here < distance) {
      distance = here;
      best = id;
    }
  }
  return best;
}

/**
 * Of the links whose click targets (`selector`) are under the pointer, other than `except`, the one whose curve is
 * nearest `at` (map units), with how far it is; none is preferred. Null when there is no other.
 */
export function nearestOtherLink(
  doc: Document,
  clientX: number,
  clientY: number,
  selector: string,
  at: Pt,
  curves: (id: string) => Curve | undefined,
  except: string,
): { id: string; distance: number } | null {
  if (typeof doc.elementsFromPoint !== 'function') return null;
  let best: { id: string; distance: number } | null = null;
  for (const id of linksUnder(doc, clientX, clientY, selector)) {
    if (id === except) continue;
    const curve = curves(id);
    if (!curve) continue;
    const distance = distanceToCurve(at, curve);
    if (!best || distance < best.distance) best = { id, distance };
  }
  return best;
}

/**
 * True when a click at `at` on `head`'s arrowhead flips that link's sign: when the pointer is at least as near
 * the arrowhead (the link's end) as it is to the line of `rival`, the nearest other link under it (if any).
 */
export function arrowheadTakesClick(
  at: Pt,
  head: Curve | undefined,
  rival: { distance: number } | null,
): boolean {
  if (!head || !rival) return true;
  return Math.hypot(at.x - head.p1.x, at.y - head.p1.y) <= rival.distance;
}
