// Two readings of a map's structure: the paths from one variable to another, and the most-connected
// variables. Like loops and ripples, they read only the links and their signs: no amounts, rates or timing.
// Both are deterministic: links are taken in the order the project lists them, and nothing reads a clock;
// the path search stops at a count and a step budget, never at a time.
import { OpError, resolveVariable } from './ops/support.ts';
import type { Link, Project, Sign } from './schema.ts';

export interface PathOptions {
  /** Only paths of at most this many links. Default: no limit but the map's size. */
  maxLength?: number;
  /** List at most this many paths, shortest first. Default 100. */
  limit?: number;
  /** Count at most this many paths; past it the count is "at least". Default 100,000. */
  countLimit?: number;
  /** Follow links of optional types too. Default: left out, as in the loop counts. */
  includeOptional?: boolean;
}

export const DEFAULT_PATH_LIMIT = 100;
export const DEFAULT_PATH_COUNT_LIMIT = 100_000;

/** How many steps of the search it may take before it stops and reports an incomplete count. */
const STEP_BUDGET = 20_000_000;

export interface FoundPath {
  /** The links in order, from the start to the end. */
  links: string[];
  /** The variables along it, start and end included. */
  variables: string[];
  /** `+`: a change at the start pushes the end the same way; `-`: the opposite way; `?`: a link's sign is unknown. */
  sign: Sign;
}

export interface PathResult {
  from: string;
  to: string;
  /** The paths listed, shortest first, then in the order of the project's links. */
  paths: FoundPath[];
  /** How many paths were counted (all of them when `complete`). */
  count: number;
  /** False when the count or the step budget stopped the search: `count` is then a lower bound. */
  complete: boolean;
  /** Paths counted by sign. */
  signs: Record<Sign, number>;
  /** The fewest links on any path, or null when there is none. */
  shortest: number | null;
  /** The longest path the search looked for. */
  maxLength: number;
  /** Links of optional types the search left out. */
  optionalLeftOut: string[];
}

/** The sign along a chain of links: unknown if any is, else + for an even number of − links. */
export function pathSign(links: readonly Link[]): Sign {
  if (links.some((l) => l.sign === '?')) return '?';
  return links.filter((l) => l.sign === '-').length % 2 === 0 ? '+' : '-';
}

/**
 * Every path from one variable to another along the links' directions, visiting no variable twice, found
 * shortest first (by iterative deepening, so the first paths listed are the shortest there are).
 */
