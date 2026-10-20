// Partly from PolycrisisPresentation tests/map.test.ts and tests/motion.test.ts @ 539bc8e (private): the
// graph, resolve and choreography tests, run on the converted example instead of the deck's own content.
import { CARD_ICONS } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import {
  ambientWalker,
  buildGraph,
  cardIcon,
  categoryColours,
  DRAW,
  moveNode,
  namedLoops,
  resolveMap,
  schedule,
  seededRandom,
  shapeGlyph,
  THEMES,
  TRAVEL,
  themeTokens,
  themeVariables,
} from '../src/index.ts';
import { example, stepAt } from './helpers.ts';

const project = example();
const graph = buildGraph(project);
const loops = namedLoops(project, graph);
const resolve = (key: string) => resolveMap(project, graph, stepAt(project, key).map);
/** The schedule of a forward step from `from` to `to`. */
const plan = (from: string, to: string) => {
  const next = resolve(to);
  return { plan: schedule(graph, loops, resolve(from), next, stepAt(project, to).map), next };
};

describe('the drawable graph', () => {
  it('draws every variable and link, in its category colour and role shape', () => {
    expect(graph.nodes.size).toBe(41);
    expect(graph.edges.size).toBe(132);
    const heating = graph.nodes.get('climate_heating');
    expect(heating?.colour).toBe('#5ECBA9');
    expect(graph.nodes.get('food_insecurity')).toMatchObject({ r: 15, shape: 'octagon', response: false });
    expect(graph.nodes.get('ecorestoration')).toMatchObject({ r: 13, shape: 'ring', response: true });
    expect([...graph.nodes.values()].filter((n) => n.response)).toHaveLength(5);
    // Links take their cause's colour; side-effects are dotted, flagged and optional.
    const e022 = graph.edges.get('E022');
    expect(e022?.colour).toBe(graph.nodes.get('geopolitical_conflict')?.colour);
    expect(graph.edges.get('E128')).toMatchObject({ style: 'dotted', flag: true, optional: true });
  });

  it('keeps group halos, the central glow without a category', () => {
    expect(graph.groups.map((g) => g.id)).toEqual([
      'technology',
      'energy',
      'governance',
      'earth',
      'society',
      'economy',
      'response',
      'hub',
    ]);
    expect(graph.groups.find((g) => g.id === 'hub')).toEqual({
      id: 'hub',
      colour: null,
      halo: { x: 960, y: 545, r: 130 },
    });
  });

  it('reshapes only the moved variable’s links when one is dragged', () => {
    const g = buildGraph(project, { refineBends: false });
    const unrelated = g.edges.get('E001')?.geom.d;
    const touched = g.edges.get('E022')?.geom.d;
    moveNode(g, 'geopolitical_conflict', 1250, 400);
    expect(g.edges.get('E001')?.geom.d).toBe(unrelated);
    expect(g.edges.get('E022')?.geom.d).not.toBe(touched);
  });
});

describe('named loops', () => {
  it('reads R or B from the signs, and shows the archetype’s short name', () => {
    expect([...loops.values()].filter((l) => l.type === 'B').map((l) => l.id)).toEqual(['B1', 'B2']);
    expect(loops.get('R9')).toMatchObject({ type: 'R', shortName: 'Crisis Deferral' });
    expect(loops.get('R1')?.shortName).toBe('Food insecurity and livelihoods');
    const r1 = loops.get('R1');
    const [a, b] = (r1?.nodes ?? []).map((id) => graph.nodes.get(id));
    expect(r1?.at).toEqual({ x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 });
  });
});

