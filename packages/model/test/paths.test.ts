import { describe, expect, it } from 'vitest';
import {
  CONNECTED_CAVEAT,
  connectedness,
  createProject,
  findPaths,
  OpError,
  type Project,
  pathSign,
  readProject,
} from '../src/index.ts';
import { repoFile, richProject } from './helpers.ts';

function example(): Project {
  const read = readProject(repoFile('examples/polycrisis.loopweft'));
  if (!read.ok) throw new Error('the example does not read');
  return read.project;
}

/** A small map from pairs, "a>b+": the links get ids L1, L2, … in order. */
function map(spec: string): Project {
  const project = createProject({ title: 'Paths' });
  const names = new Set<string>();
  spec
    .split(/\s+/)
    .filter(Boolean)
    .forEach((pair, i) => {
      const m = /^(\w+)>(\w+)([+?-])$/.exec(pair);
      if (!m) throw new Error(pair);
      const [, from, to, sign] = m as unknown as [string, string, string, '+' | '-' | '?'];
      for (const n of [from, to]) {
        if (!names.has(n)) project.variables.push({ id: n, label: n.toUpperCase(), citations: [] });
        names.add(n);
      }
      project.links.push({ id: `L${i + 1}`, from, to, sign, citations: [] });
    });
  return project;
}

/** Every simple path, by brute force, as "L1 L2" strings. */
function bruteForce(project: Project, from: string, to: string): string[] {
  const out: string[] = [];
  const go = (at: string, seen: Set<string>, chain: string[]) => {
    for (const l of project.links) {
      if (l.from !== at || seen.has(l.to) || l.from === l.to) continue;
      if (l.to === to) out.push([...chain, l.id].join(' '));
      else go(l.to, new Set([...seen, l.to]), [...chain, l.id]);
    }
  };
  go(from, new Set([from]), []);
  return out;
}

describe('paths between two variables', () => {
  it('finds each path once, shortest first, with its sign', () => {
    const project = map('a>b+ b>c- a>c+ c>d+ b>d- d>a+ c>b+');
    const result = findPaths(project, 'a', 'D');
    expect(result.paths.map((p) => `${p.links.join(' ')} ${p.sign}`)).toEqual([
      'L1 L5 -',
      'L3 L4 +',
      'L1 L2 L4 -',
      'L3 L7 L5 -',
    ]);
    expect(result.paths[2]?.variables).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toMatchObject({
      from: 'a',
      to: 'd',
      count: 4,
      complete: true,
      shortest: 2,
      signs: { '+': 1, '-': 3, '?': 0 },
    });
  });

  it('agrees with a brute-force search on generated maps', () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 40; round++) {
      const n = 4 + Math.floor(next() * 5);
      const pairs: string[] = [];
      for (let i = 0; i < n * 2; i++) {
        const a = Math.floor(next() * n);
        const b = Math.floor(next() * n);
        pairs.push(`v${a}>v${b}${next() < 0.5 ? '+' : '-'}`);
      }
      const project = map(pairs.join(' '));
      const [from, to] = [project.variables[0]?.id as string, project.variables.at(-1)?.id as string];
      if (from === to) continue;
      const expected = bruteForce(project, from, to);
      const found = findPaths(project, from, to, { limit: 10_000 });
      expect(found.paths.map((p) => p.links.join(' ')).sort()).toEqual([...expected].sort());
      const lengths = found.paths.map((p) => p.links.length);
      expect(lengths).toEqual([...lengths].sort((x, y) => x - y));
      expect(found.count).toBe(expected.length);
    }
  });

  it('leaves out optional links unless asked, and says which', () => {
    const result = findPaths(richProject(), 'deaths', 'births');
    expect(result.paths.map((p) => `${p.links.join(' ')} ${p.sign}`)).toEqual(['L4 L2 -']);
    expect(result.optionalLeftOut).toEqual(['L5']);
    const all = findPaths(richProject(), 'deaths', 'births', { includeOptional: true });
    expect(all.paths.map((p) => `${p.links.join(' ')} ${p.sign}`)).toEqual(['L5 ?', 'L4 L2 -']);
    expect(all.signs).toEqual({ '+': 0, '-': 1, '?': 1 });
  });

  it('says when there is no path, and refuses the same variable twice', () => {
    const none = findPaths(map('a>b+ c>a+'), 'a', 'c');
    expect(none).toMatchObject({ paths: [], count: 0, complete: true, shortest: null });
    expect(() => findPaths(richProject(), 'births', 'Births')).toThrow(OpError);
  });

  it('stops at the count limit and the length asked for, and is the same every time', () => {
    const project = example();
    const counted = findPaths(project, 'climate_heating', 'trust_erosion', { limit: 3, countLimit: 500 });
    expect(counted).toMatchObject({ count: 500, complete: false, shortest: 4 });
    expect(counted.paths.map((p) => p.variables.join(' > '))).toEqual([
      'climate_heating > ecosystem_degradation > economic_insecurity > polarization > trust_erosion',
      'climate_heating > outbreak_risk > economic_insecurity > polarization > trust_erosion',
      'climate_heating > fossil_dependence > geopolitical_conflict > misinformation > trust_erosion',
    ]);
    expect(findPaths(project, 'climate_heating', 'trust_erosion', { limit: 3, countLimit: 500 })).toEqual(
      counted,
    );
    const short = findPaths(project, 'climate_heating', 'trust_erosion', { maxLength: 4 });
    expect(short).toMatchObject({
      count: 3,
      complete: true,
      maxLength: 4,
      signs: { '+': 3, '-': 0, '?': 0 },
    });
  });

  it('reads a chain of signs as the product of its signs', () => {
    const link = (sign: '+' | '-' | '?') => ({ id: 'x', from: 'a', to: 'b', sign, citations: [] });
    expect(pathSign([link('+'), link('-'), link('-')])).toBe('+');
    expect(pathSign([link('-'), link('+')])).toBe('-');
    expect(pathSign([link('-'), link('?')])).toBe('?');
  });
});

describe('the most-connected variables', () => {
  it('counts links in and out, neighbours and named loops, most links first', () => {
    const result = connectedness(richProject());
    expect(result.variables).toEqual([
      { id: 'population', label: 'Population', in: 2, out: 2, links: 4, neighbours: 2, namedLoops: 2 },
      { id: 'births', label: 'Births', in: 1, out: 1, links: 2, neighbours: 1, namedLoops: 1 },
      { id: 'deaths', label: 'Deaths', in: 1, out: 1, links: 2, neighbours: 1, namedLoops: 1 },
    ]);
    expect(result.optionalLeftOut).toEqual(['L5']);
    const all = connectedness(richProject(), { includeOptional: true });
    expect(all.variables.map((v) => `${v.id} ${v.links}`)).toEqual(['population 4', 'births 3', 'deaths 3']);
  });

  it('ranks the example with its hub first, and carries the caveat', () => {
    const top = connectedness(example()).variables.slice(0, 2);
    expect(top.map((v) => `${v.id} ${v.in}+${v.out}`)).toEqual([
      'economic_insecurity 10+6',
      'geopolitical_conflict 3+9',
    ]);
    expect(CONNECTED_CAVEAT).toMatch(/^Connected does not mean leverage\./);
  });
});
