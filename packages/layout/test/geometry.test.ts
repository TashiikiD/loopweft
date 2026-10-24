// Partly from PolycrisisPresentation tests/map.test.ts @ 539bc8e (private): the geometry, camera and label
// tests, run on the converted example instead of the deck's own map.
import { describe, expect, it } from 'vitest';
import {
  BADGE_R,
  badgeOffset,
  boxFor,
  circleOnStage,
  curveOnStage,
  edgeGeometry,
  FRAMES,
  fitCamera,
  homeCamera,
  LOOP_BADGE_R,
  type LoopNameSide,
  loopNameBox,
  mapGeometry,
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
  });
});
