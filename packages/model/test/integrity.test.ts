import { describe, expect, it } from 'vitest';
import {
  checkProject,
  type Issue,
  type Project,
  parseProject,
  resolveLevels,
  sceneSources,
  stepSources,
} from '../src/index.ts';
import { edit, richInput, richProject } from './helpers.ts';

/** The warnings of the rich test project after some changes to its input. */
function warnings(changes: Record<string, unknown>): Issue[] {
  const result = parseProject(edit(richInput(), changes));
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.issues.filter((i) => i.severity === 'warning');
}

const codes = (issues: Issue[]) => issues.map((i) => `${i.code} ${i.path.join('.')}`);

/** The two warnings the test project carries on purpose. */
const BASELINE = ['uncitedLink links.4.citations', 'unknownSign links.4.sign'];

describe('evidence checks', () => {
  it('flags uncited links and unknown signs', () => {
    expect(checkProject(richProject())).toEqual([
      {
        severity: 'warning',
        code: 'uncitedLink',
        path: ['links', 4, 'citations'],
        message: 'Link L5 (deaths → births) cites no source.',
      },
      {
        severity: 'warning',
        code: 'unknownSign',
        path: ['links', 4, 'sign'],
        message:
          'Link L5 (deaths → births): its sign is unknown (?), so loops through it have no polarity and ripples stop there.',
      },
    ]);
  });

  it('flags loose ends: repeated names, citations and links, self-links, unused sources, empty scenes', () => {
    const found = warnings({
      'variables.2.label': 'BIRTHS',
      'variables.0.citations.+': { source: 'T', pages: '3' },
      'links.4.from': 'births',
      'links.4.to': 'births',
      'links.+': {
        id: 'L6',
        from: 'births',
        to: 'population',
        sign: '+',
        type: 'main',
        citations: [{ source: 'T' }],
      },
      'sources.+': { id: 'U', apa: 'Unused, A. (2021). *Never cited*.' },
      'story.scenes.+': { id: 'S2', title: 'Empty', steps: [] },
      'loops.+': { id: 'R2', name: 'Figure eight', links: ['L1', 'L2', 'L1', 'L2'] },
    });
    expect(codes(found)).toEqual([
      'duplicateCitation variables.0.citations.1',
      'duplicateLabel variables.2.label',
      ...BASELINE,
      'selfLink links.4.to',
      'duplicateLink links.5',
      'loopRevisits loops.2.links',
      'unusedSource sources.2',
      'emptyScene story.scenes.1.steps',
    ]);
    expect(found.find((i) => i.code === 'duplicateLabel')?.message).toBe(
      'Variables births and deaths are both called "BIRTHS"; names will not tell them apart.',
    );
  });

  it('counts a work as used when only its supplement is cited', () => {
    const found = warnings({
      'variables.0.citations': [],
      'links.0.citations': [{ source: 'TS' }],
      'links.1.citations': [{ source: 'TS' }],
      'links.3.citations': [{ source: 'TS' }],
      'loops.0.citations': [],
      'story.scenes.0.sources': [],
      'story.scenes.0.steps.1.overlays.2.citations': [],
    });
    expect(codes(found)).toEqual(BASELINE);
  });
});

