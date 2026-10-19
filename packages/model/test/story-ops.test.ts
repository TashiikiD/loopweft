// The story's operations: scenes, steps, what a step's map shows, overlays and embedded images, and the
// story checks they are written against.
import { describe, expect, it } from 'vitest';
import {
  addAsset,
  addOverlay,
  addPulseHop,
  addScene,
  addStep,
  checkProject,
  copyStep,
  imageDataUri,
  imageType,
  moveOverlay,
  moveScene,
  moveStep,
  nextSceneId,
  nextStepId,
  OpError,
  type Project,
  pulseRoundLoop,
  removeAsset,
  removeOverlay,
  removeScene,
  removeStep,
  resolveScene,
  resolveStep,
  scriptSegments,
  setAsset,
  setOverlay,
  setScene,
  setStep,
  setStepBase,
  setStepLevel,
  setStepLoops,
  setStepMap,
  setStepTrend,
  spreadTrend,
  withLevel,
} from '../src/index.ts';
import { richProject, TINY_PNG } from './helpers.ts';

function refused(run: () => unknown): OpError {
  try {
    run();
  } catch (error) {
    if (error instanceof OpError) return error;
    throw error;
  }
  throw new Error('expected the operation to refuse');
}

const stepOf = (project: Project, ref: string) => resolveStep(project, ref).step;
const warnings = (project: Project, code: string) =>
  checkProject(project)
    .filter((i) => i.code === code)
    .map((i) => i.message);

describe('naming scenes and steps', () => {
  it('finds a scene by id or title and a step as <scene>.<step>, by id or label', () => {
    const p = richProject();
    expect(resolveScene(p, 'S1').index).toBe(0);
    expect(resolveScene(p, 'growth').scene.id).toBe('S1');
    expect(resolveStep(p, 'S1.2')).toMatchObject({ sceneIndex: 0, stepIndex: 1, key: 'S1.2' });
    expect(resolveStep(p, 'Growth.the loop').key).toBe('S1.2');
    expect(refused(() => resolveStep(p, 'S1')).kind).toBe('usage');
    expect(refused(() => resolveStep(p, 'S1.9')).message).toBe(
      'No step "9" in scene S1 (it has S1.1, S1.2 and S1.3).',
    );
    expect(refused(() => resolveScene(p, 'S2')).message).toContain('No scene "S2"');
  });

  it('chooses the next ids: S<n> padded as the others are, and whole-number steps', () => {
    const p = richProject();
    expect(nextSceneId(p)).toBe('S2');
    p.story.scenes = [{ ...(p.story.scenes[0] as Project['story']['scenes'][number]), id: 'S09' }];
    expect(nextSceneId(p)).toBe('S10');
    expect(nextSceneId({ ...p, story: { scenes: [] } })).toBe('S1');
    expect(nextStepId({ steps: [{ id: '1' }, { id: '2a' }, { id: '4' }] as never })).toBe('5');
    expect(nextStepId({ steps: [] })).toBe('1');
  });
});

