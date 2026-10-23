import { addLink, addVariable, createProject, templateById } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import {
  applyAutoLayout,
  autoLayout,
  chooseBends,
  computeForceLayout,
  flowLayout,
  mapGeometry,
  unplacedPositions,
} from '../src/index.ts';
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

  it('records a layout as one edit: constellation halos replace the groups, other layouts draw none', () => {
    const project = smallProject();
    project.layout.positions.b2 = { x: 123, y: 456, pinned: true };
    const out = applyAutoLayout(project, { kind: 'constellation', seed: 5 });
    expect(out.result.kind).toBe('constellation');
    expect(out.result.seed).toBe(5);
    expect(out.result.pinned).toEqual(['b2']);
    expect(out.project.layout.groups.map((g) => g.id)).toEqual(['a', 'b', 'c']);
    expect(out.summary).toBe(
      'Laid out the map as a constellation by category (seed 5): moved 9 variables; 1 pinned variable stayed and added 3 group halos.',
    );
    expect(out.project.layout.positions).toEqual(
      autoLayout(project, { kind: 'constellation', seed: 5 }).positions,
    );
    const flow = applyAutoLayout(out.project, { kind: 'flow' });
    expect(flow.project.layout.groups).toEqual([]);
    expect(flow.summary).toMatch(
      /^Laid out the map as a flow from causes to effects: moved \d+ variables; 1 pinned variable stayed and removed 3 group halos\.$/,
    );
    expect(project.layout.groups).toEqual([]);
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

describe('variables without a place of their own', () => {
  it('are placed around the placed ones, which stay where they are, not on top of them', () => {
    // A template map (its variables placed) with three variables added, as an agent added them in a dry run.
    const template = templateById('fixes-that-fail');
    if (!template) throw new Error('no template');
    let project = template.build();
    const placed = Object.keys(project.layout.positions);
    expect(placed.length).toBe(project.variables.length);
    for (const label of ['Traffic volume', 'Vehicle ownership', 'Public pressure'])
      project = addVariable(project, { label }).project;
    project = addLink(project, { from: 'traffic_volume', to: placed[0] as string, sign: '+' }).project;
    const auto = unplacedPositions(project);
    expect(Object.keys(auto).sort()).toEqual(['public_pressure', 'traffic_volume', 'vehicle_ownership']);
    const { nodes } = mapGeometry(project);
    for (const id of placed) expect(nodes.get(id)).toMatchObject(project.layout.positions[id] as object);
    // Every pair of variables at least a label's height apart: none hidden under another.
    const all = [...nodes.values()];
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1)) expect(distance(a, b), `${a.id} and ${b.id}`).toBeGreaterThan(60);
    expect(unplacedPositions(project)).toEqual(auto);
  });

  // A placed variable (anywhere on the map) and new ones linked to it, none of them placed.
  const anchored = (at: { x: number; y: number }, added: number) => {
    let project = addVariable(createProject({ title: 'Anchor' }), { label: 'Anchor' }).project;
    project = { ...project, layout: { ...project.layout, positions: { anchor: { x: at.x, y: at.y } } } };
    for (let i = 1; i <= added; i++) {
      project = addVariable(project, { label: `New ${i}` }).project;
      project = addLink(project, { from: 'anchor', to: `new_${i}`, sign: '+' }).project;
    }
    return project;
  };
  // Two variables' boxes (the force layout's 150 × 70 for a glyph and its label) do not overlap.
  const apart = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) >= 150 || Math.abs(a.y - b.y) >= 70;

  for (const [where, at] of [
    ['in the middle of the stage', { x: 960, y: 540 }],
    ['at negative places', { x: -1000, y: -1000 }],
    ['beyond the stage', { x: 4000, y: 2600 }],
  ] as const) {
    it(`are placed beside a placed variable ${where}, not on it`, () => {
      for (const added of [1, 2]) {
        const project = anchored(at, added);
        const auto = unplacedPositions(project);
        const { nodes } = mapGeometry(project);
        expect(nodes.get('anchor')).toMatchObject(at);
        const fresh = Object.keys(auto).map((id) => nodes.get(id) as { x: number; y: number });
        expect(fresh).toHaveLength(added);
        for (const [i, n] of fresh.entries()) {
          expect(apart(n, at), `new ${i + 1} of ${added} clear of the anchor`).toBe(true);
          expect(distance(n, at), `new ${i + 1} of ${added} beside the anchor`).toBeLessThan(450);
          for (const m of fresh.slice(i + 1)) expect(apart(n, m)).toBe(true);
        }
        expect(unplacedPositions(project)).toEqual(auto);
      }
    });
  }

  it('are given room for as many as there are: 33 beside one placed variable, none on another', () => {
    const project = anchored({ x: 960, y: 540 }, 33);
    const auto = unplacedPositions(project);
    const { nodes } = mapGeometry(project);
    expect(nodes.get('anchor')).toMatchObject({ x: 960, y: 540 });
    const all = [...nodes.values()];
    expect(all).toHaveLength(34);
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1)) expect(apart(a, b), `${a.id} and ${b.id}`).toBe(true);
    expect(unplacedPositions(project)).toEqual(auto);
  });

  it('are laid out as a constellation when none has a place, and need nothing when all have', () => {
    const project = smallProject();
    const bare = { ...project, layout: { ...project.layout, positions: {} } };
    expect(unplacedPositions(bare)).toEqual(autoLayout(bare, { kind: 'constellation' }).positions);
    expect(unplacedPositions(example())).toEqual({});
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
    // The example's map without the bends it keeps from the deck (see the next test).
    const project = example();
    project.layout.bends = {};
    const { report } = mapGeometry(project);
    expect(report.changed.length).toBeGreaterThan(0);
    expect(report.changed.length).toBeLessThanOrEqual(5);
    expect(report.after.crossings).toBeLessThanOrEqual(report.before.crossings);
    expect(report.after.sharedLength).toBeLessThanOrEqual(report.before.sharedLength + 0.001);
    const plain = mapGeometry(project, { refineBends: false }).report;
    expect(plain.changed).toEqual([]);
  });

  it("keeps the example's curves as the deck drew them: refinement re-bends none of its links", () => {
    // The example writes the deck's bend for each link refinement would change (POLYCRISIS_CLEANUP.deckBends);
    // if refinement ever finds another link to re-bend, add it there and convert again.
    expect(mapGeometry(example()).report.changed).toEqual([]);
  });
});