describe('story checks', () => {
  const step = 'story.scenes.0.steps.1.map';

  it('flags ▲/▼ trends that contradict the signs of the lit links', () => {
    const found = warnings({ [`${step}.trends`]: { births: 'up', population: 'down' } });
    expect(found.slice(2)).toEqual([
      {
        severity: 'warning',
        code: 'trendContradictsSign',
        path: ['story', 'scenes', 0, 'steps', 1, 'map', 'trends', 'population'],
        message: 'Step S1.2: population is marked down, but L1 (+) from births (up) implies up.',
      },
      expect.objectContaining({
        code: 'trendContradictsSign',
        message: 'Step S1.2: births is marked up, but L2 (+) from population (down) implies down.',
      }),
    ]);
  });

  it('counts a response at the active level as rising', () => {
    const response = { 'variables.0.role': 'policy', [`${step}.trends`]: { population: 'down' } };
    const found = warnings({
      ...response,
      [`${step}.variables`]: { base: 'dim', focus: ['population'], active: ['births'] },
    });
    expect(found.slice(2).map((i) => i.message)).toEqual([
      'Step S1.2: population is marked down, but L1 (+) from births (an active response, so up) implies up.',
    ]);
    // At the focus level it is not assumed to move.
    expect(warnings(response).slice(2)).toEqual([]);
  });

  it('leaves ± (mixed) open, and ignores links that are not lit', () => {
    expect(warnings({ [`${step}.trends`]: { births: 'up', population: 'mixed' } }).slice(2)).toEqual([]);
    expect(
      warnings({
        [`${step}.links`]: { base: 'ghost', normal: ['L1', 'L2'] },
        [`${step}.trends`]: { births: 'up', population: 'down' },
      }).slice(2),
    ).toEqual([]);
  });

  it('flags pulses on links that are not visible, or that leave before anything arrives', () => {
    const found = warnings({ [`${step}.pulses`]: { hops: [['L1'], ['L4'], ['L5']] } });
    expect(codes(found.slice(2))).toEqual([
      `pulseOnHiddenLink ${step}.pulses.hops.1.0`,
      `pulseBeforeArrival ${step}.pulses.hops.1.0`,
      `pulseOnHiddenLink ${step}.pulses.hops.2.0`,
      `pulseBeforeArrival ${step}.pulses.hops.2.0`,
    ]);
    expect(found[2]?.message).toBe('Step S1.2: a pulse runs along L4, which is not visible.');
  });

  it('keeps links of an optional type hidden until a step lists them', () => {
    expect(
      warnings({ [`${step}.links.focus`]: ['L5'], [`${step}.pulses`]: { hops: [['L5']] } }).slice(2),
    ).toEqual([]);
  });

  it('flags loop names without badges, ids listed twice and trends on barely visible variables', () => {
    const found = warnings({
      [`${step}.loops`]: [],
      [`${step}.variables.active`]: ['births'],
      [`${step}.trends`]: { births: 'up', population: 'up', deaths: 'up' },
    });
    expect(codes(found.slice(2))).toEqual([
      `listedTwice ${step}.variables.active`,
      `trendBarelyVisible ${step}.trends.deaths`,
      `loopNameWithoutBadge ${step}.loopNames.0`,
    ]);
  });
});

describe('levels and sources of a step', () => {
  const project: Project = richProject();
  const [title, loop] = project.story.scenes[0]?.steps ?? [];

  it('resolves every level, raising the ends of visible links and hiding optional links', () => {
    const levels = resolveLevels(project, loop?.map ?? {});
    expect(Object.fromEntries(levels.variables)).toEqual({
      births: 'focus',
      population: 'focus',
      deaths: 'dim',
    });
    expect(Object.fromEntries(levels.links)).toEqual({
      L1: 'active',
      L2: 'active',
      L3: 'ghost',
      L4: 'ghost',
      L5: 'hidden',
    });
    expect(levels.litLinks).toEqual(['L1', 'L2']);
    expect(levels.litVariables).toEqual(['births', 'population']);
    const plain = resolveLevels(project, {});
    expect([...plain.variables.values()]).toEqual(['normal', 'normal', 'normal']);
    expect(plain.links.get('L5')).toBe('hidden');
  });

  it('lists the sources a step and a scene draw on', () => {
    expect(stepSources(project, loop as NonNullable<typeof loop>)).toEqual(['T']);
    expect(stepSources(project, title as NonNullable<typeof title>)).toEqual([]);
    expect(
      sceneSources(project, project.story.scenes[0] as NonNullable<Project['story']['scenes'][0]>),
    ).toEqual(['T']);
  });
});