describe('scenes', () => {
  it('adds a scene at the end or at a place, with the next id, and checks its sources', () => {
    const out = addScene(richProject(), { title: 'Limits', targetSeconds: 45, sources: ['T'] });
    expect(out.result).toEqual({ id: 'S2', index: 1 });
    expect(out.summary).toBe('Added scene S2 ("Limits"), scene 2 of 2.');
    expect(out.project.story.scenes[1]).toEqual({
      id: 'S2',
      title: 'Limits',
      targetSeconds: 45,
      sources: ['T'],
      steps: [],
    });
    expect(addScene(richProject(), { title: 'Opening' }, { before: 'S1' }).result.index).toBe(0);
    expect(refused(() => addScene(richProject(), { title: 'X', sources: ['nope'] })).kind).toBe('invalid');
    expect(refused(() => addScene(richProject(), { id: 'S1', title: 'X' })).kind).toBe('conflict');
    expect(refused(() => addScene(richProject(), {} as never)).issues[0]).toMatchObject({
      code: 'missingField',
      path: ['story', 'scenes', 1, 'title'],
    });
  });

  it('changes a scene, keeping its id and steps', () => {
    const out = setScene(richProject(), 'S1', { headline: null, script: 'Hello [>] there [>] end' });
    expect(out.result.changed).toEqual(['headline', 'script']);
    expect(out.project.story.scenes[0]?.headline).toBeUndefined();
    expect(setScene(out.project, 'S1', { title: 'Growth' }).summary).toContain('Nothing to change');
    expect(refused(() => setScene(richProject(), 'S1', { id: 'S9' } as never)).kind).toBe('usage');
  });

  it('removes a scene with steps only with cascade, and moves scenes', () => {
    expect(refused(() => removeScene(richProject(), 'S1')).message).toBe(
      'Scene S1 has 3 steps. Move them to another scene first, or remove the scene with cascade to remove them too.',
    );
    const removed = removeScene(richProject(), 'S1', { cascade: true });
    expect(removed.project.story.scenes).toEqual([]);
    expect(removed.result.steps).toEqual(['S1.1', 'S1.2', 'S1.3']);

    const two = addScene(addScene(richProject(), { title: 'B' }).project, { title: 'C' }).project;
    const moved = moveScene(two, 'S3', { index: 0 });
    expect(moved.project.story.scenes.map((s) => s.id)).toEqual(['S3', 'S1', 'S2']);
    expect(moveScene(two, 'S1', { after: 'S3' }).project.story.scenes.map((s) => s.id)).toEqual([
      'S2',
      'S3',
      'S1',
    ]);
    expect(moveScene(two, 'S1', { index: 0 }).summary).toBe('Scene S1 is already there.');
    expect(refused(() => moveScene(two, 'S1', { before: 'S9' })).kind).toBe('notFound');
  });
});

describe('steps', () => {
  it('adds a step with its whole map, needing a label and a map, at a place', () => {
    const out = addStep(richProject(), 'S1', { label: 'Close', map: { labels: 'none' } });
    expect(out.result).toEqual({ key: 'S1.4', id: '4', index: 3 });
    expect(out.summary).toBe('Added step S1.4 ("Close"), step 4 of 4 in scene S1.');
    expect(stepOf(out.project, 'S1.4')).toEqual({
      id: '4',
      label: 'Close',
      map: { labels: 'none' },
      overlays: [],
    });
    expect(addStep(richProject(), 'S1', { label: 'First', map: {} }, { index: 0 }).result.index).toBe(0);
    expect(refused(() => addStep(richProject(), 'S1', { label: 'X' } as never)).kind).toBe('usage');
    expect(
      refused(() => addStep(richProject(), 'S1', { label: 'X', map: { trends: { nobody: 'up' } } })).kind,
    ).toBe('invalid');
    expect(refused(() => addStep(richProject(), 'S1', { id: '2', label: 'X', map: {} })).kind).toBe(
      'conflict',
    );
  });

  it('changes, removes, moves and copies steps', () => {
    const changed = setStep(richProject(), 'S1.1', { cue: null, at: 5 });
    expect(changed.result.changed).toEqual(['cue', 'at']);
    expect(stepOf(changed.project, 'S1.1').cue).toBeUndefined();

    expect(removeStep(richProject(), 'S1.2').project.story.scenes[0]?.steps.map((s) => s.id)).toEqual([
      '1',
      '3',
    ]);

    const within = moveStep(richProject(), 'S1.3', { before: '1' });
    expect(within.project.story.scenes[0]?.steps.map((s) => s.id)).toEqual(['3', '1', '2']);

    // To another scene: its id is taken there, so it gets that scene's next.
    const two = addStep(addScene(richProject(), { title: 'B' }).project, 'S2', {
      label: 'x',
      map: {},
    }).project;
    const across = moveStep(two, 'S1.1', { scene: 'S2' });
    expect(across.result).toEqual({ from: 'S1.1', key: 'S2.2', index: 1 });
    expect(across.summary).toContain('its id 1 was taken there, so it is now 2');

    const copy = copyStep(richProject(), 'S1.1', { label: 'The map again' });
    expect(copy.result).toMatchObject({ from: 'S1.1', key: 'S1.4', index: 1 });
    const copied = stepOf(copy.project, 'S1.4');
    expect({ ...copied, id: '1', label: 'The map' }).toEqual(stepOf(richProject(), 'S1.1'));
  });
});

