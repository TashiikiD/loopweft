// Partly from PolycrisisPresentation tests/map.test.ts @ 539bc8e (private): the geometry, camera and label
// tests, run on the converted example instead of the deck's own map.
import { describe, expect, it } from 'vitest';
import {
  arrivingMarks,
  BADGE_R,
  badgeOffset,
  badgeOffsets,
  boxFor,
  circleOnStage,
  curveOnStage,
  distanceToPolygon,
  edgeGeometry,
  FRAMES,
  fitCamera,
  homeCamera,
  LOOP_BADGE_R,
  type LoopNameSide,
  loopNameBox,
  mapGeometry,
  type Pt,
  placeLabels,
  placeLoopNames,
  project,
  quad,
  wholeMapCamera,
  zoomFloor,
} from '../src/index.ts';
import { example } from './helpers.ts';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const geometry = mapGeometry(example());
const positions = new Map([...geometry.nodes].map(([id, n]) => [id, { x: n.x, y: n.y }]));

describe('link geometry', () => {
  it('gives every variable a position and every link a curve', () => {
    expect(geometry.nodes.size).toBe(41);
    expect(geometry.edges.size).toBe(132);
    for (const e of geometry.edges.values())
      expect(e.geom.length, `${e.id} is degenerate`).toBeGreaterThan(10);
  });

  it('starts and ends links at the rims of their variables, not their centres', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 300, y: 0 };
    const g = edgeGeometry(a, 11, b, 15, 0.12, '+');
    expect(Math.abs(dist(g.p0, a) - 15)).toBeLessThan(1);
    // The line stops where the arrowhead begins; the arrowhead tip touches the rim gap.
    expect(dist(g.p1, b)).toBeGreaterThan(15 + 4);
    const tip = /^M([\d.-]+) ([\d.-]+)/.exec(g.head) as RegExpExecArray;
    expect(Math.abs(Math.hypot(Number(tip[1]) - b.x, Number(tip[2]) - b.y) - 19)).toBeLessThan(1);
  });

  it('ends a + link in an arrowhead, a − link in a bar, and a ? link in an arrowhead', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 300, y: 0 };
    expect(edgeGeometry(a, 11, b, 11, 0.12, '+').head.match(/L/g)).toHaveLength(2);
    expect(edgeGeometry(a, 11, b, 11, 0.12, '-').head.match(/L/g)).toHaveLength(3);
    expect(edgeGeometry(a, 11, b, 11, 0.12, '?').head).toBe(edgeGeometry(a, 11, b, 11, 0.12, '+').head);
  });

  it('bows the two directions of a feedback pair apart', () => {
    const ab = geometry.edges.get('E033')?.geom;
    const ba = geometry.edges.get('E034')?.geom;
    if (!ab || !ba) throw new Error('missing links');
    expect(dist(quad(ab.p0, ab.c, ab.p1, 0.5), quad(ba.p0, ba.c, ba.p1, 0.5))).toBeGreaterThan(10);
  });

  it('sizes hubs and response rings as the deck did, and keeps bends set by hand', () => {
    expect(geometry.nodes.get('food_insecurity')?.r).toBe(15);
    expect(geometry.nodes.get('ecorestoration')?.r).toBe(13);
    expect(geometry.nodes.get('climate_heating')?.r).toBe(11);
    expect(geometry.edges.get('E129')?.bend).toBe(-0.28);
  });
});