describe('map states', () => {
  it('brings both ends of every visible link with it', () => {
    const r = resolveMap(project, graph, {
      variables: { base: 'hidden' },
      links: { base: 'hidden', active: ['E022'] },
    });
    expect(r.nodeLevel.get('geopolitical_conflict')).not.toBe('hidden');
    expect(r.nodeLevel.get('energy_price_shocks')).not.toBe('hidden');
    expect(r.nodeLevel.get('food_insecurity')).toBe('hidden');
    expect(r.litEdges).toEqual(['E022']);
  });

  it('labels only the variables a step names when labels are "focus"', () => {
    const r = resolveMap(project, graph, {
      variables: { base: 'dim', focus: ['inequality'] },
      links: { focus: ['E037'] },
      labels: 'focus',
    });
    expect([...r.labels]).toEqual(['inequality']);
  });

  it('labels what is in view by default, and everything shown with "all"', () => {
    const framed = { camera: { fit: ['geopolitical_conflict', 'energy_price_shocks'] } };
    const inView = resolveMap(project, graph, framed);
    expect(inView.labels.has('geopolitical_conflict')).toBe(true);
    expect(inView.labels.size).toBeLessThan(41);
    expect(resolveMap(project, graph, { ...framed, labels: 'all' }).labels.size).toBe(41);
    expect(resolveMap(project, graph, { labels: 'none' }).labels.size).toBe(0);
  });

  it('names the category of every variable in view at dim or stronger, in the category-in-words mode', () => {
    const words = { categoryWords: true };
    // The title page hides labels and dims the whole map: every variable is named all the same.
    const title = resolveMap(project, graph, stepAt(project, 'S00.1').map, words);
    expect(title.labels.size).toBe(41);
    expect(title.categoryWords.climate_heating).toBe('Earth systems');
    expect(Object.keys(title.categoryWords)).toHaveLength(41);
    expect(resolveMap(project, graph, stepAt(project, 'S00.1').map).categoryWords).toEqual({});
    // Ghosts and hidden variables get none; nor does a map that is not shown.
    const ghost = resolveMap(
      project,
      graph,
      { variables: { base: 'ghost', focus: ['food_insecurity'] }, links: { base: 'hidden' }, labels: 'none' },
      words,
    );
    expect(Object.keys(ghost.categoryWords)).toEqual(['food_insecurity']);
    expect([...ghost.labels]).toEqual(['food_insecurity']);
    expect(resolveMap(project, graph, { show: false }, words).categoryWords).toEqual({});
    // Only what is in view.
    const framed = {
      camera: { fit: ['geopolitical_conflict', 'energy_price_shocks'] },
      labels: 'none' as const,
    };
    const near = resolveMap(project, graph, framed, words);
    expect(near.categoryWords.geopolitical_conflict).toBe('Geopolitics and governance');
    expect(Object.keys(near.categoryWords).length).toBeLessThan(41);
    // A variable without a category is not named.
    const uncategorised = {
      ...project,
      variables: project.variables.map((v) =>
        v.id === 'food_insecurity' ? { ...v, category: undefined } : v,
      ),
    };
    const u = resolveMap(uncategorised, buildGraph(uncategorised), { labels: 'none' }, words);
    expect(u.categoryWords.food_insecurity).toBeUndefined();
    expect(u.labels.has('food_insecurity')).toBe(false);
  });

  it("frames the whole map with the project's home view, and fits the map when it has none", () => {
    // The example's home view is the deck's whole-map camera.
    expect(resolveMap(project, graph, {}).camera).toEqual({ cx: 960, cy: 478, zoom: 0.9 });
    const unset = example();
    delete unset.layout.home;
    const fitted = resolveMap(unset, buildGraph(unset), {}).camera;
    expect(fitted).not.toEqual({ cx: 960, cy: 478, zoom: 0.9 });
    expect(Math.abs(fitted.zoom - 0.9)).toBeLessThan(0.05);
    // A framed subject is never shown smaller than the home view shows the whole map.
    const framed = resolveMap(project, graph, { camera: { fit: [...graph.nodes.keys()] } }).camera;
    expect(framed.zoom).toBe(0.9);
  });

  it('keeps optional links hidden unless a step lists them', () => {
    expect(resolveMap(project, graph, {}).edgeLevel.get('E128')).toBe('hidden');
    expect(resolveMap(project, graph, { links: { focus: ['E128'] } }).edgeLevel.get('E128')).toBe('focus');
  });

  it('shows the minimap when zoomed in, unless the step says otherwise', () => {
    expect(resolveMap(project, graph, {}).minimap).toBe(false);
    const close = { camera: { fit: ['inequality'] } };
    expect(resolveMap(project, graph, close).minimap).toBe(true);
    expect(resolveMap(project, graph, { ...close, minimap: false }).minimap).toBe(false);
    expect(resolveMap(project, graph, undefined).show).toBe(false);
  });
});