describe('what a step shows', () => {
  it('moves elements between levels, and back to the base', () => {
    expect(withLevel({ base: 'dim', focus: ['a', 'b'] }, ['b', 'c'], 'active')).toEqual({
      base: 'dim',
      focus: ['a'],
      active: ['b', 'c'],
    });
    expect(withLevel({ focus: ['a'] }, ['a'], null)).toBeUndefined();

    const out = setStepLevel(richProject(), 'S1.2', 'variables', ['Deaths', 'births'], 'active');
    expect(stepOf(out.project, 'S1.2').map.variables).toEqual({
      base: 'dim',
      focus: ['population'],
      active: ['deaths', 'births'],
    });
    expect(out.summary).toBe('Step S1.2: deaths and births at active.');
    const back = setStepLevel(out.project, 'S1.2', 'links', ['L1'], null);
    expect(stepOf(back.project, 'S1.2').map.links).toEqual({ base: 'ghost', active: ['L2'] });
    expect(back.summary).toBe('Step S1.2: L1 at the base level (ghost).');
    expect(refused(() => setStepLevel(richProject(), 'S1.2', 'links', ['L9'], 'focus')).kind).toBe(
      'notFound',
    );

    const base = setStepBase(richProject(), 'S1.1', 'links', 'hidden');
    expect(stepOf(base.project, 'S1.1').map.links).toEqual({ base: 'hidden' });
  });

  it('marks trends, badges and names (a name needs its badge)', () => {
    const t = setStepTrend(richProject(), 'S1.2', ['deaths'], 'down');
    expect(stepOf(t.project, 'S1.2').map.trends).toEqual({ births: 'up', deaths: 'down', population: 'up' });
    expect(
      stepOf(setStepTrend(t.project, 'S1.2', ['births', 'population', 'deaths'], null).project, 'S1.2').map
        .trends,
    ).toBeUndefined();

    const named = setStepLoops(richProject(), 'S1.1', ['B1'], { name: true });
    expect(stepOf(named.project, 'S1.1').map).toMatchObject({ loops: ['B1'], loopNames: ['B1'] });
    const hidden = setStepLoops(richProject(), 'S1.2', ['R1'], { badge: false });
    expect(stepOf(hidden.project, 'S1.2').map.loops).toBeUndefined();
    expect(stepOf(hidden.project, 'S1.2').map.loopNames).toBeUndefined();
  });

  it('builds pulses hop by hop, or round a loop, keeping their timing', () => {
    const one = addPulseHop(richProject(), 'S1.1', ['L3']);
    const two = addPulseHop(one.project, 'S1.1', ['L4']);
    const joined = addPulseHop(two.project, 'S1.1', ['L1'], { join: true });
    expect(stepOf(joined.project, 'S1.1').map.pulses).toEqual({ hops: [['L3'], ['L4', 'L1']] });
    const round = pulseRoundLoop(richProject(), 'S1.2', 'B1');
    expect(stepOf(round.project, 'S1.2').map.pulses).toEqual({
      hops: [['L3'], ['L4']],
      repeat: 1,
      tone: 'harm',
    });
    expect(round.summary).toBe('Step S1.2: pulse round loop B1 (2 hops).');
  });

  it('spreads a what-if ▲/▼ by sign along the lit links only', () => {
    let p = setStepMap(richProject(), 'S1.2', { trends: null }).project;
    p = setStepLevel(p, 'S1.2', 'links', ['L3', 'L4'], 'focus').project;
    const out = spreadTrend(p, 'S1.2', 'deaths', 'up');
    // L4 (−) takes population down; L1 and L2 (+) carry that to births.
    expect(out.result.trends).toEqual({ deaths: 'up', population: 'down', births: 'down' });
    expect(out.summary).toBe('Step S1.2: deaths ▲, spread by sign along the lit links to 2 variables.');
    expect(warnings(out.project, 'trendContradictsSign')).toEqual([
      'Step S1.2: deaths is marked up, but L3 (+) from population (down) implies down.',
    ]);
  });

  it('refuses a map the format would refuse', () => {
    expect(refused(() => setStepMap(richProject(), 'S1.1', { opacity: 2 })).kind).toBe('invalid');
    expect(setStepMap(richProject(), 'S1.1', { labels: 'all' }).summary).toContain('Nothing to change');
  });
});

