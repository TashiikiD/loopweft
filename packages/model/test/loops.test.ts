// Partly from PolycrisisPresentation tests/map.test.ts @ 539bc8e (private): the loop-counting tests and
// the brute-force cross-check, adapted to Loopweft's signs (which may be unknown).
import { describe, expect, it } from 'vitest';
import { type CycleEdge, countCycles, findLoops, loopPolarity, loopStats, type Sign } from '../src/index.ts';
import { richProject } from './helpers.ts';

const e = (id: string, source: string, target: string, sign: Sign = '+'): CycleEdge => ({
  id,
  source,
  target,
  sign,
});

/** Brute force, for checking Johnson's algorithm: every simple path that closes, counted once from its least node. */
function bruteCycles(edges: CycleEdge[], maxLength = Number.POSITIVE_INFINITY) {
  const ids = [...new Set(edges.flatMap((x) => [x.source, x.target]))].sort();
  const out = new Map(ids.map((id) => [id, edges.filter((x) => x.source === id)]));
  let count = 0;
  let reinforcing = 0;
  let unknown = 0;
  for (const s of ids) {
    const walk = (v: string, depth: number, negs: number, unknowns: number, seen: Set<string>) => {
      for (const x of out.get(v) ?? []) {
        const n = negs + (x.sign === '-' ? 1 : 0);
        const u = unknowns + (x.sign === '?' ? 1 : 0);
        if (x.target === s) {
          count++;
          if (u > 0) unknown++;
          else if (n % 2 === 0) reinforcing++;
        } else if (x.target > s && !seen.has(x.target) && depth < maxLength) {
          seen.add(x.target);
          walk(x.target, depth + 1, n, u, seen);
          seen.delete(x.target);
        }
      }
    };
    walk(s, 1, 0, 0, new Set([s]));
  }
  return { count, reinforcing, unknown };
}

/** Small signed random graphs from a seeded generator (Park–Miller), so the test is the same every run. */
function randomGraphs(howMany: number, seed = 7): CycleEdge[][] {
  let state = seed;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const graphs: CycleEdge[][] = [];
  for (let g = 0; g < howMany; g++) {
    const n = 5 + Math.floor(rand() * 6);
    const edges: CycleEdge[] = [];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b || rand() >= 0.35) continue;
        const r = rand();
        edges.push(e(`${a}-${b}`, `n${a}`, `n${b}`, r < 0.25 ? '-' : r < 0.32 ? '?' : '+'));
      }
    }
    graphs.push(edges);
  }
  return graphs;
}