describe('choreography', () => {
  it('traces a widening step outward from the loop already lit', () => {
    // S05.1 (R1) → S05.2 (Fig. 9A adds E083 and E084 around economic insecurity).
    const { plan: p } = plan('S05.1', 'S05.2');
    expect([...p.draws.keys()].sort()).toEqual(['E083', 'E084']);
    // Both touch the lit loop, so they trace together in the first ring.
    expect(p.draws.get('E083')).toBe(p.draws.get('E084'));
    // The new loop's badge pops only once both of its links have arrived.
    expect(p.loopAt.get('R7')).toBeGreaterThanOrEqual((p.draws.get('E083') as number) + DRAW);
    // Nationalist politics appears as its first link reaches it.
    expect(p.nodeAt.has('nationalist_politics')).toBe(true);
  });

  it("sends a pulse once its link has traced, and lands the target's trend with it", () => {
    // S04.1 → S04.2: conflict → energy prices traces, then a pulse runs it.
    const { plan: p } = plan('S04.1', 'S04.2');
    const traced = p.draws.get('E022') as number;
    expect(p.pulses).toHaveLength(1);
    const pulse = p.pulses[0] as (typeof p.pulses)[number];
    expect(pulse).toMatchObject({ edge: 'E022', tone: 'harm' });
    expect(pulse.at).toBeGreaterThanOrEqual(traced + DRAW);
    expect(p.trendAt.get('energy_price_shocks')).toBe(pulse.at + TRAVEL);
    expect(p.trendAt.get('geopolitical_conflict')).toBe(pulse.at);
  });

  it('carries relief downstream of a response, and harm where capacities erode', () => {
    const { plan: a } = plan('S09.1', 'S09.2');
    expect(a.pulses.length > 0 && a.pulses.every((x) => x.tone === 'relief')).toBe(true);
    const { plan: b } = plan('S05.7', 'S05.8');
    expect(b.pulses.length > 0 && b.pulses.every((x) => x.tone === 'relief')).toBe(true);
    const { plan: c } = plan('S05.8', 'S05.9');
    expect(c.pulses.every((x) => x.tone === 'harm')).toBe(true);
    // A pulse into a response with no trend of its own reads as relief, not as its source's ± (S09.3).
    const { plan: d } = plan('S09.2', 'S09.3');
    expect(d.pulses.find((x) => x.edge === 'E127')?.tone).toBe('relief');
  });

  it('draws the ten links of scene 1 one beat at a time', () => {
    const { plan: p } = plan('S01.1', 'S01.2');
    const times = [...p.draws.values()].sort((x, y) => x - y);
    expect(times).toHaveLength(10);
    for (let i = 1; i < times.length; i++) {
      expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThan(0.9);
    }
  });

  it('blooms the title page ring by ring from its seeds', () => {
    const next = resolve('S00.1');
    const p = schedule(graph, loops, null, next, stepAt(project, 'S00.1').map);
    expect(p.draws.size).toBe(0);
    expect(p.nodeAt.size).toBe(41);
    expect(p.nodeAt.get('extreme_weather')).toBeLessThan(p.nodeAt.get('ecorestoration') as number);
    expect(p.fades.size).toBeGreaterThan(100);
  });
});