describe('overlays', () => {
  it('adds, changes, moves and removes overlays, keeping their types', () => {
    const added = addOverlay(richProject(), 'S1.3', { type: 'statement', lines: ['Hold.'] });
    expect(added.result).toEqual({ key: 'S1.3', index: 0, type: 'statement' });
    expect(added.summary).toBe('Step S1.3: added a statement (overlay 0).');
    const set = setOverlay(added.project, 'S1.3', 0, { kicker: 'NOTE', style: 'note' });
    expect(stepOf(set.project, 'S1.3').overlays[0]).toEqual({
      type: 'statement',
      lines: ['Hold.'],
      kicker: 'NOTE',
      style: 'note',
    });
    expect(refused(() => setOverlay(set.project, 'S1.3', 0, { type: 'cards' })).kind).toBe('usage');
    expect(refused(() => setOverlay(set.project, 'S1.3', 0, { lines: [] })).kind).toBe('invalid');
    expect(refused(() => setOverlay(set.project, 'S1.3', 3, {})).kind).toBe('notFound');
    expect(refused(() => addOverlay(richProject(), 'S1.2', { type: 'caption' })).kind).toBe('conflict');
    expect(
      refused(() =>
        addOverlay(richProject(), 'S1.2', { type: 'cards', items: [{ title: 'a' }], active: [3] }),
      ).kind,
    ).toBe('invalid');

    const moved = moveOverlay(richProject(), 'S1.2', 4, 0);
    expect(stepOf(moved.project, 'S1.2').overlays.map((o) => o.type)).toEqual([
      'image',
      'caption',
      'statement',
      'cards',
      'legend',
    ]);
    const removed = removeOverlay(richProject(), 'S1.2', 1);
    expect(stepOf(removed.project, 'S1.2').overlays.map((o) => o.type)).toEqual([
      'caption',
      'cards',
      'legend',
      'image',
    ]);
  });
});

