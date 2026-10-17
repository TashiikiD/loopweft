// Source: PolycrisisPresentation src/map/cycles.ts (countCycles) and tools/loops.ts (the statistics)
// @ 539bc8e (private), adapted for Loopweft: signs may be unknown (?), loops can be listed as well as
// counted, and counting can be capped or stopped early.
//
// Simple-cycle (feedback loop) enumeration for a map's directed graph: Johnson's algorithm, so each loop is
// found exactly once. Deterministic: variables are visited in code-unit order of their ids, links in the
// order the project lists them.
import type { Link, Loop, Project, Sign } from './schema.ts';
import { compareStrings } from './text/ids.ts';

export interface CycleEdge {
  id: string;
  source: string;
  target: string;
  sign: Sign;
}

/** R reinforcing (an even number of − links), B balancing (odd), ? unknown (a link of unknown sign). */
export type Polarity = 'R' | 'B' | '?';

export interface LoopStats {
  /** Distinct simple cycles found (at most `limit`). */
  count: number;
  reinforcing: number;
  balancing: number;
  /** Loops through a link whose sign is unknown: their polarity is unknown too. */
  unknown: number;
  /** Loops by number of links. */
  byLength: Record<number, number>;
  /** True when counting stopped early (at the limit, or when asked to stop); counts are then lower bounds. */
  capped: boolean;
}

export interface CycleOptions {
  /** Count only loops of at most this many links. */
  maxLength?: number;
  /** Stop after this many loops. */
  limit?: number;
  /**
   * Asked now and then whether to stop, e.g. by a worker enforcing a time limit. Stopping makes the result
   * `capped`. Without it, the result depends only on the links.
   */
  shouldStop?: () => boolean;
  /** Called with each loop's link ids, in order around the loop. */
  onLoop?: (links: string[], polarity: Polarity) => void;
}

/** Map-wide counts stop here unless told otherwise: about four seconds of counting on a laptop. */
export const DEFAULT_LOOP_LIMIT = 10_000_000;

/**
 * Counts simple cycles in a multigraph of signed links. Parallel links between the same pair count as
 * different loops. `maxLength` bounds the loop length; `limit` and `shouldStop` stop early (counts become
 * lower bounds).
 */
export function countCycles(edges: readonly CycleEdge[], options: CycleOptions = {}): LoopStats {
  const maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const { shouldStop, onLoop } = options;
  const ids = [...new Set(edges.flatMap((e) => [e.source, e.target]))].sort(compareStrings);
  const index = new Map(ids.map((id, i) => [id, i]));
  const out: { to: number; neg: boolean; unknown: boolean; id: string }[][] = ids.map(() => []);
  for (const e of edges) {
    out[index.get(e.source) as number]?.push({
      to: index.get(e.target) as number,
      neg: e.sign === '-',
      unknown: e.sign === '?',
      id: e.id,
    });
  }

  const stats: LoopStats = {
    count: 0,
    reinforcing: 0,
    balancing: 0,
    unknown: 0,
    byLength: {},
    capped: false,
  };
  const n = ids.length;
  const blocked = new Array<boolean>(n).fill(false);
  const blockMap: Set<number>[] = ids.map(() => new Set());
  const path: string[] = [];
  let visits = 0;

  const unblock = (u: number) => {
    const stack = [u];
    while (stack.length) {
      const w = stack.pop() as number;
      if (!blocked[w]) continue;
      blocked[w] = false;
      for (const x of blockMap[w] as Set<number>) stack.push(x);
      blockMap[w]?.clear();
    }
  };

  // Recursive circuit search restricted to vertices >= s (Johnson 1975). With a length bound the blocking
  // shortcut is unsafe, so bounded runs skip it.
  const bounded = Number.isFinite(maxLength);
  const circuit = (v: number, s: number, depth: number, negs: number, unknowns: number): boolean => {
    if (stats.capped) return true;
    if (shouldStop && (++visits & 1023) === 0 && shouldStop()) {
      stats.capped = true;
      return true;
    }
    let found = false;
    blocked[v] = true;
    for (const { to: w, neg, unknown, id } of out[v] as (typeof out)[number]) {
      if (w < s) continue;
      const nn = negs + (neg ? 1 : 0);
      const nu = unknowns + (unknown ? 1 : 0);
      if (onLoop) path.push(id);
      if (w === s) {
        const len = depth + 1;
        stats.count++;
        stats.byLength[len] = (stats.byLength[len] ?? 0) + 1;
        const polarity: Polarity = nu > 0 ? '?' : nn % 2 === 0 ? 'R' : 'B';
        if (polarity === 'R') stats.reinforcing++;
        else if (polarity === 'B') stats.balancing++;
        else stats.unknown++;
        onLoop?.([...path], polarity);
        found = true;
        if (stats.count >= limit) {
          stats.capped = true;
          return true;
        }
      } else if (!blocked[w] && depth + 1 < maxLength) {
        if (circuit(w, s, depth + 1, nn, nu)) found = true;
      }
      if (onLoop) path.pop();
      if (stats.capped) return true;
    }
    if (found || bounded) unblock(v);
    else for (const { to: w } of out[v] as (typeof out)[number]) if (w >= s) blockMap[w]?.add(v);
    return found;
  };

  for (let s = 0; s < n && !stats.capped; s++) {
    for (let i = s; i < n; i++) {
      blocked[i] = false;
      blockMap[i]?.clear();
    }
    circuit(s, s, 0, 0, 0);
  }
  return stats;
}

