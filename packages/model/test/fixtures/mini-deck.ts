// A tiny deck in the polycrisis deck's shapes, so the converter's rules are tested everywhere (the real deck
// is private and not on CI). Test data: the map, sources and talk are made up and say so.
import type { Cleanup, PolycrisisDeck } from '../../src/importers/polycrisis.ts';
import { TINY_PNG } from '../helpers.ts';

export function miniDeck(): PolycrisisDeck {
  return {
    map: {
      title: 'Test map',
      epistemic_status: 'A made-up map for tests, not a model.',
      scope: 'Test scope.',
      source_documents: { A: {}, AS: {} },
      domains: {
        earth: { label: 'Earth', colour: '#5ECBA9' },
        response: { label: 'Response', colour: '#A5E88A' },
      },
      evidence_levels: { explicit: 'Stated in the source.', synthesis: 'Combined from claims.' },
      edge_mechanisms: ['cascade', 'side_effect'],
      nodes: [
        {
          id: 'heat',
          label: 'Heat',
          domain: 'earth',
          definition: 'How hot.',
          source_pages: [{ source_id: 'A', page: 3 }],
          scale: 'global',
          role: 'stress',
        },
        {
          id: 'crops',
          label: 'Crop losses',
          domain: 'earth',
          definition: 'Harvests lost.',
          source_pages: [{ source_id: 'A', page: 4 }],
          scale: 'global',
          role: 'crisis',
        },
        {
          id: 'help',
          label: 'Help',
          domain: 'response',
          definition: 'Support.',
          source_pages: [],
          scale: 'global',
          role: 'intervention',
        },
      ],
      edges: [
        {
          id: 'E1',
          source: 'heat',
          target: 'crops',
          polarity: '+',
          mechanism: 'cascade',
          evidence: 'explicit',
          conditional: true,
          rationale: 'Heat damages crops.',
          sources: [
            { source_id: 'A', page: 4 },
            { source_id: 'AS', page: 2 },
          ],
        },
        {
          id: 'E2',
          source: 'crops',
          target: 'heat',
          polarity: '+',
          mechanism: 'cascade',
          evidence: 'synthesis',
          conditional: false,
          rationale: 'A test loop.',
          sources: [{ source_id: 'A', page: 5 }],
        },
        {
          id: 'E3',
          source: 'help',
          target: 'crops',
          polarity: '-',
          mechanism: 'cascade',
          evidence: 'explicit',
          conditional: false,
          rationale: 'Help reduces losses.',
          sources: [{ source_id: 'A', page: 6 }],
        },
        {
          id: 'E4',
          source: 'help',
          target: 'heat',
          polarity: '+',
          mechanism: 'side_effect',
          evidence: 'synthesis',
          conditional: true,
          rationale: 'A possible side-effect.',
          sources: [{ source_id: 'A', page: 7 }],
        },
      ],
      feedback_loops: [
        {
          id: 'R1',
          title: 'Heat and crops',
          nodes: ['heat', 'crops'],
          interpretation: 'They feed each other.',
          source: { source_id: 'A', page: 8 },
          caution: 'A test.',
          edge_ids: ['E2', 'E1'],
        },
      ],
      loop_definitions: [
        {
          id: 'R2',
          title: 'Again',
          type: 'R',
          edge_ids: ['E2', 'E1'],
          sources: [{ source_id: 'A', page: 9 }],
          caution: 'Test.',
          archetype: 'Fixes that fail',
        },
      ],
    },
    layout: {
      hub: { x: 500, y: 300, r: 100 },
      clusters: {
        earth: { x: 400, y: 300, r: 200, label: 'EARTH', labelAt: { x: 400, y: 80 } },
        response: { label: 'RESPONSE' },
      },
      nodes: {
        heat: { x: 300, y: 300, label: 'Heat', labelPos: 'above' },
        crops: { x: 500, y: 300, label: 'Crop\nlosses' },
        help: { x: 700, y: 300, label: 'Help', labelPos: 'below' },
      },
      bends: { E4: -0.2 },
    },
    narration: {
      title: 'Test talk',
      sources: {
        A: {
          citation: 'A (2020)',
          apa: 'A, B. (2020). *A made-up source*. Test Press.',
          doi: 'https://doi.org/10.1234/a',
        },
        AS: {
          apa: 'A, B. (2020). *Its supplement*. Test Press.',
          part_of: 'A',
          claim: 'The supplement.',
          license: 'CC BY 4.0',
        },
      },
      scenes: [
        {
          id: 'S00',
          target_seconds: 0,
          guided: ['Untimed. The fake title page holds.', 'Behind the title, pulses wander.'],
          key_facts: ['A fact.'],
          tone: 'On the fake slide: deadpan.',
          sources: [],
        },
        {
          id: 'S01',
          target_seconds: 60,
          guided: ['Name it.', 'This room knows it.'],
          key_facts: [],
          tone: 'Calm.',
          sources: ['A'],
        },
      ],
    },
    visuals: {
      legend: {
        roles: [
          { role: 'stress', label: 'Stress' },
          { role: 'crisis', label: 'Crisis' },
          { role: 'intervention', label: 'Response' },
        ],
        source: { source_id: 'A', page: 1 },
      },
      title: { title: 'Test talk', subtitle: 'A subtitle' },
      mechanisms: {
        items: [
          { id: 'stress', title: 'Common stresses' },
          { id: 'domino', title: 'Domino effects' },
        ],
        source: { source_id: 'A', page: 2 },
      },
      cards: {
        lenses: { title: 'Lenses', items: [{ title: 'One', sub: 'first' }, { title: 'Two' }] },
        depth: {
          title: 'Depth',
          items: [{ title: 'Break' }, { title: 'Balance' }, { title: 'Root' }, { title: 'Deeper' }],
        },
      },
      // Another study's figure (a 1×1 test image), which no build shows unless a test says so.
      cameo: {
        image: 'media/test-figure.png',
        caption: 'A test figure: 1 pixel',
        credit: 'Fig. 1, a made-up study · CC BY 4.0',
        alt: 'A one-pixel test image',
        source: { source_id: 'A', page: 4 },
      },
    },
    media: {
      'media/test-figure.png': Uint8Array.from(atob(TINY_PNG.split(',')[1] as string), (c) =>
        c.charCodeAt(0),
      ),
    },
    hubNodes: ['crops'],
    // As the deck's own code bends each link (E4 set by hand in its layout).
    bends: { E1: 0.12, E2: 0.18, E3: 0.12, E4: -0.2 },
    // A whole-map view set by hand, as the deck's camera has one.
    camera: { cx: 950, cy: 470, zoom: 0.85 },
    scenes: [
      {
        id: 'S00',
        number: 0,
        title: 'Title page',
        headline: 'Test talk.',
        overlay: 'caption',
        builds: [
          {
            key: 'S00.1',
            id: '1',
            label: 'Fake title page',
            cue: { at: 0, text: 'Fake.' },
            extraCues: [],
            caption: 'hide',
            map: { show: false },
            viz: { decoy: true },
          },
          {
            key: 'S00.2',
            id: '2',
            label: 'Title page · the real one',
            cue: { at: 0, text: 'The real title page cuts in.' },
            extraCues: [],
            caption: 'hide',
            map: { nodeBase: 'dim', opacity: 0.7 },
            viz: { title: true },
          },
        ],
      },
      {
        id: 'S01',
        number: 1,
        title: 'Heat',
        headline: 'Heat harms crops.',
        overlay: 'caption',
        builds: [
          {
            key: 'S01.1',
            id: '1',
            label: 'Legend',
            cue: { at: 0, text: 'The map.' },
            extraCues: [],
            map: { nodeBase: 'normal', edgeBase: 'dim', domainLabels: true },
            viz: { legend: true },
          },
          {
            key: 'S01.2',
            id: '2',
            label: 'Pulse',
            cue: { at: 10, text: 'Heat → crops.' },
            extraCues: [{ at: 20, text: 'Hold.' }],
            map: {
              nodeBase: 'dim',
              edgeBase: 'ghost',
              nodes: { focus: ['heat', 'crops'] },
              edges: { dim: ['E1'], active: ['E1', 'E2', 'E2'] },
              trends: { heat: 'up', crops: 'up' },
              pulses: { hops: [['E1'], ['E2']] },
              camera: { fit: ['heat', 'crops'], frame: 'core' },
              labels: 'focus',
            },
            viz: { mechanisms: { active: 'domino' }, cards: { set: 'lenses', active: [1] } },
          },
          {
            key: 'S01.3',
            id: '3',
            label: 'Side-effect',
            cue: { at: 30, text: 'A side-effect.' },
            extraCues: [],
            map: { edgeBase: 'ghost', sideEffects: true, edges: { focus: ['E3'] } },
            viz: {
              statement: { lines: ['A line.'], style: 'note', place: 'lower-left' },
              counter: { stage: 'R1' },
              cards: { set: 'depth' },
            },
          },
        ],
      },
    ],
  };
}

export const MINI_CLEANUP: Cleanup = {
  dropBuilds: { 'S00.1': 'the fake title page' },
  renumber: { 'S00.2': '1' },
  rewrite: {
    'S00.2': {
      label: ['Title page · the real one', 'Title page'],
      cue: ['The real title page cuts in.', 'The title page.'],
    },
  },
  dropNotes: { S00: ['Untimed. The fake title page'] },
  dropTone: ['S00'],
  rewordNotes: {
    S01: {
      lines: [['This room knows it.', 'Say what it is.']],
      why: "that addressed the talk's own audience",
    },
  },
  deckBends: ['E2'],
  correctSources: {},
  banned: ['fake', 'deadpan', 'this room'],
};
