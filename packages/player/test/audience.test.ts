// @vitest-environment jsdom
import type { Project } from '@loopweft/model';
import { ManualClock } from '@loopweft/motion';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserHost,
  deckOf,
  initialShowState,
  Link,
  PresentationStore,
  ProgressBar,
  posKey,
  presentationId,
  startAudience,
} from '../src/index.ts';
import { example, exampleText, MemoryStorage } from './helpers.ts';

const project = example();
const SHOW = presentationId(exampleText());

const key = (k: string, more: KeyboardEventInit = {}) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...more }));

let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});

function open(rehearse: boolean, storage = new MemoryStorage(), story: Project = project) {
  const host = document.createElement('main');
  document.body.appendChild(host);
  const clock = new ManualClock();
  const audience = startAudience({ host, project: story, show: SHOW, rehearse, storage, clock });
  dispose = audience.dispose;
  return { host, clock, audience, storage };
}

describe('the audience window', () => {
  it('steps through the story with the keys, writing the step into the address', () => {
    const { audience } = open(false);
    const at = () => posKey(audience.deck, audience.session?.state.pos ?? { s: 0, b: 0 });
    expect(at()).toBe('S00.1');
    key('PageDown');
    expect(at()).toBe('S01.1');
    expect(location.hash).toBe('#S01.1');
    expect(audience.story.position).toEqual({ scene: 1, step: 0 });
    key('4');
    key('Enter');
    expect(at()).toBe('S04.1');
    key('ArrowRight', { shiftKey: true });
    expect(at()).toBe('S05.1');
    key('F5');
    expect(at()).toBe('S05.1');
  });

  it('blacks out, names categories in words, and hides the progress bar on H', () => {
    const { host, audience } = open(false);
    key('ArrowRight');
    key('b');
    expect(host.querySelector('.lp-blackout')?.classList.contains('on')).toBe(true);
    key('c');
    expect(audience.story.stage.root.classList.contains('category-words')).toBe(true);
    key('h');
    expect(host.querySelector('.lp-progress')?.classList.contains('hidden')).toBe(true);
  });

  it('opens where the last run left off', () => {
    const storage = new MemoryStorage();
    const first = open(false, storage);
    key('End');
    first.audience.dispose();
    dispose = null;
    history.replaceState(null, '', '/');
    const { audience } = open(false, storage);
    expect(posKey(audience.deck, audience.session?.state.pos ?? { s: 0, b: 0 })).toBe('S10.4');
  });

  it('shows rehearsal notes on N only when rehearsing, with the clock on T', () => {
    const { host } = open(true);
    key('ArrowRight');
    const notes = host.querySelector('.lp-rehearsal') as HTMLElement;
    expect(notes.hidden).toBe(true);
    key('n');
    expect(notes.hidden).toBe(false);
    expect(notes.querySelector('h2')?.textContent).toBe('Scene 01 · step 1 of 4');
    expect(notes.querySelector('.lp-ro-clock')?.textContent).toMatch(/^Clock not started/);
    key('t');
    expect(notes.querySelector('.lp-ro-clock')?.textContent).toMatch(
      /^0:00 · this scene 0:00 \/ 1:00 · On pace/,
    );
    expect(notes.querySelector('.lp-markdown li')).not.toBeNull();
    dispose?.();
    dispose = null;
    document.body.replaceChildren();
    const plain = open(false);
    key('n');
    expect(plain.host.querySelector('.lp-rehearsal')).toBeNull();
  });

  it('lets Enter open a link in the rehearsal notes, without moving the show', () => {
    const scenes = project.story.scenes.map((s, i) =>
      i === 1 ? { ...s, notes: 'From [the report](https://example.org/report).' } : s,
    );
    const { host, audience } = open(true, new MemoryStorage(), {
      ...project,
      story: { ...project.story, scenes },
    });
    key('ArrowRight');
    key('n');
    const link = host.querySelector('.lp-rehearsal a') as HTMLAnchorElement;
    expect(link.href).toBe('https://example.org/report');
    link.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    link.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(posKey(audience.deck, audience.session?.state.pos ?? { s: 0, b: 0 })).toBe('S01.1');
    // Enter elsewhere still goes on.
    (host.querySelector('.lp-rehearsal') as HTMLElement).focus();
    key('Enter');
    expect(posKey(audience.deck, audience.session?.state.pos ?? { s: 0, b: 0 })).toBe('S01.2');
  });

  it('opens the rehearsal notes with the keyboard’s focus in them, to scroll, and gives it back', () => {
    const { host } = open(true);
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    key('n');
    const notes = host.querySelector('.lp-rehearsal') as HTMLElement;
    expect(notes.tabIndex).toBe(0);
    expect(document.activeElement).toBe(notes);
    // The show keeps its keys there.
    key('PageDown');
    expect(notes.querySelector('h2')?.textContent).toBe('Scene 01 · step 1 of 4');
    key('n');
    expect(notes.hidden).toBe(true);
    expect(document.activeElement).toBe(before);
  });

  it('takes the clock up from storage when the console goes, keeping the scene’s start', async () => {
    const storage = new MemoryStorage();
    const { host, audience } = open(true, storage);
    const store = new PresentationStore(SHOW, storage);
    // A console joins, keeps the clock (a minute in, scene 03 entered at 1:00) and moves the show there.
    const presenter = new Link('presenter', SHOW, browserHost(window));
    presenter.start();
    await vi.waitFor(() => expect(audience.session?.link.alive('presenter')).toBe(true));
    const scene = audience.deck.scenes[3]?.id as string;
    store.save('clock', { running: false, startedAt: null, accumulatedMs: 60_000 });
    store.save('sceneEntry', { sceneId: scene, atMs: 60_000 });
    presenter.send({
      t: 'state',
      state: { ...initialShowState(Date.now() + 1000, { s: 3, b: 0 }), writer: presenter.id },
      reason: 'update',
    });
    await vi.waitFor(() => expect(location.hash).toBe('#S03.1'));
    // The console closes; this window steps on and opens its notes.
    presenter.stop();
    await vi.waitFor(() => expect(audience.session?.link.alive('presenter')).toBe(false));
    key('ArrowRight');
    expect(store.load('sceneEntry')).toEqual({ sceneId: scene, atMs: 60_000 });
    key('n');
    expect(host.querySelector('.lp-ro-clock')?.textContent).toMatch(/^1:00 \(paused\) · this scene 0:00 /);
  });

  it('hides a still pointer after a moment, and leaves the page as it found it', () => {
    vi.useFakeTimers();
    try {
      document.body.style.background = 'rgb(1, 2, 3)';
      const { audience } = open(false);
      expect(document.body.style.background).not.toBe('rgb(1, 2, 3)');
      vi.advanceTimersByTime(2600);
      expect(document.body.classList.contains('lp-hide-cursor')).toBe(true);
      audience.dispose();
      dispose = null;
      expect(document.body.style.background).toBe('rgb(1, 2, 3)');
      expect(document.body.classList.contains('lp-hide-cursor')).toBe(false);
    } finally {
      vi.useRealTimers();
      document.body.style.background = '';
    }
  });
});

describe('the progress bar', () => {
  it('lands at once on a saved step: neither the bar nor a scene’s fill sweeps on the first placement', () => {
    const layer = document.createElement('div');
    const bar = new ProgressBar(layer, deckOf(project));
    const fills = [...bar.el.querySelectorAll<HTMLElement>('.lp-progress-fill')];
    // What is set when the browser lays the bar out (the moment the transitions would start).
    let atLayout: string[] = [];
    Object.defineProperty(bar.el, 'offsetWidth', {
      get: () => {
        atLayout = [bar.el.style.transition, ...fills.map((f) => `${f.style.transition} ${f.style.width}`)];
        return 0;
      },
    });
    bar.update({ s: 4, b: 1 });
    expect(atLayout[0]).toBe('none');
    expect(atLayout[5]).toMatch(/^none \d/);
    expect(atLayout.slice(1).every((f) => f.startsWith('none '))).toBe(true);
    // Afterwards the bar moves smoothly again.
    expect([bar.el.style.transition, ...fills.map((f) => f.style.transition)].every((t) => t === '')).toBe(
      true,
    );
  });
});
