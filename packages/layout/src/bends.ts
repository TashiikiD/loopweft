// How much each link curves. The first pass is the deck's chooseBend (PolycrisisPresentation
// src/map/graph.ts @ 539bc8e, private): prefer the house bend, but swing wider or to the other side when that
// keeps the curve off other variables. The second pass follows DataViz's route refinement (DataViz
// packages/module-cld/src/engine/route-refinement.ts @ efcdbe2, private): measure crossings and shared
// corridors with the copied route diagnostics, and re-bend the worst few links when that is a clear
// improvement. Deterministic: the same map always gets the same bends.
import { compareStrings } from '@loopweft/model';
import { type Pt, quad } from './geometry.ts';
import { type DiagnosticRoute, measureRoutes, type RouteDiagnostics } from './route-diagnostics.ts';

export interface BendNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface BendLink {
  id: string;
  from: string;
  to: string;
}

export const DEFAULT_BEND = 0.12;
export const CANDIDATE_BENDS = [0.12, 0.18, 0.06, 0.24, 0.3, 0.36, -0.06, -0.12, -0.18, -0.24, -0.3];

/** Limits of the second pass, so it stays quick and only makes clear improvements. */
export const REFINEMENT_LIMITS = {
  /** Links reconsidered, worst first. */
  links: 5,
  /** A new bend may crowd other variables at most this much more than the first pass's choice. */
  crowdingSlack: 50,
  /** Segments per curve when measuring crossings. */
  samples: 12,
};

/** How badly a curve crowds the other nodes (0 = clear of all of them). */
function crowding(a: Pt, c: Pt, b: Pt, others: BendNode[]): number {
  let cost = 0;
  for (let i = 1; i < 20; i++) {
    const p = quad(a, c, b, i / 20);
    for (const n of others) {
      const clearance = n.r + 16;
      const d = Math.hypot(p.x - n.x, p.y - n.y);
      if (d < clearance) cost += (clearance - d) * (clearance - d);
    }
  }
  return cost;
}

/** The control point of a curve from a to b bowing to the right of its travel by `bend` × its length. */
export function controlPoint(a: Pt, b: Pt, bend: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: (a.x + b.x) / 2 + (-dy / l) * bend * l, y: (a.y + b.y) / 2 + (dx / l) * bend * l };
}

/** The deck's first pass for one link: the cheapest candidate, with the house bend preferred. */
export function chooseBend(s: BendNode, t: BendNode, others: BendNode[], twoWay: boolean): number {
  let best = DEFAULT_BEND;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const bend of CANDIDATE_BENDS) {
    // Two-way pairs (feedback loops) keep positive bends so they bow apart.
    if (twoWay && bend < 0.1) continue;
    const cost = crowding(s, controlPoint(s, t, bend), t, others) + 40 * Math.abs(bend - DEFAULT_BEND);
    if (cost < bestCost - 1e-6) {
      best = bend;
      bestCost = cost;
    }
  }
  return best;
}

export interface BendReport {
  before: RouteDiagnostics;
  after: RouteDiagnostics;
  /** Links the second pass re-bent. */
  changed: string[];
}

export interface BendOptions {
  /** Bends set by hand, by link id: kept as they are. */
  overrides?: Readonly<Record<string, number>>;
  /** Run the second pass. Default true. */
  refine?: boolean;
}

const route = (link: BendLink, s: Pt, t: Pt, bend: number, samples: number): DiagnosticRoute => {
  const c = controlPoint(s, t, bend);
  return {
    id: link.id,
    fromId: link.from,
    toId: link.to,
    points: Array.from({ length: samples + 1 }, (_, i) => quad(s, c, t, i / samples)),
  };
};

/** Crossings and shared length between one route and all the others. */
function against(routes: DiagnosticRoute[], index: number): { crossings: number; shared: number } {
  let crossings = 0;
  let shared = 0;
  const own = routes[index] as DiagnosticRoute;
  routes.forEach((other, j) => {
    if (j === index) return;
    const m = measureRoutes([own, other]);
    crossings += m.crossings;
    shared += m.sharedLength;
  });
  return { crossings, shared };
}

/** A bend for every link between placed variables. */
export function chooseBends(
  nodes: readonly BendNode[],
  links: readonly BendLink[],
  options: BendOptions = {},
): { bends: Map<string, number>; report: BendReport } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pairs = new Set(links.map((l) => `${l.from}>${l.to}`));
  const overrides = options.overrides ?? {};
  const placed = links.filter((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to);
  const twoWay = (l: BendLink) => pairs.has(`${l.to}>${l.from}`);
  const othersOf = (l: BendLink) => nodes.filter((n) => n.id !== l.from && n.id !== l.to);

  const bends = new Map<string, number>();
  for (const l of placed) {
    const fixed = overrides[l.id];
    bends.set(
      l.id,
      fixed ?? chooseBend(byId.get(l.from) as BendNode, byId.get(l.to) as BendNode, othersOf(l), twoWay(l)),
    );
  }

  const samples = REFINEMENT_LIMITS.samples;
  const routes = placed.map((l) =>
    route(l, byId.get(l.from) as BendNode, byId.get(l.to) as BendNode, bends.get(l.id) as number, samples),
  );
  const before = measureRoutes(routes);
  const changed: string[] = [];
  if (options.refine !== false) {
    const worst = before.perLink
      .filter((x) => (x.crossings || x.sharedLength) && overrides[x.id] === undefined)
      .sort(
        (a, b) => b.crossings - a.crossings || b.sharedLength - a.sharedLength || compareStrings(a.id, b.id),
      )
      .slice(0, REFINEMENT_LIMITS.links);
    for (const issue of worst) {
      const index = placed.findIndex((l) => l.id === issue.id);
      const link = placed[index] as BendLink;
      const s = byId.get(link.from) as BendNode;
      const t = byId.get(link.to) as BendNode;
      const others = othersOf(link);
      const first = bends.get(link.id) as number;
      const crowdLimit = crowding(s, controlPoint(s, t, first), t, others) + REFINEMENT_LIMITS.crowdingSlack;
      let best = against(routes, index);
      let bestBend = first;
      for (const bend of CANDIDATE_BENDS) {
        if (bend === first || (twoWay(link) && bend < 0.1)) continue;
        if (crowding(s, controlPoint(s, t, bend), t, others) > crowdLimit) continue;
        const previous = routes[index] as DiagnosticRoute;
        routes[index] = route(link, s, t, bend, samples);
        const m = against(routes, index);
        // A clear improvement only: trading crossings for shared corridors is not one.
        if (
          m.crossings <= best.crossings &&
          m.shared <= best.shared + 0.001 &&
          (m.crossings < best.crossings || m.shared < best.shared - 0.001)
        ) {
          best = m;
          bestBend = bend;
        } else routes[index] = previous;
      }
      if (bestBend !== first) {
        bends.set(link.id, bestBend);
        changed.push(link.id);
      }
    }
  }
  return { bends, report: { before, after: changed.length ? measureRoutes(routes) : before, changed } };
}
