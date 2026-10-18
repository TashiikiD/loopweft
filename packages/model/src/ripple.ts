// Source: PolycrisisPresentation src/scenes/helpers.ts (ripple, trendsAlong) @ 539bc8e (private), adapted
// for Loopweft: the deck's ripple spread a change breadth first along chosen links and carried ▲/▼ by sign;
// here it follows every link of the map, says where opposing pushes meet, and stops where the signs no
// longer tell which way a variable moves.
//
// A what-if ripple: if one variable rises (or falls), which way are the variables it affects pushed, link by
// link? A + link carries the change the same way, a − link the opposite way. Qualitative only: it tells
// directions, never amounts or timing. It stops at a link of unknown sign (?), and at a variable where
// opposing pushes arrive at the same step (± mixed), since the signs alone cannot tell which wins. Links of
// optional types are left out unless asked for, as in the loop counts. Deterministic: variables are taken in
// the order they are reached, links in the order the project lists them.
import { OpError, resolveVariable } from './ops/support.ts';
import type { Link, Project, Trend } from './schema.ts';
import { compareStrings } from './text/ids.ts';

export type RippleDirection = 'up' | 'down';

export interface RippleOptions {
  /** Follow links of optional types too. Default: left out. */
  includeOptional?: boolean;
  /** Stop after this many links from the start. */
  maxSteps?: number;
}

export interface RippleReach {
  variable: string;
  /** The way it is pushed when the change first arrives; mixed: opposing pushes arrive together. */
  trend: Trend;
  /** Links from the start along the shortest way there. */
  step: number;
  /** The links that bring the change at that step. */
  via: string[];
  /** Links that push it the other way at a later step (round a loop, or by a longer way). */
  against: string[];
}

export interface RippleResult {
  start: string;
  direction: RippleDirection;
  /** The variables the change reaches, by step, then by id. */
  reached: RippleReach[];
  /** The links that carry the change, step by step (each leaves a variable the step before reached). */
  hops: string[][];
  /** Links that bring the change back to the start: the same way (reinforcing) or the other way. */
  feedback: { link: string; trend: RippleDirection; step: number }[];
  /** Links of unknown sign out of a variable the change reached: the ripple does not cross them. */
  unknownLinks: string[];
  /** Links of optional types out of a variable the change reached, left out. */
  optionalLinks: string[];
  /**
   * True when it stopped at `maxSteps` with more to tell: a variable to reach, feedback to the start, or a
   * push the other way.
   */
  capped: boolean;
}

const flip = (d: RippleDirection): RippleDirection => (d === 'up' ? 'down' : 'up');

/** Spreads a rise (`up`) or a fall (`down`) of one variable (by id or name) along the map's links. */
export function ripple(
  project: Project,
  start: string,
  direction: RippleDirection,
  options: RippleOptions = {},
): RippleResult {
  if (direction !== 'up' && direction !== 'down') {
    throw new OpError(
      `A ripple starts with a rise (up) or a fall (down), not "${String(direction)}".`,
      'usage',
    );
  }
  const origin = resolveVariable(project, start).variable.id;
  const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
  const optional = new Set(project.types.linkTypes.filter((t) => t.optional).map((t) => t.id));
  const outOf = new Map<string, Link[]>();
  for (const l of project.links) outOf.set(l.from, [...(outOf.get(l.from) ?? []), l]);
  const isLeftOut = (l: Link) => !options.includeOptional && l.type !== undefined && optional.has(l.type);
  const followed = (l: Link) => !isLeftOut(l) && l.sign !== '?';

  const trend = new Map<string, Trend>([[origin, direction]]);
  const step = new Map<string, number>([[origin, 0]]);
  const via = new Map<string, string[]>();
  const against = new Map<string, string[]>();
  const hops: string[][] = [];
  const feedback: RippleResult['feedback'] = [];
  const unknownLinks: string[] = [];
  const optionalLinks: string[] = [];
  let frontier = [origin];
  let capped = false;

  for (let k = 1; frontier.length; k++) {
    if (k > maxSteps) {
      // More to tell past the cap: a variable not yet reached, feedback to the start, or a push the other way.
      capped = frontier.some((v) =>
        (outOf.get(v) ?? []).some((l) => {
          if (!followed(l)) return false;
          if (l.to === origin || !step.has(l.to)) return true;
          const push =
            l.sign === '+' ? (trend.get(v) as RippleDirection) : flip(trend.get(v) as RippleDirection);
          return trend.get(l.to) !== 'mixed' && trend.get(l.to) !== push;
        }),
      );
      break;
    }
    const arrivals = new Map<string, { link: string; push: RippleDirection }[]>();
    const hop: string[] = [];
    for (const v of frontier) {
      const from = trend.get(v) as RippleDirection;
      for (const l of outOf.get(v) ?? []) {
        if (isLeftOut(l)) {
          optionalLinks.push(l.id);
          continue;
        }
        if (l.sign === '?') {
          unknownLinks.push(l.id);
          continue;
        }
        const push = l.sign === '+' ? from : flip(from);
        if (l.to === origin) {
          feedback.push({ link: l.id, trend: push, step: k });
          continue;
        }
        const seen = step.get(l.to);
        if (seen === undefined) {
          arrivals.set(l.to, [...(arrivals.get(l.to) ?? []), { link: l.id, push }]);
          hop.push(l.id);
        } else if (trend.get(l.to) !== 'mixed' && trend.get(l.to) !== push) {
          against.set(l.to, [...(against.get(l.to) ?? []), l.id]);
        }
      }
    }
    const next: string[] = [];
    for (const [id, pushes] of [...arrivals].sort(([a], [b]) => compareStrings(a, b))) {
      const ways = new Set(pushes.map((p) => p.push));
      const t: Trend = ways.size > 1 ? 'mixed' : (pushes[0] as { push: RippleDirection }).push;
      trend.set(id, t);
      step.set(id, k);
      via.set(
        id,
        pushes.map((p) => p.link),
      );
      // Where opposing pushes meet, the signs cannot tell which wins: the ripple goes no further.
      if (t !== 'mixed') next.push(id);
    }
    if (hop.length) hops.push(hop);
    frontier = next;
  }

  const reached: RippleReach[] = [...step]
    .filter(([id]) => id !== origin)
    .sort(([a, sa], [b, sb]) => sa - sb || compareStrings(a, b))
    .map(([id, s]) => ({
      variable: id,
      trend: trend.get(id) as Trend,
      step: s,
      via: via.get(id) ?? [],
      against: against.get(id) ?? [],
    }));
  const unique = (ids: string[]) => [...new Set(ids)];
  return {
    start: origin,
    direction,
    reached,
    hops,
    feedback,
    unknownLinks: unique(unknownLinks),
    optionalLinks: unique(optionalLinks),
    capped,
  };
}
