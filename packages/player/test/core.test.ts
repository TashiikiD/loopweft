import { describe, expect, it } from 'vitest';
import {
  COUNT_LIMIT,
  type Command,
  type Deck,
  deckOf,
  elapsedMs,
  fmt,
  initialShowState,
  JumpBuffer,
  jumpDigits,
  LEAD_MS,
  mapKey,
  newClock,
  nextPos,
  PresentationStore,
  PresenterClock,
  pace,
  paceText,
  parseKey,
  posKey,
  prevPos,
  receiveLimit,
  reduce,
  restoreLimit,
  type ShowState,
  sanitizeClock,
  sanitizeShowState,
  sceneTag,
  toggleClock,
  totalSteps,
} from '../src/index.ts';
import { example, MemoryStorage } from './helpers.ts';

const project = example();
const deck = deckOf(project);
/** This window's clock, for reading saved and received states, and the latest stamp it takes back from storage. */
const NOW = 1_800_000_000_000;
const LATEST = restoreLimit(NOW);

const run = (state: ShowState, ...cmds: Command[]): ShowState =>
  cmds.reduce((s, cmd, i) => reduce(deck, s, cmd, 2000 + i), state);
const at = (state: ShowState) => posKey(deck, state.pos);

describe('the deck a story makes', () => {
  it('has every scene with steps, its number, target and place on the clock', () => {
    expect(totalSteps(deck)).toBe(70);
    expect(deck.targetSeconds).toBe(840);
    const rows = deck.scenes.map(
      (s) => `${s.id} ${sceneTag(s) || '-'} ${s.targetSeconds} ${s.clockStart}-${s.clockEnd}`,
    );
    expect(rows.slice(0, 3)).toEqual(['S00 - 0 0-0', 'S01 01 60 0-60', 'S02 02 95 60-155']);
    expect(rows.at(-1)).toBe('S10 10 70 770-840');
  });

  it('leaves out scenes without steps, keeping each scene’s place in the story', () => {
    const story = {
      scenes: [{ ...project.story.scenes[0], id: 'EMPTY', steps: [] }, ...project.story.scenes],
    };
    const d = deckOf({ ...project, story: story as typeof project.story });
    expect(d.scenes[0]?.id).toBe('S00');
    expect(d.scenes[0]?.index).toBe(1);
  });

  it('moves step by step across scenes, and reads step addresses back', () => {
    expect(nextPos(deck, { s: 0, b: 0 })).toEqual({ s: 1, b: 0 });
    expect(prevPos(deck, { s: 1, b: 0 })).toEqual({ s: 0, b: 0 });
    expect(prevPos(deck, { s: 0, b: 0 })).toBeNull();
    expect(nextPos(deck, { s: 10, b: 3 })).toBeNull();
    expect(parseKey(deck, '#S04.2b')).toEqual({ s: 4, b: 2 });
    expect(parseKey(deck, 'S05')).toEqual({ s: 5, b: 0 });
    expect(parseKey(deck, '#S99.1')).toBeNull();
    expect(parseKey(deck, '#%E0%A4%A')).toBeNull();
    expect(posKey(deck, { s: 4, b: 1 })).toBe('S04.2a');
  });
});