describe('the camera', () => {
  it('fits its subject inside the requested frame', () => {
    const ids = ['geopolitical_conflict', 'energy_price_shocks', 'food_insecurity'];
    const cam = fitCamera(positions, { fit: ids, frame: 'center' });
    const f = FRAMES.center;
    for (const id of ids) {
      const n = positions.get(id) as { x: number; y: number };
      const p = project(cam, n.x, n.y);
      expect(p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h, `${id} outside frame`).toBe(
        true,
      );
    }
  });

  it("frames the whole example much as the deck's fixed whole-map camera did", () => {
    // The deck: { cx: 960, cy: 478, zoom: 0.9 }, set by hand for its layout.
    const cam = wholeMapCamera(positions);
    expect(cam.zoom).toBeGreaterThan(0.85);
    expect(cam.zoom).toBeLessThan(0.95);
    expect(Math.abs(cam.cx - 960)).toBeLessThan(40);
    expect(Math.abs(cam.cy - 478)).toBeLessThan(40);
    expect(fitCamera(positions, undefined)).toEqual(cam);
  });

  it('shrinks the whole map into a frame when a step frames no subject', () => {
    const inset = fitCamera(positions, { frame: 'inset' });
    expect(inset.zoom).toBeLessThan(wholeMapCamera(positions).zoom);
  });

  it('tells whether any of a variable or a link shows on the stage', () => {
    // At zoom 2 round the stage's centre, the stage shows the world from (480, 270) to (1440, 810).
    const cam = { cx: 960, cy: 540, zoom: 2 };
    expect(circleOnStage(cam, 960, 540, 10)).toBe(true);
    // A centre just off the stage with its rim on it; then wholly off.
    expect(circleOnStage(cam, 470, 540, 20)).toBe(true);
    expect(circleOnStage(cam, 460, 540, 5)).toBe(false);
    // Off past a corner, 14 world units from it: near both edges, on the stage only with a larger radius.
    expect(circleOnStage(cam, 470, 260, 12)).toBe(false);
    expect(circleOnStage(cam, 470, 260, 15)).toBe(true);

    const line = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b] as const;
    // Across the stage with both ends off it; beside it; 10 stage pixels above it, on it only with a pad.
    expect(curveOnStage(cam, ...line({ x: 0, y: 540 }, { x: 1920, y: 540 }))).toBe(true);
    expect(curveOnStage(cam, ...line({ x: 0, y: 200 }, { x: 1920, y: 200 }))).toBe(false);
    expect(curveOnStage(cam, ...line({ x: 0, y: 265 }, { x: 1920, y: 265 }))).toBe(false);
    expect(curveOnStage(cam, ...line({ x: 0, y: 265 }, { x: 1920, y: 265 }), 12)).toBe(true);
    // A long link that cuts the stage's corner in the middle of one of its 32 pieces (near world (485, 275),
    // with every piece's ends off the stage) still shows.
    expect(curveOnStage(cam, ...line({ x: 52047.5, y: -51287.5 }, { x: -47952.5, y: 48712.5 }))).toBe(true);
    // A curve bowing onto the stage from ends off it.
    expect(curveOnStage(cam, { x: 0, y: 100 }, { x: 960, y: 1100 }, { x: 1920, y: 100 })).toBe(true);
  });

  it('frames the whole map with the home view a project sets, and never zooms further out for a subject', () => {
    const home = homeCamera({ home: { x: 900, y: 500, zoom: 1.2 } });
    expect(home).toEqual({ cx: 900, cy: 500, zoom: 1.2 });
    expect(homeCamera({})).toBeNull();
    expect(wholeMapCamera(positions, home)).toEqual(home);
    expect(fitCamera(positions, undefined, home)).toEqual(home);
    expect(fitCamera(positions, { frame: 'center' }, home)).toEqual(home);
    // The whole map's variables, framed as a subject: as wide as the home view allows, no wider.
    expect(fitCamera(positions, { fit: [...positions.keys()] }, home).zoom).toBe(1.2);
    // Frames that set the whole map aside for an overlay keep their own scale.
    expect(fitCamera(positions, { frame: 'inset' }, home)).toEqual(fitCamera(positions, { frame: 'inset' }));
  });

  it('says how far a zoom limit can go: the least zoom of each frame, or none for the whole map as it is', () => {
    const whole = wholeMapCamera(positions).zoom;
    const two = ['geopolitical_conflict', 'energy_price_shocks'];
    // The whole map as it is: a zoom limit does nothing.
    expect(zoomFloor(positions, undefined)).toBeNull();
    expect(zoomFloor(positions, { frame: 'center', maxZoom: 0.5 })).toBeNull();
    expect(zoomFloor(positions, { frame: 'right', fit: ['not_on_the_map'] })).toBeNull();
    expect(fitCamera(positions, { maxZoom: 0.5 })).toEqual(wholeMapCamera(positions));
    // A subject never shows smaller than the whole map, so a limit below that is ignored.
    expect(zoomFloor(positions, { fit: two })).toBe(whole);
    expect(fitCamera(positions, { fit: two, maxZoom: 0.1 }).zoom).toBe(whole);
    // The whole map set aside keeps its own least zoom.
    expect(zoomFloor(positions, { frame: 'inset' })).toBe(0.25);
    expect(zoomFloor(positions, { frame: 'left' })).toBe(0.4);
    expect(fitCamera(positions, { frame: 'left', maxZoom: 0.2 }).zoom).toBe(0.4);
  });
});