describe('embedded images', () => {
  const pngBytes = () => Uint8Array.from(atob(TINY_PNG.split(',')[1] as string), (c) => c.charCodeAt(0));

  it('reads the image type from the bytes, never the name, and makes a data URI', () => {
    expect(imageType(pngBytes())).toBe('png');
    expect(imageDataUri(pngBytes())).toBe(TINY_PNG);
    expect(
      imageType(new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBe('svg+xml');
    expect(imageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(imageType(new TextEncoder().encode('GIF89a'))).toBe('gif');
    expect(imageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(refused(() => imageDataUri(new TextEncoder().encode('just text'), 'notes.png')).message).toBe(
      'notes.png is not a PNG, JPEG, GIF, WebP or SVG image.',
    );
  });

  it('embeds, replaces and removes images; one in use only with cascade', () => {
    const added = addAsset(richProject(), { data: TINY_PNG, name: 'Fig 5.png' });
    expect(added.result).toEqual({ id: 'fig_5' });
    expect(added.summary).toBe('Embedded image fig_5 (70 bytes).');
    expect(warnings(added.project, 'unusedAsset')).toEqual(['Image fig_5 is not shown on any step.']);
    expect(refused(() => addAsset(richProject(), { data: 'data:text/plain;base64,aGk=' })).kind).toBe(
      'invalid',
    );
    expect(refused(() => addAsset(richProject(), { data: TINY_PNG, id: 'chart' })).kind).toBe('conflict');

    expect(setAsset(richProject(), 'chart', TINY_PNG).summary).toContain('Nothing to change');
    expect(refused(() => removeAsset(richProject(), 'chart')).message).toBe(
      'Image chart is shown on 1 step (S1.2). Remove those overlays first, or remove it with cascade to remove them too.',
    );
    const gone = removeAsset(richProject(), 'chart', { cascade: true });
    expect(gone.project.assets).toEqual({});
    expect(stepOf(gone.project, 'S1.2').overlays.some((o) => o.type === 'image')).toBe(false);
  });
});

describe('story checks', () => {
  it('counts the script’s key marks: one per step after the first, and one to leave the scene', () => {
    expect(scriptSegments('One [>]  two\n[>]')).toEqual(['One', 'two', '']);
    // The last scene needs no mark to leave: three steps, two marks.
    expect(
      warnings(setScene(richProject(), 'S1', { script: 'a [>] b [>] c' }).project, 'scriptKeyMarks'),
    ).toEqual([]);
    expect(warnings(setScene(richProject(), 'S1', { script: 'a [>] b' }).project, 'scriptKeyMarks')).toEqual([
      'Scene S1: its script has 1 [>] key mark, but its 3 steps need 2 (one per step after the first).',
    ]);
    const two = addScene(setScene(richProject(), 'S1', { script: 'a [>] b [>] c' }).project, {
      title: 'B',
    }).project;
    expect(warnings(two, 'scriptKeyMarks')).toEqual([
      'Scene S1: its script has 2 [>] key marks, but its 3 steps need 3 (one per step after the first, and one to leave the scene).',
    ]);
  });

  it('flags steps due out of order or after the target', () => {
    let p = setStep(richProject(), 'S1.3', { at: 10 }).project;
    expect(warnings(p, 'stepTimeOrder')).toEqual(['Step S1.3 is due at 10 s, before step S1.2 (20 s).']);
    p = setStep(p, 'S1.3', { at: 75 }).project;
    expect(warnings(p, 'stepPastTarget')).toEqual([
      "Step S1.3 is due at 75 s, after the scene's target of 60 s.",
    ]);
  });

  it('flags a camera, reveal, ambient start or badge on something hidden', () => {
    let p = setStepLevel(richProject(), 'S1.2', 'variables', ['population'], 'hidden').project;
    p = setStepBase(p, 'S1.2', 'links', 'hidden').project;
    p = setStepLevel(p, 'S1.2', 'links', ['L1', 'L2'], null).project;
    p = setStepLevel(p, 'S1.3', 'variables', ['births'], 'hidden').project;
    p = setStepBase(p, 'S1.3', 'links', 'hidden').project;
    expect(warnings(p, 'fitHidden')).toEqual(['Step S1.2: the camera frames population, which is hidden.']);
    expect(warnings(p, 'revealHidden')).toEqual([
      'Step S1.2: the reveal sequence names L1, which is hidden.',
    ]);
    expect(warnings(p, 'ambientFromHidden')).toEqual([
      'Step S1.3: ambient pulses start at births, which is hidden.',
    ]);
    expect(warnings(p, 'badgeOnHiddenLoop')).toEqual([
      "Step S1.2: loop R1's badge shows, but its links L1 and L2 are hidden.",
    ]);
  });
});

describe('every story operation', () => {
  it('leaves its input untouched', () => {
    const p = richProject();
    const before = JSON.stringify(p);
    addScene(p, { title: 'X' });
    setScene(p, 'S1', { title: 'Y' });
    removeScene(p, 'S1', { cascade: true });
    addStep(p, 'S1', { label: 'X', map: {} });
    setStep(p, 'S1.1', { label: 'Y' });
    moveStep(p, 'S1.1', { index: 2 });
    copyStep(p, 'S1.2', { label: 'Z' });
    removeStep(p, 'S1.1');
    setStepLevel(p, 'S1.2', 'variables', ['deaths'], 'focus');
    setStepTrend(p, 'S1.2', ['deaths'], 'up');
    setStepLoops(p, 'S1.2', ['B1'], { name: true });
    addPulseHop(p, 'S1.2', ['L3']);
    pulseRoundLoop(p, 'S1.2', 'B1');
    spreadTrend(p, 'S1.2', 'births', 'down');
    addOverlay(p, 'S1.3', { type: 'legend' });
    setOverlay(p, 'S1.2', 1, { lines: ['Changed.'] });
    moveOverlay(p, 'S1.2', 0, 2);
    removeOverlay(p, 'S1.2', 0);
    addAsset(p, { data: TINY_PNG });
    removeAsset(p, 'chart', { cascade: true });
    expect(JSON.stringify(p)).toBe(before);
  });
});
