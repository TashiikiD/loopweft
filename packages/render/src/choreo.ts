// Source: PolycrisisPresentation src/map/choreo.ts @ 539bc8e (private), adapted for Loopweft: named loops and
// responses come from the project instead of the deck's content.
//
// Timing for one forward step of the map: which newly lit links trace in and when, when new variables and
// loop badges arrive, and when pulses leave and land. Pure (no DOM), so the choreography can be tested and
// checked in Node.
import type { MapState, Trend } from '@loopweft/model';
import type { Graph } from './graph.ts';
import type { NamedLoop } from './loops.ts';
import { type ResolvedMap, rank } from './resolve.ts';

/** Seconds for one link to trace itself from source to target. */
export const DRAW = 0.7;
/** Seconds for a pulse to travel one link. */
export const TRAVEL = 0.95;
/** Pause between one hop landing and the next leaving. */
export const HOP_GAP = 0.12;
/** Above this many new links a step fades instead of tracing (it would read as noise). */
export const MAX_DRAWS = 48;

const LIT = rank('focus');
const SEEN = rank('dim');

export type Tone = 'harm' | 'relief' | 'mixed';

export interface PulseBeat {
  edge: string;
  at: number;
  tone: Tone;
}

export interface Schedule {
  /** Newly lit links that trace in, with their start times. */
  draws: Map<string, number>;
  /** Links that fade in ring by ring (bloom), with start times. */
  fades: Map<string, number>;
  /** When each newly visible variable arrives. */
  nodeAt: Map<string, number>;
  /** When each trend badge appears (pulse targets: on arrival). */
  trendAt: Map<string, number>;
  /** When each newly shown loop badge pops in. */
  loopAt: Map<string, number>;
  pulses: PulseBeat[];
  /** When everything has landed, in seconds. */
  duration: number;
}

const toneOf = (trend: Trend | undefined): Tone | undefined =>
  trend === 'up' ? 'harm' : trend === 'down' ? 'relief' : trend === 'mixed' ? 'mixed' : undefined;

/**
 * Plans a smooth forward step from `prev` to `next`. Links that become lit trace in outward from what was
 * already lit (or in an explicit sequence); pulses follow once the new links are in place.
 */
