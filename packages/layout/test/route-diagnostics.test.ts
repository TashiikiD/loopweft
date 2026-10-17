// Source: DataViz packages/module-cld/test/route-diagnostics.test.ts @ efcdbe2 (TashiikiD/DataViz, private),
// itself ported from cld-generator tests/visualization/cld_route_diagnostics_regression.mjs (pure geometry part).
import { describe, expect, it } from 'vitest';
import { measureRoutes, ROUTE_TOLERANCES, routeLength, sharedSegmentLength } from '../src/index.ts';

const point = (x: number, y: number) => ({ x, y });
const route = (id: string, fromId: string, toId: string, points: { x: number; y: number }[]) => ({
  id,
  fromId,
  toId,
  points,
});

describe('route diagnostics', () => {
  it('exposes its tolerances and measures route length', () => {
    expect(Object.keys(ROUTE_TOLERANCES).sort()).toEqual([
      'angleSine',
      'corridor',
      'crossingMerge',
      'endpoint',
      'minimumShared',
    ]);
    expect(routeLength([point(0, 0), point(3, 4), point(3, 14)])).toBe(15);
  });

  it('measures symmetric near-collinear overlap within the corridor and above the minimum length', () => {
    const main = [point(0, 0), point(100, 0)] as const;
    const short = [point(20, 0), point(80, 0)] as const;
    expect(sharedSegmentLength(...main, ...short)).toBe(60);
    expect(sharedSegmentLength(...short, ...main)).toBe(60);
    const c = ROUTE_TOLERANCES.corridor;
    expect(sharedSegmentLength(point(0, 0), point(100, 0), point(20, c), point(80, c))).toBe(60);
    expect(sharedSegmentLength(point(0, 0), point(100, 0), point(20, c + 0.01), point(80, c + 0.01))).toBe(0);
    expect(sharedSegmentLength(point(0, 0), point(100, 0), point(40, 0), point(47.99, 0))).toBe(0);
  });

  it('counts shared corridors pairwise and names the partners', () => {
    const shared = measureRoutes([
      route('shared-main', 's', 'a', [point(0, 0), point(100, 0)]),
      route('shared-peer', 'p', 'b', [point(20, 0), point(80, 0)]),
    ]);
    expect(shared).toMatchObject({ crossings: 0, sharedLength: 60, length: 160 });
    expect(shared.perLink.map((l) => l.sharedLinkIds)).toEqual([['shared-peer'], ['shared-main']]);
    const separated = measureRoutes([
      route('a', 's1', 'a1', [point(0, 0), point(100, 0)]),
      route('b', 's2', 'a2', [point(20, 5), point(80, 5)]),
    ]);
    expect(separated).toMatchObject({ crossings: 0, sharedLength: 0 });
  });

  it('counts crossings but not contacts at a shared endpoint', () => {
    const crossing = measureRoutes([
      route('a', 'ca', 'cb', [point(0, 0), point(100, 100)]),
      route('b', 'cc', 'cd', [point(0, 100), point(100, 0)]),
    ]);
    expect(crossing.crossings).toBe(1);
    expect(crossing.perLink.map((l) => l.crossingLinkIds)).toEqual([['b'], ['a']]);
    const hub = measureRoutes([
      route('east', 'hub', 'east', [point(0, 0), point(100, 0)]),
      route('north', 'hub', 'north', [point(0, 0), point(0, 100)]),
    ]);
    expect(hub).toMatchObject({ crossings: 0, sharedLength: 0 });
  });

  it("ignores a link's own annotations but not others'", () => {
    const annotated = measureRoutes(
      [route('annotated', 'aa', 'ab', [point(0, 0), point(100, 0)])],
      [
        { x: 35, y: 0, w: 12, h: 12, ownerId: 'annotated' },
        { x: 75, y: 0, w: 12, h: 12, ownerId: 'other-link' },
      ],
    );
    expect(annotated.annotationIntersections).toBe(1);
  });

  it('reports reciprocal links in one corridor and a crowded hub pairwise', () => {
    const reciprocal = measureRoutes([
      route('forward', 'left', 'right', [point(0, 0), point(100, 0)]),
      route('reverse', 'right', 'left', [point(100, 0), point(0, 0)]),
    ]);
    expect(reciprocal).toMatchObject({ crossings: 0, sharedLength: 100 });
    const hub = measureRoutes([
      route('hub-up', 'hub', 'up', [point(0, 0), point(60, 0), point(120, -30)]),
      route('hub-middle', 'hub', 'middle', [point(0, 0), point(60, 0), point(120, 0)]),
      route('hub-down', 'hub', 'down', [point(0, 0), point(60, 0), point(120, 30)]),
    ]);
    expect(hub.sharedLength).toBe(180);
    expect(hub.perLink.map((l) => l.sharedLinkIds)).toEqual([
      ['hub-middle', 'hub-down'],
      ['hub-up', 'hub-down'],
      ['hub-up', 'hub-middle'],
    ]);
  });
});