describe('label placement', () => {
  it('moves a label off a lit link running along its preferred side', () => {
    // E022 runs left from conflict toward energy prices; a left label would sit on it.
    const cam = fitCamera(positions, { fit: ['geopolitical_conflict', 'energy_price_shocks'] });
    const sides = placeLabels(
      [{ id: 'geopolitical_conflict', w: 140, h: 54, preferred: 'left', priority: 5 }],
      {
        graph: geometry,
        camera: cam,
        edges: [{ id: 'E022', weight: 5 }],
        nodes: [],
        badges: [],
        reserved: [],
      },
    );
    expect(sides.get('geopolitical_conflict')).not.toBe('left');
  });

  it('puts label boxes on the named side of the variable', () => {
    const b = boxFor('above', 100, 100, 20, 60, 30);
    expect(b.y + b.h <= 80 && b.x + b.w / 2 === 100).toBe(true);
    const r = boxFor('right', 100, 100, 20, 60, 30);
    expect(r.x >= 120 && r.y + r.h / 2 === 100).toBe(true);
  });
});

describe('marks that keep clear of each other', () => {
  // Two variables in a two-way pair, as a loop of two draws them: B up and to the right of A.
  const A = { x: 400, y: 700, r: 11 };
  const B = { x: 1400, y: 400, r: 11 };
  const pair = (bend: number) => {
    const ab = edgeGeometry(A, A.r, B, B.r, bend, '+');
    const ba = edgeGeometry(B, B.r, A, A.r, bend, '+');
    return {
      nodes: new Map([
        ['a', A],
        ['b', B],
        ['c', { x: 900, y: 900, r: 11 }],
      ]),
      edges: new Map([
        ['ab', { source: { id: 'a' }, target: { id: 'b' }, geom: ab }],
        ['ba', { source: { id: 'b' }, target: { id: 'a' }, geom: ba }],
      ]),
    };
  };
  const near = (graph: ReturnType<typeof pair>, id: string, at: { x: number; y: number }) => {
    const n = graph.nodes.get(id) as { x: number; y: number };
    let closest = Number.POSITIVE_INFINITY;
    for (const e of graph.edges.values()) {
      if (e.source.id !== id && e.target.id !== id) continue;
      for (let i = 0; i <= 50; i++) {
        const p = quad(e.geom.p0, e.geom.c, e.geom.p1, i / 50);
        closest = Math.min(closest, Math.hypot(p.x - n.x - at.x, p.y - n.y - at.y));
      }
    }
    return closest;
  };

  it('puts a ▲/▼ badge at its variable’s upper right, or the first corner clear of its own links', () => {
    const graph = pair(0.18);
    // A variable without links: its upper right.
    expect(badgeOffset(graph, 'c')).toEqual({ x: 17, y: -17 });
    // A's links leave towards its upper right, where the badge would hide them (the proof's loop step).
    const a = badgeOffset(graph, 'a');
    expect(a).not.toEqual({ x: 17, y: -17 });
    expect(near(graph, 'a', a)).toBeGreaterThanOrEqual(BADGE_R + 3);
    // The same every time; a variable not on the map has none.
    expect(badgeOffset(graph, 'a')).toEqual(a);
    expect(badgeOffset(graph, 'nowhere')).toEqual({ x: 0, y: 0 });
  });

  it('puts a loop’s name below its badge, or on the first side clear of variables, badges and labels', () => {
    const graph = pair(0.18);
    const camera = { cx: 960, cy: 540, zoom: 1 };
    const name = { id: 'R1', w: 360, h: 30 };
    const ctx = { graph, camera, nodes: ['a', 'b', 'c'], badges: [], labels: [], reserved: [] };
    // Nothing below the badge: below.
    expect(placeLoopNames([{ ...name, at: { x: 900, y: 300 } }], ctx).get('R1')).toBe('below');
    // C sits just under the badge (as Food insecurity sat under the name in the proof): not below.
    const side = placeLoopNames([{ ...name, at: { x: 900, y: 840 } }], ctx).get('R1');
    expect(side).not.toBe('below');
    const box = loopNameBox(side as LoopNameSide, 900, 840, LOOP_BADGE_R, name.w, name.h);
    expect(box.x <= 900 && 900 <= box.x + box.w && box.y <= 900 && 900 <= box.y + box.h).toBe(false);
    // A label in the way counts too.
    const label = { x: 700, y: 330, w: 400, h: 40 };
    expect(
      placeLoopNames([{ ...name, at: { x: 900, y: 300 } }], { ...ctx, labels: [label] }).get('R1'),
    ).not.toBe('below');
    // So does a box kept clear (a group label on show).
    expect(
      placeLoopNames([{ ...name, at: { x: 900, y: 300 } }], { ...ctx, reserved: [label] }).get('R1'),
    ).not.toBe('below');
  });

  it('never moves a badge onto another variable: the corner must be clear of glyphs as well as arrowheads', () => {
    // A link arrives at A's upper right; C sits at A's upper left; the lower right is free.
    const A = { x: 100, y: 100, r: 11 };
    const B = { x: 400, y: -200, r: 11 };
    const graph = {
      nodes: new Map([
        ['a', A],
        ['b', B],
        ['c', { x: 83, y: 83, r: 11 }],
      ]),
      edges: new Map([
        ['ba', { source: { id: 'b' }, target: { id: 'a' }, geom: edgeGeometry(B, B.r, A, A.r, 0, '+') }],
      ]),
    };
    expect(badgeOffset(graph, 'a')).toEqual({ x: 17, y: 17 });
  });

  it('keeps a badge off the whole painted marker of a link arriving at a shallow angle, bar or triangle', () => {
    // C→A arrives just above A's right: the line's centre passes the upper right corner with room to spare, but
    // a bar is 14 units wide, and its end reaches into the badge there.
    const A = { x: 0, y: 0, r: 11 };
    const C = { x: 200, y: -35, r: 11 };
    for (const sign of ['-', '+'] as const) {
      const geom = edgeGeometry(C, C.r, A, A.r, 0, sign);
      const withHead = {
        nodes: new Map([
          ['a', A],
          ['c', C],
        ]),
        edges: new Map([['ca', { source: { id: 'c' }, target: { id: 'a' }, geom }]]),
      };
      const at = badgeOffset(withHead, 'a');
      const centre = { x: A.x + at.x, y: A.y + at.y };
      const marks = arrivingMarks(withHead, 'a');
      expect(marks).toHaveLength(1);
      expect(
        distanceToPolygon(marks[0] as Pt[], centre),
        `${sign}: badge on the marker`,
      ).toBeGreaterThanOrEqual(BADGE_R);
      // The same corner when the graph has only the curve and the sign, not the marker's path.
      const { head: _, ...curve } = geom;
      const withSign = {
        ...withHead,
        edges: new Map([['ca', { source: { id: 'c' }, target: { id: 'a' }, sign, geom: curve }]]),
      };
      expect(badgeOffset(withSign, 'a')).toEqual(at);
    }
    // The bar is what the upper right corner would cover.
    const bar = {
      nodes: new Map([
        ['a', A],
        ['c', C],
      ]),
      edges: new Map([
        ['ca', { source: { id: 'c' }, target: { id: 'a' }, geom: edgeGeometry(C, C.r, A, A.r, 0, '-') }],
      ]),
    };
    expect(badgeOffset(bar, 'a')).not.toEqual({ x: 17, y: -17 });
    expect(distanceToPolygon(arrivingMarks(bar, 'a')[0] as Pt[], { x: 17, y: -17 })).toBeLessThan(BADGE_R);
  });

  it('keeps badges off each other: neighbours choose their corners together', () => {
    // A link arrives at B's upper right, so B's badge would go to its upper left, onto A's upper right badge.
    const A = { x: 0, y: 0, r: 11 };
    const B = { x: 40, y: 0, r: 11 };
    const C = { x: 140, y: -100, r: 11 };
    const graph = {
      nodes: new Map([
        ['a', A],
        ['b', B],
        ['c', C],
      ]),
      edges: new Map([
        ['cb', { source: { id: 'c' }, target: { id: 'b' }, geom: edgeGeometry(C, C.r, B, B.r, 0, '+') }],
      ]),
    };
    const all = badgeOffsets(graph);
    const a = all.get('a') as Pt;
    const b = all.get('b') as Pt;
    expect(b).not.toEqual({ x: 17, y: -17 });
    expect(dist({ x: A.x + a.x, y: A.y + a.y }, { x: B.x + b.x, y: B.y + b.y })).toBeGreaterThanOrEqual(
      2 * BADGE_R,
    );
    // One variable's offset is the one chosen with the rest.
    for (const [id, at] of all) expect(badgeOffset(graph, id)).toEqual(at);
  });

  it('lets the variable with fewest clear corners choose first, so a badge placed earlier cannot push it onto a marker', () => {
    // Links arrive at B's upper right, lower right and lower left: its upper left is its one clear corner, where
    // A (first on the map, with no link at all) would put its own upper right badge if it chose first.
    const A = { x: 0, y: 0, r: 11 };
    const B = { x: 40, y: 0, r: 11 };
    const ends = {
      C: { x: 140, y: -100, r: 11 },
      D: { x: 140, y: 100, r: 11 },
      E: { x: -60, y: 100, r: 11 },
    };
    const graph = {
      nodes: new Map([
        ['a', A],
        ['b', B],
        ['c', ends.C],
        ['d', ends.D],
        ['e', ends.E],
      ]),
      edges: new Map(
        Object.entries(ends).map(([name, from]) => [
          `${name}b`,
          {
            source: { id: name.toLowerCase() },
            target: { id: 'b' },
            geom: edgeGeometry(from, from.r, B, B.r, 0, '+'),
          },
        ]),
      ),
    };
    const all = badgeOffsets(graph);
    const b = all.get('b') as Pt;
    const centre = { x: B.x + b.x, y: B.y + b.y };
    const marks = arrivingMarks(graph, 'b');
    expect(marks).toHaveLength(3);
    for (const m of marks) expect(distanceToPolygon(m, centre)).toBeGreaterThanOrEqual(BADGE_R);
    // A takes another corner, clear of B's badge.
    const a = all.get('a') as Pt;
    expect(dist({ x: A.x + a.x, y: A.y + a.y }, centre)).toBeGreaterThanOrEqual(2 * BADGE_R);
  });

  it('keeps a loop’s name off another loop’s badge on show', () => {
    const graph = { nodes: new Map(), edges: new Map() };
    const camera = { cx: 960, cy: 540, zoom: 1 };
    const ctx = { graph, camera, nodes: [], badges: [], labels: [], reserved: [] };
    const name = { id: 'R1', at: { x: 960, y: 500 }, w: 120, h: 30 };
    // R2's badge just under R1's: R1's name goes elsewhere while R2's badge shows, below when it does not.
    const loops = [
      { id: 'R1', at: name.at },
      { id: 'R2', at: { x: 960, y: 535 } },
    ];
    expect(placeLoopNames([name], { ...ctx, loops }).get('R1')).not.toBe('below');
    expect(placeLoopNames([name], { ...ctx, loops: [loops[0] as (typeof loops)[0]] }).get('R1')).toBe(
      'below',
    );
  });
});