describe('the show', () => {
  const start = initialShowState(1000);

  it('steps forward and back, across scenes, and stops at either end', () => {
    expect(at(run(start, { type: 'next' }))).toBe('S01.1');
    expect(run(start, { type: 'next' }).nav.kind).toBe('forward');
    expect(run(start, { type: 'prev' })).toBe(start);
    const back = run(start, { type: 'next' }, { type: 'next' }, { type: 'prev' });
    expect(at(back)).toBe('S01.1');
    expect(back.nav.kind).toBe('backward');
    const end = run(start, { type: 'last' });
    expect(at(end)).toBe('S10.4');
    expect(run(end, { type: 'next' })).toBe(end);
  });

  it('jumps to a scene by its number, to its start, and like a media player back', () => {
    const s4 = run(start, { type: 'gotoScene', number: 4 });
    expect(at(s4)).toBe('S04.1');
    expect(s4.nav.kind).toBe('jump');
    expect(run(start, { type: 'gotoScene', number: 0 })).toBe(start);
    expect(run(start, { type: 'gotoScene', number: 11 })).toBe(start);
    const inside = run(s4, { type: 'next' }, { type: 'next' });
    expect(at(run(inside, { type: 'prevScene' }))).toBe('S04.1');
    expect(at(run(inside, { type: 'prevScene' }, { type: 'prevScene' }))).toBe('S03.1');
    expect(at(run(inside, { type: 'nextScene' }))).toBe('S05.1');
  });

  it('calls a click on the next step a step forward, any other a jump', () => {
    expect(run(start, { type: 'goto', pos: { s: 1, b: 0 } }).nav.kind).toBe('forward');
    expect(run(start, { type: 'goto', pos: { s: 3, b: 2 } }).nav.kind).toBe('jump');
    expect(run(start, { type: 'goto', pos: { s: 3, b: 99 } })).toBe(start);
  });

  it('replays, skips, pauses, blacks out, saves power and names categories, each stamped with the time', () => {
    const s = run(
      start,
      { type: 'togglePause' },
      { type: 'toggleBlackout' },
      { type: 'toggleCategoryWords' },
    );
    expect([s.paused, s.blackout, s.categoryWords, s.lowPower]).toEqual([true, true, true, false]);
    expect(s.updatedAt).toBe(2002);
    // Moving resumes the animation.
    expect(run(s, { type: 'next' }).paused).toBe(false);
    const again = run(s, { type: 'repeat' });
    expect(again.nav.kind).toBe('replay');
    expect(again.nav.seq).toBe(s.nav.seq + 1);
    expect(run(s, { type: 'skip' }).skipToken).toBe(1);
    expect(run(s, { type: 'toggleLowPower' }).lowPower).toBe(true);
  });

  it('takes back a saved state only if it fits the deck, and shows it at once', () => {
    const saved = run(start, { type: 'gotoScene', number: 5 }, { type: 'toggleCategoryWords' });
    const read = sanitizeShowState(deck, JSON.parse(JSON.stringify(saved)), LATEST);
    expect(read?.pos).toEqual(saved.pos);
    expect(read?.categoryWords).toBe(true);
    expect(read?.nav.kind).toBe('sync');
    expect(sanitizeShowState(deck, { pos: { s: 40, b: 0 }, updatedAt: 9 }, LATEST)).toBeNull();
    expect(sanitizeShowState(deck, { pos: { s: '1', b: 0 }, updatedAt: 9 }, LATEST)).toBeNull();
    expect(sanitizeShowState(deck, 'nonsense', LATEST)).toBeNull();
  });

  it('refuses a state whose time is not a whole number of milliseconds, and starts bad counters from 0', () => {
    const good = { pos: { s: 1, b: 0 }, updatedAt: 5, nav: { kind: 'forward', seq: 3 }, skipToken: 2 };
    expect(sanitizeShowState(deck, good, LATEST)).toMatchObject({
      updatedAt: 5,
      skipToken: 2,
      nav: { kind: 'sync', seq: 3 },
      writer: '',
    });
    for (const updatedAt of [Number.POSITIVE_INFINITY, Number.NaN, -1, 1.5, '5', undefined, 2 ** 60])
      expect(sanitizeShowState(deck, { ...good, updatedAt }, LATEST)).toBeNull();
    // JSON reads 1e309 as Infinity.
    expect(sanitizeShowState(deck, JSON.parse('{"pos":{"s":1,"b":0},"updatedAt":1e309}'), LATEST)).toBeNull();
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -1, 0.5, '2'])
      expect(
        sanitizeShowState(deck, { ...good, skipToken: bad, nav: { kind: 'jump', seq: bad } }, LATEST),
      ).toMatchObject({ skipToken: 0, nav: { seq: 0 } });
    expect(sanitizeShowState(deck, { ...good, pos: { s: 1.5, b: 0 } }, LATEST)).toBeNull();
    expect(sanitizeShowState(deck, { ...good, writer: 'x'.repeat(65) }, LATEST)?.writer).toBe('');
  });

  it('takes in no number that a change could not add one to, so every later change still arrives', () => {
    const good = { pos: { s: 1, b: 0 }, updatedAt: NOW, nav: { kind: 'forward', seq: 3 }, skipToken: 2 };
    // A time more than a year ahead of this window's clock is refused: the windows share one clock.
    expect(sanitizeShowState(deck, { ...good, updatedAt: NOW + LEAD_MS }, LATEST)?.updatedAt).toBe(
      NOW + LEAD_MS,
    );
    for (const updatedAt of [NOW + LEAD_MS + 1, Number.MAX_SAFE_INTEGER, COUNT_LIMIT])
      expect(sanitizeShowState(deck, { ...good, updatedAt }, LATEST)).toBeNull();
    // A counter at the limit, or past it, starts again from 0; one below it is kept.
    for (const bad of [COUNT_LIMIT, Number.MAX_SAFE_INTEGER])
      expect(
        sanitizeShowState(deck, { ...good, skipToken: bad, nav: { kind: 'jump', seq: bad } }, LATEST),
      ).toMatchObject({ skipToken: 0, nav: { seq: 0 } });
    const top = sanitizeShowState(
      deck,
      { ...good, skipToken: COUNT_LIMIT - 1, nav: { kind: 'jump', seq: COUNT_LIMIT - 1 } },
      LATEST,
    );
    expect(top).toMatchObject({ skipToken: COUNT_LIMIT - 1, nav: { seq: COUNT_LIMIT - 1 } });
    if (!top) return;
    // The next move or skip from there starts its counter again from 0, which still differs from the last,
    // and every window takes it in.
    const moved = reduce(deck, top, { type: 'next' }, NOW + 1);
    const replayed = reduce(deck, top, { type: 'repeat' }, NOW + 1);
    const skipped = reduce(deck, top, { type: 'skip' }, NOW + 1);
    expect([moved.nav.seq, replayed.nav.seq, skipped.skipToken]).toEqual([0, 0, 0]);
    for (const state of [moved, replayed, skipped])
      expect(
        sanitizeShowState(deck, JSON.parse(JSON.stringify(state)), receiveLimit(NOW, top)),
      ).not.toBeNull();
  });

  it('does nothing for a story without steps', () => {
    const empty: Deck = { title: 'x', targetSeconds: 0, scenes: [] };
    expect(reduce(empty, start, { type: 'next' }, 5)).toBe(start);
  });
});

