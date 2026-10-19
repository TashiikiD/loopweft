// The story's operations: scenes, steps, what a step's map shows, overlays and embedded images, and the
// story checks they are written against.
import { describe, expect, it, vi } from 'vitest';
import {
  addAsset,
  addOverlay,
  addPulseHop,
  addScene,
  addStep,
  checkProject,
  copyStep,
  imageDataUri,
  imageProblem,
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
  withLoops,
} from '../src/index.ts';
import { parseChanged, richProject, TINY_PNG } from './helpers.ts';

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

  it('finds a step through a scene title that has dots in it, and refuses a reference that names two', () => {
    const p = setScene(richProject(), 'S1', { title: 'Part 1. Growth' }).project;
    expect(resolveStep(p, 'Part 1. Growth.2').key).toBe('S1.2');
    expect(resolveStep(p, 'part 1. growth.The loop').key).toBe('S1.2');
    // The dots are found by UTF-16 offset, as the title is cut: an emoji before them shifts nothing.
    const sprout = setScene(richProject(), 'S1', { title: '🌱 Part 1. Growth' }).project;
    expect(resolveStep(sprout, '🌱 Part 1. Growth.2').key).toBe('S1.2');
    // When no split names a step, the error is about the scene that was found.
    expect(refused(() => resolveStep(p, 'Part 1. Growth.9')).message).toBe(
      'No step "9" in scene S1 (it has S1.1, S1.2 and S1.3).',
    );
    // "A.1.2" could be scene "A" step "1.2"... ids have no dots, but titles and labels may.
    let q = addScene(p, { title: 'A' }).project;
    q = addStep(q, 'S2', { label: '1.2', map: {} }).project;
    q = addScene(q, { title: 'A.1' }).project;
    q = addStep(q, 'S3', { label: 'x', map: {} }).project;
    q = addStep(q, 'S3', { id: '2', label: 'y', map: {} }).project;
    expect(refused(() => resolveStep(q, 'A.1.2')).message).toBe(
      '"A.1.2" names 2 steps (S2.1 and S3.2); use the scene\'s id, e.g. S2.1.',
    );
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
    // Hiding the badge while showing the name is a contradiction, refused; the helper keeps the badge.
    expect(
      refused(() => setStepLoops(richProject(), 'S1.1', ['B1'], { badge: false, name: true })).message,
    ).toBe('A loop name needs its badge: it cannot show without it.');
    expect(withLoops({}, ['B1'], { badge: false, name: true })).toEqual({ loops: ['B1'], loopNames: ['B1'] });
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
    // Round the balancing loop B1, L3 brings the change back into deaths the other way: it is named.
    expect(out.result.against).toEqual(['L3']);
    expect(out.summary).toBe(
      'Step S1.2: deaths ▲, spread by sign along the lit links to 2 variables. L3 would push the other way later, so the story check will flag it.',
    );
    expect(warnings(out.project, 'trendContradictsSign')).toEqual([
      'Step S1.2: deaths is marked up, but L3 (+) from population (down) implies down.',
    ]);
    // Round the reinforcing loop R1 the change comes back the same way: nothing is against it.
    const reinforcing = spreadTrend(
      setStepMap(richProject(), 'S1.2', { trends: null }).project,
      'S1.2',
      'births',
      'up',
    );
    expect(reinforcing.result).toMatchObject({ trends: { births: 'up', population: 'up' }, against: [] });
    expect(reinforcing.summary).toBe(
      'Step S1.2: births ▲, spread by sign along the lit links to 1 variable.',
    );
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

describe('one caption per step', () => {
  it('refuses a second caption from a whole step, and in a file', () => {
    const two = [{ type: 'caption' as const }, { type: 'caption' as const }];
    const set = refused(() => setStep(richProject(), 'S1.2', { overlays: two }));
    expect(set.kind).toBe('invalid');
    expect(set.issues[0]).toMatchObject({
      code: 'duplicateCaption',
      path: ['story', 'scenes', 0, 'steps', 1, 'overlays', 1],
    });
    expect(
      refused(() => addStep(richProject(), 'S1', { label: 'X', map: {}, overlays: two })).issues[0]?.code,
    ).toBe('duplicateCaption');
    const file = parseChanged({ 'story.scenes.0.steps.1.overlays.+': { type: 'caption' } });
    expect(file.ok).toBe(false);
    expect(file.issues.filter((i) => i.code === 'duplicateCaption')).toEqual([
      {
        severity: 'error',
        code: 'duplicateCaption',
        path: ['story', 'scenes', 0, 'steps', 1, 'overlays', 5],
        message: "Step S1.2: the scene's caption is listed twice.",
      },
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
    // Malformed base64, a PNG label on GIF bytes, and a cut-off PNG header are all refused.
    expect(refused(() => addAsset(richProject(), { data: 'data:image/png;base64,Z' })).message).toBe(
      'The image data is not valid base64.',
    );
    const gif = `data:image/png;base64,${btoa('GIF89a\u0001\u0000\u0001\u0000')}`;
    expect(refused(() => addAsset(richProject(), { data: gif })).message).toBe(
      'The image data says image/png but holds a GIF image.',
    );
    const cut = `data:image/png;base64,${btoa('\u0089PNG')}`;
    expect(refused(() => setAsset(richProject(), 'chart', cut)).message).toBe(
      'The image data says image/png but is not a readable image.',
    );
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

  it('refuses an image that is cut off or has no picture in it, whatever its type', () => {
    const bytesOf = (uri: string) =>
      Uint8Array.from(atob(uri.split(',')[1] as string), (c) => c.charCodeAt(0));
    const uri = (type: string, bytes: ArrayLike<number>) =>
      `data:image/${type};base64,${btoa(String.fromCharCode(...Array.from(bytes)))}`;
    const not = (data: string) => refused(() => addAsset(richProject(), { data })).message;
    // Whole 1×1 images, written by an image library (and an SVG by hand), are taken.
    const whole = {
      png: TINY_PNG,
      jpeg: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAABP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AC//Z',
      gif: 'data:image/gif;base64,R0lGODdhAQABAIEAAA9/agAAAAAAAAAAACwAAAAAAQABAAAIBAABBAQAOw==',
      webp: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQvz5Urf+BiOh/AAA=',
      svg: uri(
        'svg+xml',
        new TextEncoder().encode(
          '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>\n<!-- end -->\n',
        ),
      ),
      svgClosed: uri('svg+xml', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    };
    for (const data of Object.values(whole))
      expect(addAsset(richProject(), { data }).project.assets.image).toBe(data);

    // Only a header: the start of a JPEG, a PNG's signature; through both operations.
    const stops = (type: string) => `The image data is not a whole ${type} image: it stops before its end.`;
    expect(not('data:image/jpeg;base64,/9j/')).toBe(stops('JPEG'));
    expect(not('data:image/png;base64,iVBORw0KGgo=')).toBe(stops('PNG'));
    expect(refused(() => setAsset(richProject(), 'chart', 'data:image/jpeg;base64,/9j/')).message).toBe(
      stops('JPEG'),
    );
    expect(
      refused(() => setAsset(richProject(), 'chart', 'data:image/png;base64,iVBORw0KGgo=')).message,
    ).toBe(stops('PNG'));

    // Cut off before the end each format marks: PNG's IEND, JPEG's end of image, GIF's trailer, the size WebP
    // states, SVG's closing tag.
    const cut = (data: string, type: string, drop: number) => {
      const bytes = bytesOf(data);
      return uri(type, bytes.subarray(0, bytes.length - drop));
    };
    expect(not(cut(whole.png, 'png', 4))).toBe(stops('PNG'));
    expect(not(cut(whole.jpeg, 'jpeg', 2))).toBe(stops('JPEG'));
    expect(not(cut(whole.gif, 'gif', 1))).toBe(stops('GIF'));
    expect(not(cut(whole.webp, 'webp', 4))).toBe(stops('WEBP'));
    expect(not(cut(whole.svg, 'svg+xml', 30))).toBe(stops('SVG'));

    // Whole, but no picture in it: a PNG without its image data, a GIF without an image.
    const png = bytesOf(whole.png); // signature (8), IHDR (25), IDAT (25), IEND (12)
    expect(not(uri('png', [...png.subarray(0, 33), ...png.subarray(58)]))).toBe(
      'The image data is not a whole PNG image: it has no picture in it.',
    );
    expect(not(uri('gif', [...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0x3b]))).toBe(
      'The image data is not a whole GIF image: it has no picture in it.',
    );
    // A JPEG whose scan has a header but no data before the end mark.
    const jpeg = bytesOf(whole.jpeg);
    const sos = jpeg.findIndex((b, i) => b === 0xff && jpeg[i + 1] === 0xda);
    const scan = sos + 2 + (((jpeg[sos + 2] ?? 0) << 8) | (jpeg[sos + 3] ?? 0));
    expect(not(uri('jpeg', [...jpeg.subarray(0, scan), 0xff, 0xd9]))).toBe(
      'The image data is not a whole JPEG image: it has no picture in it.',
    );
    // A WebP whose picture chunk is too short to start a picture.
    const riff = (chunk: number[]) => {
      const size = 4 + chunk.length;
      return [
        ...new TextEncoder().encode('RIFF'),
        size & 255,
        (size >> 8) & 255,
        0,
        0,
        ...new TextEncoder().encode('WEBP'),
        ...chunk,
      ];
    };
    expect(not(uri('webp', riff([...new TextEncoder().encode('VP8 '), 1, 0, 0, 0, 0, 0])))).toBe(
      'The image data is not a whole WEBP image: it has no picture in it.',
    );
    // An SVG whose tags do not match up, and one with a long preamble before a whole root.
    const svg = (text: string) => uri('svg+xml', [...new TextEncoder().encode(text)]);
    expect(not(svg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'))).toBe(
      'The image data is not a whole SVG image: its tags do not match up.',
    );
    const preamble = svg(`<!--${' '.repeat(3000)}--><svg xmlns="http://www.w3.org/2000/svg"><g/></svg>`);
    expect(addAsset(richProject(), { data: preamble, id: 'long' }).result.id).toBe('long');
    // A JPEG scan of nothing but a fill byte; a WebP's odd-sized last chunk without its padding byte.
    expect(not(uri('jpeg', [...jpeg.subarray(0, scan), 0xff, 0xff, 0xd9]))).toBe(
      'The image data is not a whole JPEG image: it has no picture in it.',
    );
    expect(not(uri('webp', riff([...new TextEncoder().encode('VP8L'), 5, 0, 0, 0, 0x2f, 0, 0, 0, 0])))).toBe(
      stops('WEBP'),
    );
    // An SVG whose doctype has an internal subset is taken.
    const subset = svg(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY harmless "ok">]><svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
    );
    expect(addAsset(richProject(), { data: subset, id: 'subset' }).result.id).toBe('subset');
    // A JPEG frame or scan header too short to hold its fields.
    const soi = [0xff, 0xd8];
    expect(not(uri('jpeg', [...soi, 0xff, 0xc0, 0, 2, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]))).toBe(
      'The image data is not a whole JPEG image: it has no picture in it.',
    );
    // An SVG with a processing instruction before its root is taken.
    const pi = svg('<?xml version="1.0"?><?note ok?><svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(addAsset(richProject(), { data: pi, id: 'pi' }).result.id).toBe('pi');
    // A PNG whose header declares no width; a self-closing SVG root with ">" in a quoted value is taken.
    const flat = [...png];
    flat.splice(16, 4, 0, 0, 0, 0);
    expect(not(uri('png', flat))).toBe('The image data is not a whole PNG image: it has no picture in it.');
    const quoted = svg('<svg xmlns="http://www.w3.org/2000/svg" aria-label="a > b"/>');
    expect(addAsset(richProject(), { data: quoted, id: 'quoted' }).result.id).toBe('quoted');
    // Pictures of no size: a JPEG frame 0 high, a GIF image 0 wide, a VP8 frame 0 wide.
    const sof = jpeg.findIndex((b, i) => b === 0xff && jpeg[i + 1] === 0xc0);
    const low = [...jpeg];
    low.splice(sof + 5, 2, 0, 0);
    expect(not(uri('jpeg', low))).toBe('The image data is not a whole JPEG image: it has no picture in it.');
    const screen = [...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0];
    const narrow = [0x2c, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 1, 0, 0, 0x3b];
    expect(not(uri('gif', [...screen, ...narrow]))).toBe(
      'The image data is not a whole GIF image: it has no picture in it.',
    );
    expect(
      not(
        uri(
          'webp',
          riff([...new TextEncoder().encode('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 1, 0x2a, 0, 0, 1, 0]),
        ),
      ),
    ).toBe('The image data is not a whole WEBP image: it has no picture in it.');
    // A GIF whose image has a descriptor and a code size but no data at all.
    const descriptor = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0];
    expect(
      not(
        uri('gif', [...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0, ...descriptor, 2, 0, 0x3b]),
      ),
    ).toBe('The image data is not a whole GIF image: it has no picture in it.');
  });
});

describe('reading images', () => {
  it('reads a whole image once, however often the project is checked', () => {
    const decode = vi.spyOn(globalThis, 'atob');
    const data = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" id="read-once"/>')}`;
    expect(imageProblem(data)).toBeNull();
    expect(imageProblem(data)).toBeNull();
    expect(decode).toHaveBeenCalledTimes(1);
    decode.mockRestore();
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