export function schedule(
  graph: Graph,
  loops: ReadonlyMap<string, NamedLoop>,
  prev: ResolvedMap | null,
  next: ResolvedMap,
  state: MapState | undefined,
): Schedule {
  const reveal = state?.reveal ?? {};
  const delay = reveal.delay ?? 0.35;
  const draws = new Map<string, number>();
  const fades = new Map<string, number>();
  const nodeAt = new Map<string, number>();
  const trendAt = new Map<string, number>();
  const loopAt = new Map<string, number>();
  const before = prev?.show ? prev : null;

  const prevEdge = (id: string) => (before ? rank(before.edgeLevel.get(id)) : -1);
  const prevNode = (id: string) => (before ? rank(before.nodeLevel.get(id)) : -1);
  const edge = (id: string) => graph.edges.get(id);

  // Links that become lit on this step.
  const entering = [...next.edgeLevel]
    .filter(([id, l]) => rank(l) >= LIT && prevEdge(id) < LIT)
    .map(([id]) => id);
  const traced = next.show && entering.length <= MAX_DRAWS ? entering : [];

  if (reveal.sequence?.length) {
    const step = reveal.stagger ?? 1;
    const tracedSet = new Set(traced);
    reveal.sequence.forEach((item, i) => {
      const at = delay + i * step;
      if (graph.edges.has(item) && tracedSet.has(item)) draws.set(item, at);
      else if (graph.nodes.has(item)) nodeAt.set(item, at);
    });
    // Anything lit but not named in the sequence arrives with the last beat.
    const last = delay + Math.max(0, reveal.sequence.length - 1) * step;
    for (const id of traced) if (!draws.has(id)) draws.set(id, last);
  } else if (traced.length > 0) {
    const step = reveal.stagger ?? 0.32;
    const touches = (nodes: Set<string>) =>
      traced.some((id) => {
        const e = edge(id);
        return !!e && (nodes.has(e.source.id) || nodes.has(e.target.id));
      });
    let seeds = new Set(
      reveal.from ??
        (before ? [...before.nodeLevel].filter(([, l]) => rank(l) >= LIT).map(([id]) => id) : []),
    );
    if (!touches(seeds)) {
      const targets = new Set(traced.map((id) => edge(id)?.target.id));
      seeds = new Set(
        traced.flatMap((id) => {
          const source = edge(id)?.source.id;
          return source && !targets.has(source) ? [source] : [];
        }),
      );
    }
    if (!touches(seeds)) seeds = new Set([edge(traced[0] as string)?.source.id ?? '']);
    // Rings outward through the new links, ignoring direction: a link that points into the lit set still
    // arrives early, drawn source to target.
    let ring = 0;
    let frontier = seeds;
    const left = new Set(traced);
    while (left.size > 0) {
      const now = [...left].filter((id) => {
        const e = edge(id);
        return !!e && (frontier.has(e.source.id) || frontier.has(e.target.id));
      });
      if (now.length === 0) {
        // A separate island: start it from its own first link.
        frontier = new Set([edge([...left][0] as string)?.source.id ?? '']);
        continue;
      }
      const nextFrontier = new Set<string>();
      for (const id of now) {
        const e = edge(id) as NonNullable<ReturnType<typeof edge>>;
        draws.set(id, delay + ring * step);
        left.delete(id);
        nextFrontier.add(e.source.id);
        nextFrontier.add(e.target.id);
      }
      frontier = nextFrontier;
      ring++;
    }
  }

  // Bloom: everything newly visible fades in, ring by ring from the seeds.
  if (reveal.mode === 'bloom' && next.show) {
    const step = reveal.stagger ?? 0.3;
    const from = new Set(reveal.from ?? []);
    const dist = new Map<string, number>([...from].map((id) => [id, 0]));
    const queue = [...from];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const d = dist.get(id) as number;
      for (const e of [...(graph.outgoing.get(id) ?? []), ...(graph.incoming.get(id) ?? [])]) {
        const other = e.source.id === id ? e.target.id : e.source.id;
        if (!dist.has(other)) {
          dist.set(other, d + 1);
          queue.push(other);
        }
      }
    }
    const far = Math.max(0, ...dist.values()) + 1;
    for (const [id, l] of next.nodeLevel) {
      if (rank(l) >= SEEN && prevNode(id) < SEEN && !nodeAt.has(id))
        nodeAt.set(id, delay + (dist.get(id) ?? far) * step);
    }
    for (const [id, l] of next.edgeLevel) {
      if (rank(l) <= 0 || draws.has(id) || prevEdge(id) > 0) continue;
      const e = edge(id);
      if (!e) continue;
      const d = Math.max(dist.get(e.source.id) ?? far, dist.get(e.target.id) ?? far);
      fades.set(id, delay + d * step + step * 0.5);
    }
  }

  // A variable that appears or brightens does so as the first link reaches it.
  for (const [id, at] of draws) {
    const e = edge(id);
    if (!e) continue;
    for (const [node, when] of [
      [e.source.id, at],
      [e.target.id, at + DRAW * 0.75],
    ] as const) {
      const level = rank(next.nodeLevel.get(node));
      if (level <= prevNode(node) || level < SEEN) continue;
      const known = nodeAt.get(node);
      if (known === undefined || known > when) nodeAt.set(node, when);
    }
  }

  const drawEnd = Math.max(0, ...[...draws.values()].map((t) => t + DRAW));

  // Pulses leave once the new links are in place.
  const pulses: PulseBeat[] = [];
  const spec = state?.pulses;
  if (spec && spec.hops.length > 0 && next.show) {
    const start = spec.delay ?? (draws.size > 0 ? drawEnd + 0.15 : delay + 0.2);
    const passes = 1 + (spec.repeat ?? 0);
    const hopTime = TRAVEL + HOP_GAP;
    for (let p = 0; p < passes; p++) {
      spec.hops.forEach((hop, h) => {
        const at = start + (p * spec.hops.length + h) * hopTime;
        for (const id of hop) {
          const e = edge(id);
          if (!e) continue;
          const tone =
            spec.tone ??
            toneOf(next.trends[e.target.id]) ??
            (e.target.response ? 'relief' : undefined) ??
            toneOf(next.trends[e.source.id]) ??
            'harm';
          pulses.push({ edge: id, at, tone });
          // A target's direction shows when the first pulse lands on it.
          const land = at + TRAVEL;
          const landed = trendAt.get(e.target.id);
          if (next.trends[e.target.id] && (landed === undefined || landed > land))
            trendAt.set(e.target.id, land);
          if (next.trends[e.source.id] && !trendAt.has(e.source.id)) trendAt.set(e.source.id, at);
        }
      });
    }
  }

  // Other trend badges come in with their variable, or right away.
  for (const id of Object.keys(next.trends)) {
    if (trendAt.has(id)) continue;
    const arrives = nodeAt.get(id);
    trendAt.set(id, arrives !== undefined ? arrives + 0.3 : delay);
  }

  // A newly shown loop badge pops in once its loop is fully drawn.
  const prevLoops = new Set(before ? before.loops : []);
  for (const id of next.loops) {
    if (prevLoops.has(id)) continue;
    const ends = (loops.get(id)?.links ?? []).flatMap((e) => {
      const at = draws.get(e);
      return at === undefined ? [] : [at + DRAW];
    });
    loopAt.set(id, ends.length > 0 ? Math.max(...ends) + 0.05 : delay + 0.15);
  }

  const duration = Math.max(
    drawEnd,
    ...[...fades.values()].map((t) => t + 0.6),
    ...[...nodeAt.values()].map((t) => t + 0.6),
    ...pulses.map((p) => p.at + TRAVEL + 0.6),
    ...[...loopAt.values()].map((t) => t + 0.7),
  );
  return { draws, fades, nodeAt, trendAt, loopAt, pulses, duration };
}