describe('keys', () => {
  const key = (k: string, more: Partial<Parameters<typeof mapKey>[0]> = {}) => ({
    key: k,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...more,
  });

  it('follows the clicker: page keys step, F5 is ignored, a held key does not race', () => {
    expect(mapKey(key('PageDown'), 'audience')).toEqual({ kind: 'show', cmd: { type: 'next' } });
    expect(mapKey(key('PageUp'), 'presenter')).toEqual({ kind: 'show', cmd: { type: 'prev' } });
    expect(mapKey(key('F5'), 'audience')).toEqual({ kind: 'swallow' });
    expect(mapKey(key('ArrowRight', { repeat: true }), 'audience')).toEqual({ kind: 'swallow' });
    expect(mapKey(key('b'), 'audience')).toEqual({ kind: 'show', cmd: { type: 'toggleBlackout' } });
    expect(mapKey(key('.'), 'presenter')).toEqual({ kind: 'show', cmd: { type: 'toggleBlackout' } });
    expect(mapKey(key('r', { ctrlKey: true }), 'audience')).toBeNull();
  });

  it('gives C to both windows, and the letters each window has of its own', () => {
    for (const role of ['presenter', 'audience'] as const)
      expect(mapKey(key('C'), role)).toEqual({ kind: 'show', cmd: { type: 'toggleCategoryWords' } });
    expect(mapKey(key('f'), 'presenter')).toEqual({ kind: 'local', action: 'script' });
    expect(mapKey(key('f'), 'audience')).toEqual({ kind: 'local', action: 'fullscreen' });
    expect(mapKey(key('g'), 'presenter')).toEqual({ kind: 'local', action: 'notes' });
    expect(mapKey(key('T', { shiftKey: true }), 'presenter')).toEqual({
      kind: 'local',
      action: 'clockReset',
    });
    expect(mapKey(key('n'), 'audience')).toEqual({ kind: 'local', action: 'notesOverlay' });
    expect(mapKey(key('n'), 'presenter')).toBeNull();
    expect(mapKey(key('ArrowRight', { shiftKey: true }), 'audience')).toEqual({
      kind: 'show',
      cmd: { type: 'nextScene' },
    });
  });

  it('jumps to scene 100 and beyond in a story that long', () => {
    const captioned = project.story.scenes.find((s) =>
      s.steps.some((t) => t.overlays.some((o) => o.type === 'caption')),
    );
    if (!captioned) throw new Error('The example has a captioned scene');
    const scenes = Array.from({ length: 120 }, (_, i) => ({ ...captioned, id: `scene_${i}` }));
    const long = deckOf({ ...project, story: { ...project.story, scenes } });
    expect(jumpDigits(long)).toBe(3);
    expect(jumpDigits(deck)).toBe(2);
    const typed = (keys: string[]) => {
      const jump = new JumpBuffer(2500, jumpDigits(long));
      let state = initialShowState(0);
      keys.forEach((key, i) => {
        const action = mapKey(
          { key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
          'audience',
        );
        if (action?.kind === 'digit') jump.push(action.digit, i);
        if (action?.kind === 'enter') {
          const n = jump.take(i);
          state = reduce(
            long,
            state,
            n === null ? { type: 'next' } : { type: 'gotoScene', number: n },
            10 + i,
          );
        }
      });
      return long.scenes[state.pos.s]?.number;
    };
    expect(typed(['1', '0', '0', 'Enter'])).toBe(100);
    expect(typed(['1', '2', '0', 'Enter'])).toBe(120);
    expect(typed(['0', '4', 'Enter'])).toBe(4);
    // Only the last three digits count: a stray digit before them changes nothing.
    expect(typed(['9', '1', '0', '7', 'Enter'])).toBe(107);
  });

  it('collects up to two digits for a scene jump, forgetting them after a pause', () => {
    const jump = new JumpBuffer(2500);
    expect(jump.push(1, 0)).toBe('1');
    expect(jump.push(0, 100)).toBe('10');
    expect(jump.take(200)).toBe(10);
    expect(jump.take(300)).toBeNull();
    jump.push(4, 1000);
    expect(jump.take(4000)).toBeNull();
    jump.push(7, 5000);
    jump.push(8, 5100);
    jump.push(9, 5200);
    expect(jump.peek(5300)).toBe('89');
  });
});

describe('the clock and pace', () => {
  it('runs, pauses and adds up', () => {
    let c = newClock();
    c = toggleClock(c, 1000);
    expect(elapsedMs(c, 4000)).toBe(3000);
    c = toggleClock(c, 5000);
    expect(elapsedMs(c, 99_000)).toBe(4000);
    expect(sanitizeClock(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(sanitizeClock({ running: true, accumulatedMs: 0 })).toBeNull();
    expect(sanitizeClock({ running: false, accumulatedMs: -1 })).toBeNull();
  });

  it('starts again from 0:00 when the saved clock holds a time that is not a finite number', () => {
    for (const bad of [
      { running: false, accumulatedMs: Number.POSITIVE_INFINITY, startedAt: null },
      { running: false, accumulatedMs: Number.NaN, startedAt: null },
      { running: true, accumulatedMs: 0, startedAt: Number.POSITIVE_INFINITY },
      { running: true, accumulatedMs: 0, startedAt: Number.NaN },
      { running: true, accumulatedMs: 0, startedAt: -5 },
    ])
      expect(sanitizeClock(bad)).toBeNull();
    // As storage holds it: JSON reads 1e309 as Infinity.
    const storage = new MemoryStorage();
    const store = new PresentationStore('test', storage);
    storage.setItem(store.keyOf('clock'), '{"running":false,"accumulatedMs":1e309,"startedAt":null}');
    storage.setItem(store.keyOf('sceneEntry'), '{"sceneId":"s01","atMs":1e309}');
    const t = new PresenterClock(store, deck, () => 50_000).read({ s: 1, b: 0 });
    expect([t.elapsed, t.sceneElapsed, t.started]).toEqual([0, 0, false]);
    expect(paceText(t)).toBe('Clock not started');
  });

  it('is on pace within 15 s, late to 45 s, very late beyond, and idle before it starts', () => {
    const scene = { clockStart: 60, targetSeconds: 95 };
    expect(pace(scene, 0, 0, false).status).toBe('idle');
    expect(pace(scene, 70, 0, true).status).toBe('on');
    expect(pace(scene, 80, 0, true).status).toBe('late');
    expect(pace(scene, 120, 10, true).status).toBe('very-late');
    expect(pace(scene, 20, 0, true).status).toBe('ahead');
    // An overrun counts as lateness.
    expect(pace(scene, 60 + 125, 125, true).behind).toBe(30);
    expect(pace(scene, 60 + 125, 125, true).sceneRemaining).toBe(-30);
  });

  it('writes times as m:ss', () => {
    expect(fmt(0)).toBe('0:00');
    expect(fmt(840)).toBe('14:00');
    expect(fmt(61.9)).toBe('1:01');
    expect(fmt(-5)).toBe('−0:05');
  });
});
