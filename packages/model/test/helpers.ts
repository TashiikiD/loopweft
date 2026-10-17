import { readFileSync } from 'node:fs';
import { type Project, type ProjectInput, parseProject } from '../src/index.ts';

/** A 1×1 transparent PNG. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Test data, not a real map: the textbook population loops, with every part of the format in use. The
 * source is fictitious and says so.
 */
export function richInput(): ProjectInput {
  return {
    format: 'loopweft',
    version: 1,
    meta: { title: 'Population (test project)', description: 'Test data for the format tests.' },
    theme: { base: 'light', fonts: { heading: 'Fraunces', body: 'Inter' } },
    types: {
      categories: [
        { id: 'people', name: 'People', colour: '#5ECBA9' },
        { id: 'health', name: 'Health' },
      ],
      roles: [
        { id: 'stock', name: 'Stock', shape: 'rounded-square' },
        { id: 'flow', name: 'Flow', shape: 'circle' },
      ],
      linkTypes: [
        { id: 'main', name: 'Main' },
        { id: 'side', name: 'Side-effect', style: 'dotted', marker: 'flag', optional: true },
      ],
      fields: [
        {
          id: 'evidence',
          name: 'Evidence',
          kind: 'choice',
          appliesTo: 'links',
          options: [
            { id: 'explicit', name: 'Explicit' },
            { id: 'synthesis', name: 'Synthesis' },
          ],
        },
        { id: 'unit', name: 'Unit', kind: 'text', appliesTo: 'variables' },
      ],
    },
    variables: [
      {
        id: 'births',
        label: 'Births',
        category: 'people',
        role: 'flow',
        citations: [{ source: 'T', pages: '3' }],
      },
      {
        id: 'population',
        label: 'Population',
        mapLabel: 'Popu-\nlation',
        category: 'people',
        role: 'stock',
        definition: 'How many people live in the region.',
        size: 'large',
        fields: { unit: 'people' },
        citations: [],
      },
      { id: 'deaths', label: 'Deaths', category: 'health', role: 'flow', citations: [] },
    ],
    links: [
      {
        id: 'L1',
        from: 'births',
        to: 'population',
        sign: '+',
        type: 'main',
        rationale: 'Each birth adds a person.',
        fields: { evidence: 'explicit' },
        citations: [{ source: 'T', pages: '4–5', strength: 'strong' }],
      },
      {
        id: 'L2',
        from: 'population',
        to: 'births',
        sign: '+',
        type: 'main',
        delay: true,
        delayLabel: '20 yrs',
        confidence: 'high',
        weight: 2,
        citations: [{ source: 'T' }],
      },
      { id: 'L3', from: 'population', to: 'deaths', sign: '+', type: 'main', citations: [{ source: 'TS' }] },
      {
        id: 'L4',
        from: 'deaths',
        to: 'population',
        sign: '-',
        type: 'main',
        conditional: true,
        citations: [{ source: 'T', note: 'Fig. 2' }],
      },
      { id: 'L5', from: 'deaths', to: 'births', sign: '?', type: 'side', citations: [] },
    ],
    layout: {
      positions: {
        population: { x: 500, y: 300, labelSide: 'below', pinned: true },
        births: { x: 300, y: 300 },
        deaths: { x: 700, y: 300, labelSide: 'right' },
      },
      groups: [
        {
          id: 'people',
          category: 'people',
          label: 'PEOPLE',
          halo: { x: 400, y: 300, r: 180 },
          labelAt: { x: 400, y: 120 },
        },
      ],
      bends: { L4: -0.2 },
    },
    loops: [
      {
        id: 'R1',
        name: 'Births grow the population',
        links: ['L1', 'L2'],
        citations: [{ source: 'T', pages: '4' }],
      },
      { id: 'B1', name: 'Deaths shrink it', links: ['L3', 'L4'], caution: 'Test data.', citations: [] },
    ],
    sources: [
      {
        id: 'T',
        label: 'Test (2020)',
        apa: 'Test, A. (2020). *A fictitious source for tests*. Test Press.',
        doi: '10.1234/test.1',
      },
      {
        id: 'TS',
        apa: 'Test, A. (2020). *Supplement to a fictitious source* [Supplementary material]. Test Press.',
        url: 'https://example.org/supplement',
        licence: 'CC BY 4.0',
        summary: 'The supplement.',
        partOf: 'T',
      },
    ],
    story: {
      scenes: [
        {
          id: 'S1',
          title: 'Growth',
          headline: 'Births feed the population, which feeds births.',
          targetSeconds: 60,
          notes: '- Say it slowly.',
          sources: ['T'],
          steps: [
            {
              id: '1',
              label: 'The map',
              at: 0,
              cue: 'The whole map.',
              map: {
                variables: { base: 'normal' },
                links: { base: 'dim' },
                labels: 'all',
                categoryLabels: true,
              },
              overlays: [{ type: 'title', title: 'Population', subtitle: 'A test' }],
            },
            {
              id: '2',
              label: 'The loop',
              at: 20,
              map: {
                camera: { fit: ['births', 'population'], frame: 'right', maxZoom: 2 },
                variables: { base: 'dim', focus: ['births', 'population'] },
                links: { base: 'ghost', active: ['L1', 'L2'] },
                labels: 'focus',
                labelText: { births: 'BIRTHS' },
                trends: { births: 'up', population: 'up' },
                loops: ['R1'],
                loopNames: ['R1'],
                reveal: { mode: 'draw', sequence: ['births', 'L1'], stagger: 0.4, delay: 0.5 },
                pulses: { hops: [['L1'], ['L2']], repeat: 1, tone: 'harm' },
                clusters: 'dim',
                minimap: false,
              },
              overlays: [
                { type: 'caption' },
                { type: 'statement', lines: ['A reinforcing loop.'], style: 'question', place: 'bottom' },
                {
                  type: 'cards',
                  title: 'Two loops',
                  items: [{ title: 'R1', sub: 'Births' }, { title: 'B1' }],
                  active: [0],
                  citations: [{ source: 'T' }],
                },
                { type: 'legend', place: 'top-right' },
                { type: 'image', asset: 'chart', alt: 'A tiny chart', credit: 'Test' },
              ],
            },
            {
              id: '3',
              label: 'Hold',
              map: {
                opacity: 0.6,
                ambient: { from: ['births'], tone: 'harm', every: [1, 2], hops: [2, 4], delay: 1 },
              },
            },
          ],
        },
      ],
    },
    assets: { chart: TINY_PNG },
  };
}

/** The rich test project, parsed (throws if it is invalid). */
export function richProject(): Project {
  const result = parseProject(richInput());
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}

/**
 * Edits a JSON document in place by dotted paths: `{ 'links.0.sign': 'plus' }` sets a value, `undefined`
 * deletes it, and a final `+` appends to a list (`'story.scenes.0.steps.0.overlays.+': {...}`).
 */
export function edit<T>(document: T, changes: Record<string, unknown>): T {
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split('.');
    const last = keys.pop() as string;
    let target = document as unknown as Record<string, unknown>;
    for (const key of keys) {
      const next = target[key];
      if (typeof next !== 'object' || next === null) throw new Error(`edit: nothing at "${key}" in ${path}`);
      target = next as Record<string, unknown>;
    }
    if (last === '+') (target as unknown as unknown[]).push(value);
    else if (value === undefined) delete target[last];
    else target[last] = value;
  }
  return document;
}

/** Parses the rich test project with some changes made to its input (see `edit`). */
export const parseChanged = (changes: Record<string, unknown>) => parseProject(edit(richInput(), changes));

export const repoFile = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