export interface ProjectLoopOptions extends CycleOptions {
  /** Include links of optional types (e.g. documented side-effects). Default: left out, as in the map's structure. */
  includeOptional?: boolean;
  /** Count only the links that pass, e.g. those whose evidence is explicit. */
  filter?: (link: Link) => boolean;
}

/** The project's links as signed graph edges, optional types left out unless asked for. */
export function cycleEdges(project: Project, options: ProjectLoopOptions = {}): CycleEdge[] {
  const optional = new Set(project.types.linkTypes.filter((t) => t.optional).map((t) => t.id));
  return project.links
    .filter((l) => options.includeOptional || l.type === undefined || !optional.has(l.type))
    .filter((l) => !options.filter || options.filter(l))
    .map(({ id, from, to, sign }) => ({ id, source: from, target: to, sign }));
}

/** Counts the project's feedback loops (at most DEFAULT_LOOP_LIMIT unless `limit` says otherwise). */
export function loopStats(project: Project, options: ProjectLoopOptions = {}): LoopStats {
  return countCycles(cycleEdges(project, options), { limit: DEFAULT_LOOP_LIMIT, ...options });
}

export interface FoundLoop {
  /** Link ids in order around the loop. */
  links: string[];
  polarity: Polarity;
}

/** Lists the project's feedback loops, for a loop browser; `limit` (default 1,000) keeps it small. */
export function findLoops(
  project: Project,
  options: ProjectLoopOptions = {},
): { loops: FoundLoop[]; stats: LoopStats } {
  const loops: FoundLoop[] = [];
  const stats = countCycles(cycleEdges(project, options), {
    limit: 1000,
    ...options,
    onLoop: (links, polarity) => {
      loops.push({ links, polarity });
      options.onLoop?.(links, polarity);
    },
  });
  return { loops, stats };
}

/** A named loop's polarity, from the signs of its links; null when a link is missing. */
export function loopPolarity(project: Project, loop: Loop): Polarity | null {
  const signs = new Map(project.links.map((l) => [l.id, l.sign]));
  let negatives = 0;
  for (const id of loop.links) {
    const sign = signs.get(id);
    if (sign === undefined) return null;
    if (sign === '?') return '?';
    if (sign === '-') negatives++;
  }
  return negatives % 2 === 0 ? 'R' : 'B';
}
