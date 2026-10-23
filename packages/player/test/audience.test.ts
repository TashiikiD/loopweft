// @vitest-environment jsdom
import type { Project } from '@loopweft/model';
import { ManualClock } from '@loopweft/motion';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserHost,
  deckOf,
  initialShowState,
  type KeyValue,
  Link,
  PresentationStore,
  ProgressBar,
  posKey,
  presentationId,
  startAudience,
  startConsole,
} from '../src/index.ts';
import { example, exampleText, MemoryStorage } from './helpers.ts';

// The windows talk through real messages: on a busy machine an answer can take longer than vi.waitFor's
// default second, so a wait gives them up to ten.
const PATIENCE = { timeout: 10_000 };

const project = example();
const SHOW = presentationId(exampleText());

const key = (k: string, more: KeyboardEventInit = {}) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...more }));

/** The example, with a link in the notes of scene 01. */
const withLinkedNotes: Project = {
  ...project,
  story: {
    ...project.story,
    scenes: project.story.scenes.map((s, i) =>
      i === 1 ? { ...s, notes: 'From [the report](https://example.org/report).' } : s,
    ),
  },
};

let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});

function open(rehearse: boolean, storage: KeyValue | null = new MemoryStorage(), story: Project = project) {
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

  it('lets Enter open a link in the rehearsal notes, without moving the show; Space still moves it', () => {
    const { host, audience } = open(true, new MemoryStorage(), withLinkedNotes);
    const at = () => posKey(audience.deck, audience.session?.state.pos ?? { s: 0, b: 0 });
    key('ArrowRight');
    key('n');
    const link = host.querySelector('.lp-rehearsal a') as HTMLAnchorElement;
    expect(link.href).toBe('https://example.org/report');
    link.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    link.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(at()).toBe('S01.1');
    // A link opens on Enter only: Space on it moves the show on, as it does anywhere else.
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    link.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(at()).toBe('S01.2');
    // Enter elsewhere still goes on.
    (host.querySelector('.lp-rehearsal') as HTMLElement).focus();
    key('Enter');
    expect(at()).toBe('S01.3');
  });

  it('keeps the keyboard’s focus in the notes when they change with the show', () => {
    const { host } = open(true, new MemoryStorage(), withLinkedNotes);
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    key('ArrowRight');
    key('n');
    const notes = host.querySelector('.lp-rehearsal') as HTMLElement;
    (notes.querySelector('a') as HTMLAnchorElement).focus();
    // The notes are drawn again for the next step, without the link that had the focus: the notes keep it.
    for (const next of ['PageDown', 'ArrowRight']) {
      notes.querySelector('a')?.focus();
      notes.querySelector('a')?.dispatchEvent(new KeyboardEvent('keydown', { key: next, bubbles: true }));
      expect(document.activeElement).toBe(notes);
    }
    expect(notes.querySelector('h2')?.textContent).toBe('Scene 01 · step 3 of 4');
    key('n');
    expect(document.activeElement).toBe(before);
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
    await vi.waitFor(() => expect(audience.session?.link.alive('presenter')).toBe(true), PATIENCE);
    const scene = audience.deck.scenes[3]?.id as string;
    store.save('clock', { running: false, startedAt: null, accumulatedMs: 60_000 });
    store.save('sceneEntry', { sceneId: scene, atMs: 60_000 });
    presenter.send({
      t: 'state',
      state: { ...initialShowState(Date.now() + 1000, { s: 3, b: 0 }), writer: presenter.id },
      reason: 'update',
    });
    await vi.waitFor(() => expect(location.hash).toBe('#S03.1'), PATIENCE);
    // The console closes; this window steps on and opens its notes.
    presenter.stop();
    await vi.waitFor(() => expect(audience.session?.link.alive('presenter')).toBe(false), PATIENCE);
    key('ArrowRight');
    expect(store.load('sceneEntry')).toEqual({ sceneId: scene, atMs: 60_000 });
    key('n');
    expect(host.querySelector('.lp-ro-clock')?.textContent).toMatch(/^1:00 \(paused\) · this scene 0:00 /);
  });

  it('keeps its clock and the scene’s start without storage, or with a storage that refuses everything', () => {
    const refuse = (): never => {
      throw new Error('Storage is blocked.');
    };
    const refusing: KeyValue = { getItem: refuse, setItem: refuse, removeItem: refuse };
    for (const storage of [null, refusing]) {
      vi.useFakeTimers();
      try {
        const { host } = open(true, storage);
        // T works with the notes open.
        key('ArrowRight');
        key('n');
        key('t');
        key('n');
        vi.advanceTimersByTime(5000);
        // A step on (the window reads the clock again before noting the scene), then the notes (again).
        key('ArrowRight');
        key('n');
        const clock = () => host.querySelector('.lp-ro-clock')?.textContent;
        expect(clock()).toMatch(/^0:05 · this scene 0:05 \/ 1:00 /);
        key('n');
        vi.advanceTimersByTime(5000);
        key('ArrowRight', { shiftKey: true });
        vi.advanceTimersByTime(3000);
        key('n');
        // Still running, and the new scene started at 0:10.
        expect(clock()).toMatch(/^0:13 · this scene 0:03 \/ /);
      } finally {
        dispose?.();
        dispose = null;
        document.body.replaceChildren();
        history.replaceState(null, '', '/');
        vi.useRealTimers();
      }
    }
  });

  it('takes up the console’s clock when it goes, with no storage in either window to carry it', async () => {
    // The clock is moved by hand, in steps shorter than a window takes to count another as gone.
    let now = 1_700_000_000_000;
    const time = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const refuse = (): never => {
      throw new Error('Storage is blocked.');
    };
    const refusing: KeyValue = { getItem: refuse, setItem: refuse, removeItem: refuse };
    const settle = () => new Promise((r) => setTimeout(r, 50));
    try {
      for (const [storage, late] of [
        [null, false],
        [refusing, false],
        [null, true],
      ] as const) {
        const consoleHost = document.createElement('div');
        const startTheConsole = () => {
          document.body.appendChild(consoleHost);
          return startConsole({
            host: consoleHost,
            project,
            show: SHOW,
            audience: { url: '?view=audience', name: 'test-audience' },
            address: false,
            storage,
            clock: new ManualClock(),
          });
        };
        const button = (label: string) =>
          [...consoleHost.querySelectorAll('button')].find(
            (b) => b.textContent === label,
          ) as HTMLButtonElement;
        // The console's own buttons, so that keys do not reach the audience window here as well.
        let presenter = late ? startTheConsole() : null;
        if (late) {
          button('Next ▶').click();
          button('▶ Start clock').click();
          now += 2000;
        }
        const { host, audience } = open(true, storage);
        presenter ??= startTheConsole();
        await vi.waitFor(() => expect(audience.session?.link.alive('presenter')).toBe(true), PATIENCE);
        if (!late) {
          button('Next ▶').click();
          button('▶ Start clock').click();
          now += 2000;
          // Scene 02 comes up at 0:02 on the console's clock.
          for (let i = 0; i < 4; i++) button('Next ▶').click();
          await vi.waitFor(() => expect(location.hash).toBe('#S02.1'), PATIENCE);
        }
        now += 1000;
        await settle();
        presenter.dispose();
        await vi.waitFor(() => expect(audience.session?.link.alive('presenter')).toBe(false), PATIENCE);
        // A step on in this window, then its notes: the console's clock, and its scene's start.
        key('ArrowRight');
        key('n');
        const line = host.querySelector('.lp-ro-clock')?.textContent ?? '';
        if (late) expect(line, 'joined after the clock started').toMatch(/^0:03 · this scene 0:03 /);
        else expect(line, String(storage)).toMatch(/^0:03 · this scene 0:01 /);
        dispose?.();
        dispose = null;
        document.body.replaceChildren();
        history.replaceState(null, '', '/');
      }
    } finally {
      time.mockRestore();
    }
  });

  it('keeps a run of its own (the Studio’s rehearsal) apart: it starts where the talk is, and changes nothing of it', () => {
    const storage = new MemoryStorage();
    const talk = new PresentationStore(SHOW, storage);
    talk.save('show', { ...initialShowState(5, { s: 1, b: 2 }), writer: 'presenter-x' });
    const before = talk.load('show');
    const rehearse = () => {
      const host = document.createElement('main');
      document.body.appendChild(host);
      const audience = startAudience({
        host,
        project,
        show: SHOW,
        link: `${SHOW}-rehearsal`,
        rehearse: true,
        address: false,
        storage,
        clock: new ManualClock(),
      });
      dispose = audience.dispose;
      return () => posKey(audience.deck, audience.session?.state.pos ?? { s: 0, b: 0 });
    };
    // Its first time, it starts where the talk is.
    let at = rehearse();
    expect(at()).toBe('S01.3');
    key('PageDown');
    key('n');
    key('t');
    expect(at()).toBe('S01.4');
    dispose?.();
    dispose = null;
    // The talk's place and clock are as they were; the rehearsal picks up where it stopped.
    expect(talk.load('show')).toEqual(before);
    expect(talk.load('clock')).toBeNull();
    at = rehearse();
    expect(at()).toBe('S01.4');
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
