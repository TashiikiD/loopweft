// The what-if ripple: a rise or fall carried along links by their signs, stopping at unknown signs and where
// opposing pushes meet, with feedback to the start and later pushes the other way named.
import { describe, expect, it } from 'vitest';
import { createProject, OpError, type Project, readProject, ripple, type Sign } from '../src/index.ts';
import { repoFile } from './helpers.ts';

function polycrisisExample(): Project {
  const read = readProject(repoFile('examples/polycrisis.loopweft'));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return read.project;
}

/** A map from `from>to:sign` specs: L1, L2… in order; variables named by id. */
function map(...specs: string[]): Project {
  const p = createProject({ title: 'Ripple test' });
  const ids = new Set<string>();
  p.links = specs.map((spec, i) => {
    const [ends, sign] = spec.split(':') as [string, Sign];
    const [from, to] = ends.split('>') as [string, string];
    ids.add(from);
    ids.add(to);
    return { id: `L${i + 1}`, from, to, sign, citations: [] };
  });
  p.variables = [...ids].map((id) => ({ id, label: id.toUpperCase(), citations: [] }));
  return p;
}

describe('a ripple', () => {
  it('carries a rise the same way along + links and the other way along − links', () => {
    const out = ripple(map('a>b:+', 'b>c:-', 'c>d:+'), 'A', 'up');
    expect(out.start).toBe('a');
    expect(out.reached.map((r) => `${r.variable}:${r.trend}@${r.step}`)).toEqual([
      'b:up@1',
      'c:down@2',
      'd:down@3',
    ]);
    expect(out.hops).toEqual([['L1'], ['L2'], ['L3']]);
    expect(ripple(map('a>b:+', 'b>c:-'), 'a', 'down').reached.map((r) => r.trend)).toEqual(['down', 'up']);
  });

  it('marks where opposing pushes arrive together, and goes no further from there', () => {
    const out = ripple(map('a>b:+', 'a>c:+', 'b>d:+', 'c>d:-', 'd>e:+'), 'a', 'up');
    expect(out.reached.find((r) => r.variable === 'd')).toEqual({
      variable: 'd',
      trend: 'mixed',
      step: 2,
      via: ['L3', 'L4'],
      against: [],
    });
    expect(out.reached.some((r) => r.variable === 'e')).toBe(false);
  });

  it('does not cross a link of unknown sign', () => {
    const out = ripple(map('a>b:?', 'a>c:+', 'c>d:?'), 'a', 'up');
    expect(out.reached.map((r) => r.variable)).toEqual(['c']);
    expect(out.unknownLinks).toEqual(['L1', 'L3']);
  });

  it('names the links that bring the change back to the start, and later pushes the other way', () => {
    const balancing = ripple(map('a>b:+', 'b>a:-'), 'a', 'up');
    expect(balancing.feedback).toEqual([{ link: 'L2', trend: 'down', step: 2 }]);
    const reinforcing = ripple(map('a>b:-', 'b>a:-'), 'a', 'up');
    expect(reinforcing.feedback).toEqual([{ link: 'L2', trend: 'up', step: 2 }]);

    // b rises at once; by the longer way through c it is pushed down a step later.
    const later = ripple(map('a>b:+', 'a>c:+', 'c>b:-'), 'a', 'up');
    expect(later.reached.find((r) => r.variable === 'b')).toMatchObject({
      trend: 'up',
      step: 1,
      against: ['L3'],
    });
  });

  it('leaves out links of optional types unless asked, and can stop after some steps', () => {
    const p = map('a>b:+', 'b>c:+', 'c>d:+');
    p.types.linkTypes = [{ id: 'side', name: 'Side-effect', optional: true }];
    (p.links[1] as Project['links'][number]).type = 'side';
    const without = ripple(p, 'a', 'up');
    expect(without.reached.map((r) => r.variable)).toEqual(['b']);
    expect(without.optionalLinks).toEqual(['L2']);
    expect(ripple(p, 'a', 'up', { includeOptional: true }).reached.map((r) => r.variable)).toEqual([
      'b',
      'c',
      'd',
    ]);
    const short = ripple(p, 'a', 'up', { includeOptional: true, maxSteps: 2 });
    expect(short.reached.map((r) => r.variable)).toEqual(['b', 'c']);
    expect(short.capped).toBe(true);
    expect(ripple(p, 'a', 'up', { includeOptional: true, maxSteps: 3 }).capped).toBe(false);
  });

  it('says it was capped when only feedback or a push the other way lies past the cap', () => {
    // A → B → A: past one step, only the feedback to A is left.
    const loop = map('a>b:+', 'b>a:-');
    expect(ripple(loop, 'a', 'up', { maxSteps: 1 })).toMatchObject({ feedback: [], capped: true });
    expect(ripple(loop, 'a', 'up').feedback).toEqual([{ link: 'L2', trend: 'down', step: 2 }]);
    expect(ripple(loop, 'a', 'up', { maxSteps: 2 }).capped).toBe(false);
    // A → B and A → C → B: past one step, only C's push the other way on B is left.
    const twoWays = map('a>b:+', 'a>c:+', 'c>b:-');
    expect(ripple(twoWays, 'a', 'up', { maxSteps: 1 }).capped).toBe(true);
    expect(ripple(twoWays, 'a', 'up').reached.find((r) => r.variable === 'b')?.against).toEqual(['L3']);
    // The same way again tells nothing new.
    expect(ripple(map('a>b:+', 'a>c:+', 'c>b:+'), 'a', 'up', { maxSteps: 1 }).capped).toBe(false);
  });

  it('refuses a variable that is not on the map, or a direction that is neither up nor down', () => {
    expect(() => ripple(map('a>b:+'), 'z', 'up')).toThrow(OpError);
    expect(() => ripple(map('a>b:+'), 'a', 'sideways' as never)).toThrow(/a rise \(up\) or a fall \(down\)/);
  });

  it('on the polycrisis example: every trend follows the signs of the links that bring it', () => {
    const project = polycrisisExample();
    const out = ripple(project, 'food_price_shocks', 'up');
    expect(ripple(project, 'food_price_shocks', 'up')).toEqual(out);
    const trends = new Map<string, string>([[out.start, out.direction]]);
    for (const r of out.reached) trends.set(r.variable, r.trend);
    const links = new Map(project.links.map((l) => [l.id, l]));
    for (const r of out.reached) {
      if (r.trend === 'mixed') continue;
      for (const id of r.via) {
        const l = links.get(id) as Project['links'][number];
        const source = trends.get(l.from);
        expect(source === 'up' || source === 'down').toBe(true);
        expect(r.trend).toBe(l.sign === '+' ? source : source === 'up' ? 'down' : 'up');
      }
    }
    expect(out.reached.length).toBeGreaterThan(5);
  });
});