describe('countCycles', () => {
  it('finds each loop once and reads its sign', () => {
    // a ⇄ b, plus a triangle a → b → c → a with one negative link.
    const s = countCycles([e('1', 'a', 'b'), e('2', 'b', 'a'), e('3', 'b', 'c'), e('4', 'c', 'a', '-')]);
    expect(s).toEqual({
      count: 2,
      reinforcing: 1,
      balancing: 1,
      unknown: 0,
      byLength: { 2: 1, 3: 1 },
      capped: false,
    });
    // Parallel links are different loops; a length bound drops longer ones.
    expect(countCycles([e('1', 'a', 'b'), e('2', 'a', 'b', '-'), e('3', 'b', 'a')]).count).toBe(2);
    expect(
      countCycles([e('1', 'a', 'b'), e('2', 'b', 'a'), e('3', 'b', 'c'), e('4', 'c', 'a')], { maxLength: 2 })
        .count,
    ).toBe(1);
  });

  it('gives a loop through a link of unknown sign an unknown polarity', () => {
    const s = countCycles([e('1', 'a', 'b', '?'), e('2', 'b', 'a', '-'), e('3', 'b', 'c'), e('4', 'c', 'b')]);
    expect(s).toMatchObject({ count: 2, reinforcing: 1, balancing: 0, unknown: 1 });
  });

  it('counts a link from a variable to itself as a loop of one link', () => {
    expect(countCycles([e('1', 'a', 'a', '-')])).toMatchObject({
      count: 1,
      balancing: 1,
      byLength: { 1: 1 },
    });
  });

  it('agrees with brute force on random graphs, with and without a length bound', () => {
    for (const [g, edges] of randomGraphs(25).entries()) {
      const fast = countCycles(edges);
      const slow = bruteCycles(edges);
      expect([fast.count, fast.reinforcing, fast.unknown], `graph ${g}`).toEqual([
        slow.count,
        slow.reinforcing,
        slow.unknown,
      ]);
      const short = countCycles(edges, { maxLength: 4 });
      expect(short.count, `graph ${g}, up to 4 links`).toBe(bruteCycles(edges, 4).count);
    }
  });

  /** Every ordered pair of five variables linked: 10 + 20 + 30 + 24 = 84 loops. */
  const complete = (): CycleEdge[] =>
    ['a', 'b', 'c', 'd', 'e'].flatMap((x) =>
      ['a', 'b', 'c', 'd', 'e'].filter((y) => y !== x).map((y) => e(`${x}${y}`, x, y)),
    );

  it('stops at a limit, and says the counts are then lower bounds', () => {
    expect(countCycles(complete())).toMatchObject({
      count: 84,
      byLength: { 2: 10, 3: 20, 4: 30, 5: 24 },
      capped: false,
    });
    expect(countCycles(complete(), { limit: 5 })).toMatchObject({ count: 5, capped: true });
  });

  it('stops when asked to, e.g. by a time limit kept outside', () => {
    // A ring of 12 variables with every chord: enough work that the question is asked.
    const ids = Array.from({ length: 12 }, (_, i) => `v${String(i).padStart(2, '0')}`);
    const edges = ids.flatMap((x) => ids.filter((y) => y !== x).map((y) => e(`${x}${y}`, x, y)));
    let asked = 0;
    const stats = countCycles(edges, {
      shouldStop: () => {
        asked++;
        return true;
      },
    });
    expect(asked).toBe(1);
    expect(stats.capped).toBe(true);
    expect(stats.count).toBeGreaterThan(0);
  });

  it('lists each loop with its links in order', () => {
    const found: string[] = [];
    countCycles([e('1', 'a', 'b'), e('2', 'b', 'a'), e('3', 'b', 'c'), e('4', 'c', 'a', '-')], {
      onLoop: (links, polarity) => found.push(`${polarity} ${links.join(' ')}`),
    });
    expect(found).toEqual(['R 1 2', 'B 1 3 4']);
  });

  it('gives the same result whatever order the links come in', () => {
    const edges = randomGraphs(1, 3)[0] as CycleEdge[];
    expect(countCycles([...edges].reverse())).toEqual(countCycles(edges));
  });
});

describe('loops in a project', () => {
  it('leaves links of an optional type out of the counts unless asked', () => {
    const project = richProject();
    // L1 ⇄ L2 (R), L3 ⇄ L4 (B), and the optional side-effect L5 (?) closes deaths → births → population → deaths.
    expect(loopStats(project)).toMatchObject({ count: 2, reinforcing: 1, balancing: 1, unknown: 0 });
    expect(loopStats(project, { includeOptional: true })).toMatchObject({ count: 3, unknown: 1 });
    expect(loopStats(project, { filter: (l) => l.fields?.evidence === 'explicit' }).count).toBe(0);
  });

  it('lists loops for a loop browser', () => {
    const { loops, stats } = findLoops(richProject());
    // Each loop starts from its variable with the smallest id: births, then deaths.
    expect(loops).toEqual([
      { links: ['L1', 'L2'], polarity: 'R' },
      { links: ['L4', 'L3'], polarity: 'B' },
    ]);
    expect(stats.capped).toBe(false);
    expect(findLoops(richProject(), { limit: 1 }).loops).toHaveLength(1);
  });

  it("works out a named loop's polarity from its signs", () => {
    const project = richProject();
    expect(project.loops.map((l) => loopPolarity(project, l))).toEqual(['R', 'B']);
    expect(loopPolarity(project, { id: 'X', name: 'x', links: ['L5', 'L2', 'L3'], citations: [] })).toBe('?');
    expect(loopPolarity(project, { id: 'X', name: 'x', links: ['L9'], citations: [] })).toBeNull();
  });
});
