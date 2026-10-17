// Source: DataViz packages/module-cld/src/engine/route-diagnostics.ts @ efcdbe2 (TashiikiD/DataViz, private),
// itself ported from cld-generator engine/cldRouteDiagnostics.ts @ 6e477a3; copied for Loopweft.
import { type Box, type Point, segmentHitsBox } from './route-geometry.ts';

/** SVG units. Shared length is pairwise (three coincident links count three pairs). */
export const ROUTE_TOLERANCES = {
  corridor: 4,
  angleSine: 0.035,
  minimumShared: 8,
  endpoint: 16,
  crossingMerge: 1,
};
export type DiagnosticRoute = { id: string; fromId: string; toId: string; points: Point[] };
export type OwnedAnnotation = Box & { ownerId?: string };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const minus = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });

export const routeLength = (points: Point[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + dist(points[i] as Point, p), 0);

/** Length of segment r–s projected onto p–q, if r–s lies within the corridor around p–q. */
function corridorOverlap(p: Point, q: Point, r: Point, s: Point): number {
  const len = dist(p, q);
  const ux = (q.x - p.x) / len;
  const uy = (q.y - p.y) / len;
  const prx = r.x - p.x;
  const pry = r.y - p.y;
  const psx = s.x - p.x;
  const psy = s.y - p.y;
  if (Math.max(Math.abs(ux * pry - uy * prx), Math.abs(ux * psy - uy * psx)) > ROUTE_TOLERANCES.corridor)
    return 0;
  const x = prx * ux + pry * uy;
  const y = psx * ux + psy * uy;
  return Math.max(0, Math.min(len, Math.max(x, y)) - Math.max(0, Math.min(x, y)));
}

/** Symmetric near-collinear overlap; ignores short contacts, including port stubs. */
export function sharedSegmentLength(a: Point, b: Point, c: Point, d: Point): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (!lu || !lv || Math.abs(ux * vy - uy * vx) / (lu * lv) > ROUTE_TOLERANCES.angleSine) return 0;
  const length = Math.min(corridorOverlap(a, b, c, d), corridorOverlap(c, d, a, b));
  return length >= ROUTE_TOLERANCES.minimumShared ? length : 0;
}

export function crossingPoint(a: Point, b: Point, c: Point, d: Point): Point | null {
  const u = minus(b, a);
  const v = minus(d, c);
  const denominator = cross(u, v);
  if (Math.abs(denominator) < 1e-8) return null;
  const ac = minus(c, a);
  const t = cross(ac, v) / denominator;
  const s = cross(ac, u) / denominator;
  if (t < -1e-8 || t > 1 + 1e-8 || s < -1e-8 || s > 1 + 1e-8) return null;
  return { x: a.x + t * u.x, y: a.y + t * u.y };
}

export interface LinkRouteDiagnostics {
  id: string;
  length: number;
  crossings: number;
  sharedLength: number;
  annotationIntersections: number;
  crossingLinkIds: string[];
  sharedLinkIds: string[];
}

export interface RouteDiagnostics {
  tolerances: typeof ROUTE_TOLERANCES;
  crossings: number;
  sharedLength: number;
  annotationIntersections: number;
  length: number;
  perLink: LinkRouteDiagnostics[];
}

export function measureRoutes(
  routes: DiagnosticRoute[],
  annotations: OwnedAnnotation[] = [],
): RouteDiagnostics {
  const perLink: LinkRouteDiagnostics[] = routes.map((route) => ({
    id: route.id,
    length: routeLength(route.points),
    crossings: 0,
    sharedLength: 0,
    annotationIntersections: 0,
    crossingLinkIds: [],
    sharedLinkIds: [],
  }));
  let crossings = 0;
  let sharedLength = 0;
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i] as DiagnosticRoute;
      const b = routes[j] as DiagnosticRoute;
      const hits: Point[] = [];
      const endpoints: Point[] = [];
      for (const [aid, ap] of [
        [a.fromId, a.points[0]],
        [a.toId, a.points.at(-1)],
      ] as const) {
        for (const [bid, bp] of [
          [b.fromId, b.points[0]],
          [b.toId, b.points.at(-1)],
        ] as const) {
          if (aid === bid) endpoints.push(ap as Point, bp as Point);
        }
      }
      let shared = 0;
      for (let m = 1; m < a.points.length; m++) {
        for (let n = 1; n < b.points.length; n++) {
          const [a0, a1, b0, b1] = [a.points[m - 1], a.points[m], b.points[n - 1], b.points[n]] as Point[];
          shared += sharedSegmentLength(a0 as Point, a1 as Point, b0 as Point, b1 as Point);
          const hit = crossingPoint(a0 as Point, a1 as Point, b0 as Point, b1 as Point);
          if (
            hit &&
            !endpoints.some((p) => dist(p, hit) <= ROUTE_TOLERANCES.endpoint) &&
            !hits.some((p) => dist(p, hit) < ROUTE_TOLERANCES.crossingMerge)
          ) {
            hits.push(hit);
          }
        }
      }
      for (const [at, other] of [
        [i, j],
        [j, i],
      ] as const) {
        const entry = perLink[at] as LinkRouteDiagnostics;
        entry.crossings += hits.length;
        entry.sharedLength += shared;
        if (hits.length) entry.crossingLinkIds.push((routes[other] as DiagnosticRoute).id);
        if (shared) entry.sharedLinkIds.push((routes[other] as DiagnosticRoute).id);
      }
      crossings += hits.length;
      sharedLength += shared;
    }
  }
  routes.forEach((route, i) => {
    (perLink[i] as LinkRouteDiagnostics).annotationIntersections = annotations.filter(
      (box) =>
        box.ownerId !== route.id &&
        route.points.slice(1).some((p, n) => segmentHitsBox(route.points[n] as Point, p, box)),
    ).length;
  });
  return {
    tolerances: ROUTE_TOLERANCES,
    crossings,
    sharedLength,
    annotationIntersections: perLink.reduce((sum, r) => sum + r.annotationIntersections, 0),
    length: perLink.reduce((sum, r) => sum + r.length, 0),
    perLink,
  };
}
