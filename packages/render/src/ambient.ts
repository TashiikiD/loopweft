// Source: PolycrisisPresentation src/map/map-view.ts (startAmbient) @ 539bc8e (private), the walk itself
// taken out of the view so it can be tested: responses come from the project's roles.
//
// While a step is held, soft pulses wander the visible links. Walks stay true to the link signs: a harm walk
// follows "+" links (an increase spreading); a relief walk is a decrease spreading along "+" links, and one
// that starts at a response first leaves it through a "-" link.
import type { MapState } from '@loopweft/model';
import type { Graph, GraphEdge } from './graph.ts';
import { type ResolvedMap, rank } from './resolve.ts';

export type AmbientSpec = NonNullable<MapState['ambient']>;

/** A small seeded generator (Park–Miller), so the wandering differs from one showing to the next. */
export function seededRandom(seed: number): () => number {
  let s = Math.abs(Math.trunc(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export interface AmbientWalker {
  /** False when no start variable is visible with a visible link out: then there are no walks. */
  ready: boolean;
  /** The links of the next walk (empty when the start found no way on); null when not ready. */
  walk(): string[] | null;
  /** Seconds until the next walk. */
  gap(): number;
}

/** Plans walks over the visible map. */
export function ambientWalker(
  graph: Graph,
  resolved: ResolvedMap,
  spec: AmbientSpec,
  random: () => number,
): AmbientWalker {
  const visible = (level: Parameters<typeof rank>[0]) => rank(level) > rank('hidden');
  const out = new Map<string, GraphEdge[]>();
  for (const e of graph.edges.values()) {
    if (!visible(resolved.edgeLevel.get(e.id))) continue;
    out.set(e.source.id, [...(out.get(e.source.id) ?? []), e]);
  }
  const starts = spec.from.filter(
    (id) => visible(resolved.nodeLevel.get(id)) && (out.get(id)?.length ?? 0) > 0,
  );
  const between = ([lo, hi]: [number, number]) => lo + random() * (hi - lo);

  return {
    ready: starts.length > 0,
    walk() {
      if (starts.length === 0) return null;
      const start = starts[Math.floor(random() * starts.length)] as string;
      const want = Math.round(between(spec.hops ?? [2, 4]));
      const seen = new Set([start]);
      const path: string[] = [];
      let at = start;
      while (path.length < want) {
        const leavingResponse =
          spec.tone === 'relief' && path.length === 0 && graph.nodes.get(start)?.response === true;
        const sign = leavingResponse ? '-' : '+';
        const options = (out.get(at) ?? []).filter((e) => e.sign === sign && !seen.has(e.target.id));
        if (options.length === 0) break;
        const e = options[Math.floor(random() * options.length)] as GraphEdge;
        path.push(e.id);
        seen.add(e.target.id);
        at = e.target.id;
      }
      return path;
    },
    gap() {
      return between(spec.every ?? [1.6, 3]);
    },
  };
}