export function findPaths(project: Project, from: string, to: string, options: PathOptions = {}): PathResult {
  const start = resolveVariable(project, from).variable.id;
  const end = resolveVariable(project, to).variable.id;
  if (start === end) {
    throw new OpError(
      `A path needs two different variables; the paths from ${start} back to itself are its loops.`,
      'usage',
    );
  }
  const limit = options.limit ?? DEFAULT_PATH_LIMIT;
  const countLimit = options.countLimit ?? DEFAULT_PATH_COUNT_LIMIT;
  for (const [name, value] of [
    ['limit', limit],
    ['countLimit', countLimit],
    ['maxLength', options.maxLength ?? 1],
  ] as const) {
    if (!Number.isInteger(value) || value < (name === 'limit' ? 0 : 1)) {
      throw new OpError(
        `${name} must be a whole number${name === 'limit' ? '' : ', 1 or more'}, not ${value}.`,
        'usage',
      );
    }
  }
  const optional = new Set(project.types.linkTypes.filter((t) => t.optional).map((t) => t.id));
  const isOptional = (l: Link) => l.type !== undefined && optional.has(l.type);
  const used = project.links.filter((l) => options.includeOptional || !isOptional(l));
  const optionalLeftOut = options.includeOptional ? [] : project.links.filter(isOptional).map((l) => l.id);

  const outOf = new Map<string, Link[]>();
  const into = new Map<string, Link[]>();
  for (const l of used) {
    if (l.from === l.to) continue;
    outOf.set(l.from, [...(outOf.get(l.from) ?? []), l]);
    into.set(l.to, [...(into.get(l.to) ?? []), l]);
  }
  // How far each variable is from the end: a path through it needs at least that many more links.
  const distance = new Map<string, number>([[end, 0]]);
  for (let frontier = [end]; frontier.length; ) {
    const next: string[] = [];
    for (const v of frontier) {
      for (const l of into.get(v) ?? []) {
        if (!distance.has(l.from)) {
          distance.set(l.from, (distance.get(v) as number) + 1);
          next.push(l.from);
        }
      }
    }
    frontier = next;
  }

  const maxLength = Math.min(options.maxLength ?? project.variables.length - 1, project.variables.length - 1);
  const paths: FoundPath[] = [];
  const signs: Record<Sign, number> = { '+': 0, '-': 0, '?': 0 };
  let count = 0;
  let steps = 0;
  let stopped = false;
  const shortest = distance.get(start) ?? null;

  const onPath = new Set<string>([start]);
  const chain: Link[] = [];
  /** Extends the chain from `at` by exactly `left` more links to the end. */
  const walk = (at: string, left: number): void => {
    for (const l of outOf.get(at) ?? []) {
      if (stopped) return;
      if (++steps > STEP_BUDGET) {
        stopped = true;
        return;
      }
      const next = l.to;
      if (onPath.has(next)) continue;
      if (left === 1) {
        if (next !== end) continue;
        chain.push(l);
        const sign = pathSign(chain);
        signs[sign]++;
        count++;
        if (paths.length < limit) {
          paths.push({ links: chain.map((c) => c.id), variables: [start, ...chain.map((c) => c.to)], sign });
        }
        chain.pop();
        if (count >= countLimit) stopped = true;
        continue;
      }
      if (next === end) continue;
      const d = distance.get(next);
      if (d === undefined || d > left - 1) continue;
      onPath.add(next);
      chain.push(l);
      walk(next, left - 1);
      chain.pop();
      onPath.delete(next);
    }
  };
  if (shortest !== null) {
    for (let length = shortest; length <= maxLength && !stopped; length++) walk(start, length);
  }
  return {
    from: start,
    to: end,
    paths,
    count,
    complete: !stopped,
    signs,
    shortest,
    maxLength,
    optionalLeftOut,
  };
}

// ----- the most-connected variables -----

/** Said wherever the most-connected variables are shown. */
export const CONNECTED_CAVEAT =
  'Connected does not mean leverage. A variable with many links is not, for that reason, a good place to intervene: how much a change there matters depends on what a count of links cannot show, such as how strong each influence is, its delays, which loops dominate, and what can actually be changed.';

export interface Connection {
  id: string;
  label: string;
  /** Links into it. */
  in: number;
  /** Links out of it. */
  out: number;
  /** in + out. */
  links: number;
  /** Other variables it links to or from. */
  neighbours: number;
  /** Named loops that pass through it. */
  namedLoops: number;
}

export interface ConnectednessResult {
  /** Every variable, most links first; ties by neighbours, then in the project's order. */
  variables: Connection[];
  /** Links of optional types left out of the counts. */
  optionalLeftOut: string[];
}

export function connectedness(
  project: Project,
  options: { includeOptional?: boolean } = {},
): ConnectednessResult {
  const optional = new Set(project.types.linkTypes.filter((t) => t.optional).map((t) => t.id));
  const isOptional = (l: Link) => l.type !== undefined && optional.has(l.type);
  const used = project.links.filter((l) => options.includeOptional || !isOptional(l));
  const linkById = new Map(project.links.map((l) => [l.id, l]));
  const rows = project.variables.map((v, order) => {
    const ins = used.filter((l) => l.to === v.id);
    const outs = used.filter((l) => l.from === v.id);
    const neighbours = new Set([...ins.map((l) => l.from), ...outs.map((l) => l.to)]);
    neighbours.delete(v.id);
    const namedLoops = project.loops.filter((lp) =>
      lp.links.some((id) => {
        const l = linkById.get(id);
        return l !== undefined && (l.from === v.id || l.to === v.id);
      }),
    ).length;
    return {
      order,
      row: {
        id: v.id,
        label: v.label,
        in: ins.length,
        out: outs.length,
        links: ins.length + outs.length - outs.filter((l) => l.to === v.id).length,
        neighbours: neighbours.size,
        namedLoops,
      },
    };
  });
  rows.sort((a, b) => b.row.links - a.row.links || b.row.neighbours - a.row.neighbours || a.order - b.order);
  return {
    variables: rows.map((r) => r.row),
    optionalLeftOut: options.includeOptional ? [] : project.links.filter(isOptional).map((l) => l.id),
  };
}
