import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { deckFolder, privateWords } from '../scripts/polycrisis-deck.ts';
import { convertPolycrisis } from '../src/importers/polycrisis.ts';
import {
  type LoopStats,
  loopStats,
  type Project,
  readProject,
  referenceList,
  type Step,
  serializeProject,
} from '../src/index.ts';
import { MINI_CLEANUP, miniDeck } from './fixtures/mini-deck.ts';
import { repoFile } from './helpers.ts';

const TEXT = repoFile('examples/polycrisis.loopweft');
const read = readProject(TEXT);
if (!read.ok) throw new Error(JSON.stringify(read.issues, null, 2));
const example: Project = read.project;

const step = (scene: string, id: string): Step => {
  const found = example.story.scenes.find((s) => s.id === scene)?.steps.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${scene}.${id}`);
  return found;
};

/** Every loop of the example, counted once for the tests that need it (a couple of seconds). */
let everyLoop: LoopStats | undefined;
const allLoops = (): LoopStats => {
  everyLoop ??= loopStats(example);
  return everyLoop;
};

const counts = ({ count, reinforcing, balancing, unknown, byLength, capped }: LoopStats) => ({
  count,
  reinforcing,
  balancing,
  unknown,
  byLength,
  capped,
});

describe('the polycrisis example', () => {
  it('validates, with no warnings', () => {
    expect(read.issues).toEqual([]);
  });

  it('is in canonical form', () => {
    expect(serializeProject(example)).toBe(TEXT);
  });

  it("frames the whole map as the deck's camera did", () => {
    // PolycrisisPresentation src/map/camera.ts FULL_CAMERA, read from the deck by the converter.
    expect(example.layout.home).toEqual({ x: 960, y: 478, zoom: 0.9 });
  });

  it('keeps the whole map, its types, loops and sources', () => {
    expect(example.variables).toHaveLength(41);
    expect(example.links).toHaveLength(132);
    expect(example.loops).toHaveLength(18);
    expect(example.sources).toHaveLength(14);
    expect(example.types.categories.map((c) => `${c.id} ${c.colour}`)).toEqual([
      'earth #5ECBA9',
      'energy #F2B36B',
      'economy #F6D36C',
      'governance #C5A6FF',
      'society #F0919C',
      'technology #87C9F4',
      'response #A5E88A',
    ]);
    expect(example.types.roles.map((r) => `${r.id} ${r.shape}`)).toEqual([
      'stress rounded-square',
      'trigger circle',
      'crisis octagon',
      'intervention ring',
    ]);
    expect(example.types.roles.filter((r) => r.response).map((r) => r.id)).toEqual(['intervention']);
    expect(example.types.linkTypes.filter((t) => t.optional).map((t) => t.id)).toEqual(['side_effect']);
    // Every citation of the deck's map.json, with its page: 319 on variables and links.
    const citations = [...example.variables, ...example.links].flatMap((x) => x.citations);
    expect(citations).toHaveLength(319);
    expect(citations.every((c) => /^\d+$/.test(c.pages ?? ''))).toBe(true);
    expect(example.links.filter((l) => l.conditional)).toHaveLength(106);
    expect(example.links.filter((l) => l.fields?.evidence === 'explicit')).toHaveLength(79);
  });

  // The deck's content/derived/loops.json (map version 0.3), whose loop counts leave side-effect links out.
  it('counts the same loops of up to six links as the deck', () => {
    expect(counts(loopStats(example, { maxLength: 6 }))).toEqual({
      count: 342,
      reinforcing: 323,
      balancing: 19,
      unknown: 0,
      byLength: { 2: 14, 3: 14, 4: 23, 5: 79, 6: 212 },
      capped: false,
    });
  });

  it('counts every loop, and the loops on explicit links only, as the deck does', () => {
    const all = allLoops();
    expect([all.count, all.reinforcing, all.balancing, all.capped]).toEqual([
      5_636_759,
      3_698_955,
      1_937_804,
      false,
    ]);
    expect(loopStats(example, { filter: (l) => l.fields?.evidence === 'explicit' }).count).toBe(2373);
  });

  it('lists the references as the deck does', () => {
    const refs = referenceList(example);
    const authors = refs.map((r) => r.source.apa.split(/[,.]/)[0]);
    expect(authors.slice(0, 3)).toEqual(['Brosig', 'Collste', 'Delannoy']);
    expect(authors.slice(-2)).toEqual(['Søgaard Jørgensen', 'World Economic Forum']);
    expect(refs.find((r) => r.source.id === 'J')?.parts.map((p) => p.source.id)).toEqual(['JS']);
    expect(refs.find((r) => r.source.id === 'RI')?.parts.map((p) => p.source.id)).toEqual(['RIS']);
    const all = refs.flatMap((r) => [r, ...r.parts]);
    expect(all).toHaveLength(14);
    for (const r of all)
      expect(r.scenes.length, `${r.source.id} is drawn on in some scene`).toBeGreaterThan(0);
  });

  it('keeps every step of the story but the fake title page', () => {
    expect(example.story.scenes.map((s) => `${s.id} ${s.steps.length}`)).toEqual([
      'S00 1',
      'S01 4',
      'S02 6',
      'S03 10',
      'S04 9',
      'S05 9',
      'S06 6',
      'S07 6',
      'S08 8',
      'S09 7',
      'S10 4',
    ]);
  });

  it('is cleaned up: no fake title page, no script, nothing personal to the presenter', () => {
    const lower = TEXT.toLowerCase();
    for (const word of [
      'fake title',
      'fake slide',
      'deadpan',
      'thrown together',
      '[>]',
      // Speaker notes that spoke to the talk's own audience.
      'this room',
      'the class knows',
      'to the room',
      'deflating the room',
    ]) {
      expect(lower, word).not.toContain(word);
    }
    const notes = (id: string) => example.story.scenes.find((s) => s.id === id)?.notes ?? '';
    expect(notes('S03')).toContain(
      'For an audience that knows causal-loop notation, five seconds on the legend is enough.',
    );
    expect(notes('S07')).toContain('Speak to the audience as fellow practitioners.');
    expect(example.story.scenes.some((s) => s.script !== undefined)).toBe(false);
    expect(example.meta).toEqual({
      title: 'Global Polycrisis - The Connections That Change Everything',
      description: expect.stringContaining('not a calibrated causal model'),
    });
    expect(step('S00', '1')).toMatchObject({
      label: 'Title page',
      cue: 'The title page; the network blooms behind it.',
      overlays: [
        { type: 'title', title: 'Global Polycrisis', subtitle: 'The connections that change everything' },
      ],
    });
    expect(step('S06', '4b').label).toBe('Where the traps show up on the map');
  });

  it('lists side-effect links where the deck showed them, so they stay hidden elsewhere', () => {
    expect(step('S08', '3c').map.links).toEqual({ base: 'ghost', focus: ['E128', 'E129', 'E080'] });
    // The deck showed the unnamed side-effect at the base level.
    expect(step('S09', '3').map.links?.ghost).toEqual(['E129']);
  });
});

// Words such as the presenter's name are listed only on this machine (privateWords in .local.json), so
// that the repository never contains them; where they are set, the example must not contain them either.
const PRIVATE_WORDS = privateWords();
describe.skipIf(PRIVATE_WORDS.length === 0)('the private words kept outside the repository', () => {
  it('appear nowhere in the example', () => {
    const lower = TEXT.toLowerCase();
    // Counted rather than listed, so a failure never prints them.
    expect(PRIVATE_WORDS.filter((word) => lower.includes(word)).length).toBe(0);
  });
});

const deck = deckFolder([]);
const out = mkdtempSync(join(tmpdir(), 'loopweft-polycrisis-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

// The deck is private, so this runs only where it is available (LOOPWEFT_POLYCRISIS_DECK or .local.json).
describe.skipIf(!deck)('converting the deck itself', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const convert = (file: string) => {
    const run = spawnSync(
      process.execPath,
      ['packages/model/scripts/convert-polycrisis.ts', '--deck', deck as string, '--out', file],
      { cwd: root, encoding: 'utf8' },
    );
    expect(run.status, run.stderr).toBe(0);
    return readFileSync(file, 'utf8');
  };

  it('rebuilds the committed example byte for byte, every time', () => {
    const first = convert(join(out, 'first.loopweft'));
    const second = convert(join(out, 'second.loopweft'));
    expect(second).toBe(first);
    expect(first).toBe(TEXT);
  });

  it("matches the deck's own loop counts", () => {
    const saved = JSON.parse(readFileSync(join(deck as string, 'content/derived/loops.json'), 'utf8')) as {
      total: { loops: number; reinforcing: number; balancing: number };
      up_to_6_links: {
        loops: number;
        reinforcing: number;
        balancing: number;
        by_length: Record<string, number>;
      };
      explicit_links_only: { loops: number };
    };
    const short = loopStats(example, { maxLength: 6 });
    expect([short.count, short.reinforcing, short.balancing]).toEqual([
      saved.up_to_6_links.loops,
      saved.up_to_6_links.reinforcing,
      saved.up_to_6_links.balancing,
    ]);
    expect(Object.fromEntries(Object.entries(short.byLength).map(([k, v]) => [String(k), v]))).toEqual(
      saved.up_to_6_links.by_length,
    );
    const all = allLoops();
    expect([all.count, all.reinforcing, all.balancing]).toEqual([
      saved.total.loops,
      saved.total.reinforcing,
      saved.total.balancing,
    ]);
    expect(loopStats(example, { filter: (l) => l.fields?.evidence === 'explicit' }).count).toBe(
      saved.explicit_links_only.loops,
    );
  });
});

describe('the polycrisis converter', () => {
  const { project, notes } = convertPolycrisis(miniDeck(), MINI_CLEANUP);

  it('converts the map: variables, links, types, layout, loops and sources', () => {
    expect(project.variables).toEqual([
      {
        id: 'heat',
        label: 'Heat',
        category: 'earth',
        role: 'stress',
        definition: 'How hot.',
        citations: [{ source: 'A', pages: '3' }],
      },
      {
        id: 'crops',
        label: 'Crop losses',
        mapLabel: 'Crop\nlosses',
        category: 'earth',
        role: 'crisis',
        definition: 'Harvests lost.',
        size: 'large',
        citations: [{ source: 'A', pages: '4' }],
      },
      {
        id: 'help',
        label: 'Help',
        category: 'response',
        role: 'intervention',
        definition: 'Support.',
        citations: [],
      },
    ]);
    expect(project.links[0]).toEqual({
      id: 'E1',
      from: 'heat',
      to: 'crops',
      sign: '+',
      type: 'cascade',
      conditional: true,
      rationale: 'Heat damages crops.',
      fields: { evidence: 'explicit' },
      citations: [
        { source: 'A', pages: '4' },
        { source: 'AS', pages: '2' },
      ],
    });
    expect(project.links[1]).not.toHaveProperty('conditional');
    expect(project.types.linkTypes[1]).toEqual({
      id: 'side_effect',
      name: 'Side-effect',
      description: 'A documented possible side-effect of a response, shown only where a step names it.',
      style: 'dotted',
      marker: 'flag',
      optional: true,
    });
    expect(project.types.fields[0]?.options).toEqual([
      { id: 'explicit', name: 'Explicit', description: 'Stated in the source.' },
      { id: 'synthesis', name: 'Synthesis', description: 'Combined from claims.' },
    ]);
    expect(project.layout.positions.heat).toEqual({ x: 300, y: 300, labelSide: 'above' });
    expect(project.layout.groups).toEqual([
      {
        id: 'earth',
        category: 'earth',
        label: 'EARTH',
        halo: { x: 400, y: 300, r: 200 },
        labelAt: { x: 400, y: 80 },
      },
      { id: 'response', category: 'response', label: 'RESPONSE' },
      { id: 'hub', halo: { x: 500, y: 300, r: 100 } },
    ]);
    // The two-variable loop is ordered as a chain from its first variable.
    expect(project.loops.map((l) => l.links)).toEqual([
      ['E1', 'E2'],
      ['E2', 'E1'],
    ]);
    expect(project.loops[1]?.archetype).toBe('Fixes that fail');
    expect(project.sources).toEqual([
      { id: 'A', label: 'A (2020)', apa: 'A, B. (2020). *A made-up source*. Test Press.', doi: '10.1234/a' },
      {
        id: 'AS',
        apa: 'A, B. (2020). *Its supplement*. Test Press.',
        licence: 'CC BY 4.0',
        summary: 'The supplement.',
        partOf: 'A',
      },
    ]);
  });

  it('converts the story, applying the clean-up', () => {
    const [title, story] = project.story.scenes;
    expect(title).toEqual({
      id: 'S00',
      title: 'Title page',
      headline: 'Test talk.',
      notes: '- Behind the title, pulses wander.\n\nKey facts:\n- A fact.',
      sources: [],
      steps: [
        {
          id: '1',
          label: 'Title page',
          cue: 'The title page.',
          map: { opacity: 0.7, variables: { base: 'dim' }, labels: 'none' },
          overlays: [{ type: 'title', title: 'Test talk', subtitle: 'A subtitle' }],
        },
      ],
    });
    expect(story?.targetSeconds).toBe(60);
    expect(story?.notes).toBe('Tone: Calm.\n\n- Name it.\n- Say what it is.');
    const [legend, pulse, side] = story?.steps ?? [];
    expect(legend?.overlays).toEqual([
      { type: 'legend', citations: [{ source: 'A', pages: '1' }] },
      { type: 'caption' },
    ]);
    expect(legend?.map).toEqual({
      variables: { base: 'normal' },
      links: { base: 'dim' },
      labels: 'none',
      categoryLabels: true,
    });
    expect(pulse).toMatchObject({ at: 10, cue: 'Heat → crops. Hold.' });
    expect(pulse?.map).toMatchObject({
      camera: { fit: ['heat', 'crops'], frame: 'inset' },
      variables: { base: 'dim', focus: ['heat', 'crops'] },
      // E1 was dim and active: the higher level stays; repeats go.
      links: { base: 'ghost', active: ['E1', 'E2'] },
      labels: 'focus',
    });
    expect(pulse?.overlays).toEqual([
      {
        // The deck's panel of mechanisms, with their icons: a compact grid at the top right, as in the deck.
        type: 'cards',
        items: [
          { title: 'Common stresses', icon: 'common-stress' },
          { title: 'Domino effects', icon: 'domino' },
        ],
        active: [1],
        place: 'top-right',
        citations: [{ source: 'A', pages: '2' }],
      },
      {
        type: 'cards',
        title: 'Lenses',
        items: [{ title: 'One', sub: 'first' }, { title: 'Two' }],
        active: [1],
      },
      { type: 'caption' },
    ]);
    // sideEffects: the unnamed side-effect E4 is listed at the base level, as the deck showed it.
    expect(side?.map.links).toEqual({ base: 'ghost', ghost: ['E4'], focus: ['E3'] });
    expect(side?.overlays).toEqual([
      { type: 'statement', lines: ['A line.'], style: 'note', place: 'bottom-left' },
      {
        // Leverage at depth: the deck drew icons in place of numbers, later cards taking the last one.
        type: 'cards',
        title: 'Depth',
        items: [
          { title: 'Break', icon: 'broken-link' },
          { title: 'Balance', icon: 'balancing' },
          { title: 'Root', icon: 'root' },
          { title: 'Deeper', icon: 'root' },
        ],
      },
      { type: 'caption' },
    ]);
  });

  it("keeps the deck's curve for the links the clean-up names, beside the bends it set by hand", () => {
    expect(project.layout.bends).toEqual({ E2: 0.18, E4: -0.2 });
    expect(notes).toContain("Kept the deck's curves for 1 links that crossing refinement would re-bend: E2.");
    expect(() => convertPolycrisis(miniDeck(), { ...MINI_CLEANUP, deckBends: ['E9'] })).toThrow(
      'Clean-up rules that no longer match the deck: no link E9 to keep',
    );
  });

  it("takes the whole-map view from the deck's camera", () => {
    expect(project.layout.home).toEqual({ x: 950, y: 470, zoom: 0.85 });
    expect(notes).toContain("Took the whole-map view from the deck's camera: centre (950, 470), zoom 0.85.");
  });

  it('says what it left out and reworded', () => {
    expect(notes).toContain('Left out build S00.1: the fake title page.');
    expect(notes).toContain("Reworded 1 speaker-note line(s) of S01 that addressed the talk's own audience.");
    expect(notes).toContain('Left out the one-off visual "counter" (it stays in the deck) on S01.3.');
  });

  it('gives the same bytes for the same deck', () => {
    expect(serializeProject(convertPolycrisis(miniDeck(), MINI_CLEANUP).project)).toBe(
      serializeProject(project),
    );
  });

  it('stops when the deck no longer matches a clean-up rule', () => {
    const renamed = miniDeck();
    (renamed.scenes[0]?.builds[1] as { label: string }).label = 'Title';
    expect(() => convertPolycrisis(renamed, MINI_CLEANUP)).toThrow(
      'S00.2: the label to rewrite has changed: Title',
    );
    const gone = miniDeck();
    gone.scenes[0]?.builds.splice(0, 1);
    expect(() => convertPolycrisis(gone, MINI_CLEANUP)).toThrow(
      'Clean-up rules that no longer match the deck: drop S00.1',
    );
    const edited = miniDeck();
    (edited.narration.scenes[1] as { guided: string[] }).guided[1] = 'This room knows it well.';
    expect(() => convertPolycrisis(edited, MINI_CLEANUP)).toThrow(
      'Clean-up rules that no longer match the deck: reword S01 This room knows it.',
    );
  });

  it('stops on anything it cannot convert or should have cleaned up', () => {
    const odd = miniDeck();
    (odd.scenes[1]?.builds[0] as { viz: object }).viz = { hologram: true };
    expect(() => convertPolycrisis(odd, MINI_CLEANUP)).toThrow(
      'S01.1: no conversion for the visual "hologram"',
    );
    const loud = miniDeck();
    loud.narration.scenes[1]?.guided.push('Say it deadpan.');
    expect(() => convertPolycrisis(loud, MINI_CLEANUP)).toThrow(
      'The converted project still contains: deadpan',
    );
    const scaled = miniDeck();
    (scaled.map.nodes[0] as { scale: string }).scale = 'local';
    expect(() => convertPolycrisis(scaled, MINI_CLEANUP)).toThrow('Node scales are local, global');
  });
});