describe('ambient walks', () => {
  const walks = (key: string, seed: number, count = 40) => {
    const step = stepAt(project, key);
    const ambient = step.map.ambient;
    if (!ambient) throw new Error(`${key} has no ambient walks`);
    const walker = ambientWalker(graph, resolve(key), ambient, seededRandom(seed));
    return Array.from({ length: count }, () => walker.walk() ?? []);
  };
  const sign = (id: string) => graph.edges.get(id)?.sign;

  it('spreads harm along "+" links only', () => {
    const paths = walks('S00.1', 7);
    expect(paths.some((p) => p.length >= 2)).toBe(true);
    expect(paths.flat().every((id) => sign(id) === '+')).toBe(true);
  });

  it('leaves a response through a "-" link, then spreads relief along "+" links', () => {
    const paths = walks('S10.4', 7).filter((p) => p.length > 0);
    expect(paths.length).toBeGreaterThan(30);
    for (const p of paths) {
      expect(sign(p[0] as string)).toBe('-');
      expect(p.slice(1).every((id) => sign(id) === '+')).toBe(true);
    }
  });

  it('walks the same way from the same seed', () => {
    expect(walks('S00.1', 3)).toEqual(walks('S00.1', 3));
    expect(walks('S00.1', 3)).not.toEqual(walks('S00.1', 4));
  });
});

describe('glyphs and themes', () => {
  it('draws every card icon of the format, in the text colour', () => {
    for (const name of CARD_ICONS) {
      const icon = cardIcon(name);
      expect(icon.parts.length, name).toBeGreaterThan(0);
      expect(icon.width * icon.height, name).toBeGreaterThan(0);
      expect(icon.viewBox.split(' ').map(Number).slice(2), name).toEqual([icon.width, icon.height]);
    }
    // The deck's families share its boxes, so titles line up; loops carry their letter.
    expect(
      ['common-stress', 'common-trigger', 'domino', 'feedback'].map((n) => cardIcon(n as 'domino').width),
    ).toEqual([64, 64, 64, 64]);
    expect(cardIcon('balancing').parts.find((p) => p.tag === 'text')?.text).toBe('B');
    expect(cardIcon('reinforcing').parts.find((p) => p.tag === 'text')?.text).toBe('R');
    expect(cardIcon('feedback').parts.some((p) => p.tag === 'text')).toBe(false);
    expect(cardIcon('ring').parts.map((p) => p.attrs.class)).toEqual(['node-ring', 'node-dot']);
  });

  it('draws every role shape of the format', () => {
    for (const shape of [
      'circle',
      'square',
      'rounded-square',
      'octagon',
      'diamond',
      'triangle',
      'hexagon',
    ] as const) {
      expect(shapeGlyph(shape, 11).length, shape).toBe(1);
    }
    expect(shapeGlyph('ring', 13).map((p) => p.attrs.class)).toEqual(['node-ring', 'node-dot']);
    expect(String(shapeGlyph('octagon', 11)[0]?.attrs.points).split(' ')).toHaveLength(8);
  });

  it('colours categories that name none from the palette, in order', () => {
    const p = example();
    p.types.categories = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', colour: '#123456' },
      { id: 'c', name: 'C' },
    ];
    expect([...categoryColours(p).values()]).toEqual(['#5ECBA9', '#123456', '#F6D36C']);
  });

  it("uses the project's fonts and turns the tokens into CSS variables", () => {
    const tokens = themeTokens(project);
    expect(tokens.fontSans.startsWith("'Inter Variable', 'Inter'")).toBe(true);
    expect(tokens.fontSerif.startsWith("'Fraunces Variable', 'Fraunces'")).toBe(true);
    expect(themeVariables(THEMES['cinematic-dark'])['--lw-pulse-core']).toBe('#fffaf2');
  });
});
