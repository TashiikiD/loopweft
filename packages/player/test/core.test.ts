import { describe, expect, it } from 'vitest';
import {
  type Command,
  type Deck,
  deckOf,
  elapsedMs,
  fmt,
  initialShowState,
  JumpBuffer,
  mapKey,
  newClock,
  nextPos,
  pace,
  parseKey,
  posKey,
  prevPos,
  reduce,
  type ShowState,
  sanitizeClock,
  sanitizeShowState,
  sceneTag,
  toggleClock,
  totalSteps,
} from '../src/index.ts';
import { example } from './helpers.ts';

const project = example();
const deck = deckOf(project);

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
    const read = sanitizeShowState(deck, JSON.parse(JSON.stringify(saved)), 9);
    expect(read?.pos).toEqual(saved.pos);
    expect(read?.categoryWords).toBe(true);
    expect(read?.nav.kind).toBe('sync');
    expect(sanitizeShowState(deck, { pos: { s: 40, b: 0 } }, 9)).toBeNull();
    expect(sanitizeShowState(deck, { pos: { s: '1', b: 0 } }, 9)).toBeNull();
    expect(sanitizeShowState(deck, 'nonsense', 9)).toBeNull();
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
