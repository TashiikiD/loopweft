import { describe, expect, it } from 'vitest';
import { autoLayout, chooseBends, computeForceLayout, flowLayout, mapGeometry } from '../src/index.ts';
import { example, smallProject } from './helpers.ts';

type Positions = Record<string, { x: number; y: number }>;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('automatic layouts', () => {
  for (const kind of ['constellation', 'force', 'flow'] as const) {
    it(`${kind}: places every variable on the stage, the same way every time`, () => {
      const project = smallProject();
      const first = autoLayout(project, { kind });
      expect(Object.keys(first.positions).sort()).toEqual(project.variables.map((v) => v.id).sort());
      for (const p of Object.values(first.positions)) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(1920);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(1080);
      }
      expect(autoLayout(project, { kind })).toEqual(first);
    });

    it(`${kind}: keeps pinned variables where they are`, () => {
      const project = smallProject();
      project.layout.positions.b2 = { x: 123, y: 456, labelSide: 'left', pinned: true };
      expect(autoLayout(project, { kind }).positions.b2).toEqual({
        x: 123,
        y: 456,
        labelSide: 'left',
        pinned: true,
      });
    });
  }

  it('constellation: gathers each category round its own halo', () => {
    const { positions, groups } = autoLayout(smallProject(), { kind: 'constellation' });
    expect(groups.map((g) => g.id)).toEqual(['a', 'b', 'c']);
    for (const g of groups) {
      const halo = g.halo as { x: number; y: number; r: number };
      for (const id of [1, 2, 3].map((n) => `${g.id}${n}`)) {
        const p = (positions as Positions)[id] as { x: number; y: number };
        const own = distance(p, halo);
        expect(own, `${id} inside its halo`).toBeLessThanOrEqual(halo.r);
        for (const other of groups.filter((o) => o !== g))
          expect(own).toBeLessThan(distance(p, other.halo as { x: number; y: number }));
      }
    }
  });

  it('force: a different seed gives a different layout', () => {
    const project = smallProject();
    expect(autoLayout(project, { kind: 'force', seed: 1 }).positions).not.toEqual(
      autoLayout(project, { kind: 'force', seed: 2 }).positions,
    );
  });

  it('force: keeps the boxes of the variables apart', () => {
    const result = computeForceLayout({
      nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` })),
      links: Array.from({ length: 11 }, (_, i) => ({ id: `l${i}`, fromId: `n${i}`, toId: `n${i + 1}` })),
      groups: [],
      layout: { width: 1920, height: 1080, nodeWidth: 150, nodeHeight: 70 },
    });
    for (const a of result.nodes) {
      for (const b of result.nodes) {
        if (a === b) continue;
        expect(Math.abs(a.x - b.x) >= 150 || Math.abs(a.y - b.y) >= 70, `${a.id} overlaps ${b.id}`).toBe(
          true,
        );
      }
    }
  });

  it('flow: puts causes left of their effects, even with feedback', () => {
    const positions = flowLayout({
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
      links: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'b' },
      ],
    });
    const x = (id: string) => (positions.get(id) as { x: number }).x;
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
    expect(x('c')).toBeLessThan(x('d'));
  });
});

describe('link bends', () => {
  it('chooses the same bends every time, and keeps bends set by hand', () => {
    const project = example();
    const a = mapGeometry(project);
    const b = mapGeometry(project);
    expect([...a.edges].map(([id, e]) => [id, e.bend])).toEqual([...b.edges].map(([id, e]) => [id, e.bend]));
    expect(a.edges.get('E129')?.bend).toBe(-0.28);
  });

  it('bows both directions of a two-way pair the same side, so they part', () => {
    const { bends } = chooseBends(
      [
        { id: 'a', x: 0, y: 0, r: 11 },
        { id: 'b', x: 300, y: 0, r: 11 },
        { id: 'blocker', x: 150, y: -20, r: 11 },
      ],
      [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'ba', from: 'b', to: 'a' },
      ],
    );
    expect(bends.get('ab')).toBeGreaterThan(0.09);
    expect(bends.get('ba')).toBeGreaterThan(0.09);
  });

  it('re-bends a few links only when that crosses and overlaps less', () => {
    const { report } = mapGeometry(example());
    expect(report.changed.length).toBeLessThanOrEqual(5);
    expect(report.after.crossings).toBeLessThanOrEqual(report.before.crossings);
    expect(report.after.sharedLength).toBeLessThanOrEqual(report.before.sharedLength + 0.001);
    const plain = mapGeometry(example(), { refineBends: false }).report;
    expect(plain.changed).toEqual([]);
  });
});
