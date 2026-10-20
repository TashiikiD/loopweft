// @vitest-environment jsdom
import { ManualClock } from '@loopweft/motion';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deckOf,
  onScreenView,
  type Payload,
  posKey,
  presentationId,
  scriptView,
  startConsole,
} from '../src/index.ts';
import { example, exampleText, MemoryStorage } from './helpers.ts';

const project = example();
const SHOW = presentationId(exampleText());

const key = (k: string, more: KeyboardEventInit = {}) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...more }));
const text = (selector: string) => document.querySelector(selector)?.textContent ?? '';

let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});

function open(projectText?: string) {
  const host = document.createElement('main');
  document.body.appendChild(host);
  const c = startConsole({
    host,
    project,
    show: SHOW,
    audience: { url: '?view=audience', name: 'test-audience' },
    storage: new MemoryStorage(),
    clock: new ManualClock(),
    ...(projectText ? { projectText } : {}),
  });
  dispose = c.dispose;
  return c;
}

describe('the presenter console', () => {
  it('shows the scene, the step, what comes next, and moves with the keys', () => {
    const c = open();
    key('4');
    expect(text('.lp-jump')).toBe(`Go to scene 04 · ${project.story.scenes[4]?.title}: press Enter`);
    key('Enter');
    expect(posKey(c.deck, c.session.state.pos)).toBe('S04.1');
    expect(text('.lp-scene-num')).toBe('04');
    expect(text('.lp-scene-sub')).toMatch(/^Step 1 of 9 · S04\.1 · /);
    expect(text('.lp-cue.next')).toContain('S04.2a');
    expect(document.querySelectorAll('.lp-step-list li')).toHaveLength(9);
    expect(document.querySelector('.lp-scene-chip.current')?.textContent).toMatch(/^04/);
    key('PageDown');
    expect(posKey(c.deck, c.session.state.pos)).toBe('S04.2a');
    expect(document.querySelector('.lp-step-list li.current')?.textContent).toMatch(/^2a/);
  });

  it('shows the notes and the script, which this example does not have, on G and F', () => {
    open();
    key('ArrowRight');
    expect(document.querySelector('.lp-n-takeaway')?.textContent).toBe(project.story.scenes[1]?.headline);
    expect(document.querySelector('.lp-notes-body .lp-markdown li')).not.toBeNull();
    key('f');
    expect(text('.lp-notes-body')).toMatch(/^This scene has no script/);
    expect(document.querySelector('.lp-tab.active')?.textContent).toBe('Script');
    key('g');
    expect(document.querySelector('.lp-tab.active')?.textContent).toBe('Notes');
  });

  it('starts the clock on T and keeps time against the scene’s target', () => {
    open();
    key('ArrowRight');
    expect(text('.lp-timing')).toContain('Clock not started');
    key('t');
    expect(document.querySelector('.lp-btn-clock')?.textContent).toBe('⏸ Pause clock');
    // The clock runs: on a busy computer a second may pass before it is read.
    expect(text('.lp-timing')).toMatch(/0:0\d \/ 1:00/);
    expect(text('.lp-timing')).toMatch(/1[34]:\d\d to 14:00/);
  });

  it('shows the chips for blackout, pause and categories in words, and the help on ?', () => {
    open();
    key('b');
    key('p');
    key('c');
    const chips = [...document.querySelectorAll('.lp-status .lp-chip:not([hidden])')].map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(['Blackout on', 'Animation paused', 'Categories in words', 'No audience window']);
  });

  it('opens the keyboard help as a dialog, with the focus in it, and gives the focus back', () => {
    open();
    const trigger = [...document.querySelectorAll<HTMLButtonElement>('.lp-controls button')].find(
      (b) => b.textContent === '?',
    ) as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    const help = document.querySelector('.lp-help') as HTMLDialogElement;
    expect(help.tagName).toBe('DIALOG');
    expect(help.hasAttribute('open')).toBe(true);
    expect(help.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    expect(document.activeElement?.textContent).toBe('Close');
    expect(help.contains(document.activeElement)).toBe(true);
    key('Escape');
    expect(help.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(trigger);
    // ? opens it and closes it too; so does its Close button.
    key('?');
    expect(help.hasAttribute('open')).toBe(true);
    (document.activeElement as HTMLButtonElement).click();
    expect(help.hasAttribute('open')).toBe(false);
  });

  it('moves nothing behind the open keyboard help: its keys are its own, and Esc, ? or H close it', () => {
    open();
    const help = document.querySelector('.lp-help') as HTMLDialogElement;
    for (const close of ['Escape', '?', 'h', 'H']) {
      key('?');
      expect(help.hasAttribute('open')).toBe(true);
      for (const k of ['PageDown', 'ArrowRight', ' ', 'End', '4', 'Enter', 'b', 'c', 'p', 't']) {
        const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
        (document.activeElement ?? document).dispatchEvent(e);
        // Left to the dialog: to scroll it, or to work its Close button.
        expect(e.defaultPrevented).toBe(false);
      }
      expect(text('.lp-scene-sub')).toMatch(/· S00\.1/);
      const chips = [...document.querySelectorAll('.lp-status .lp-chip:not([hidden])')].map(
        (c) => c.textContent,
      );
      expect(chips).toEqual(['No audience window']);
      key(close, { shiftKey: close === 'H' });
      expect(help.hasAttribute('open')).toBe(false);
    }
    // Closed, the keys move the show again.
    key('PageDown');
    expect(text('.lp-scene-sub')).toMatch(/· S01\.1 ·/);
  });

  it('keeps the keyboard’s focus on a button worked from the keyboard, and gives it back to the show after a mouse click', () => {
    open();
    const next = [...document.querySelectorAll<HTMLButtonElement>('.lp-controls button')].find(
      (b) => b.textContent === 'Next ▶',
    ) as HTMLButtonElement;
    next.focus();
    // Space or Enter on a focused button: a click with no mouse (detail 0).
    next.click();
    expect(text('.lp-scene-sub')).toMatch(/· S01\.1 ·/);
    expect(document.activeElement).toBe(next);
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(text('.lp-scene-sub')).toMatch(/· S01\.2 ·/);
    expect(document.activeElement).not.toBe(next);
  });

  it('keeps a focused step button through other changes, and moves the focus with the scene', () => {
    open();
    key('4');
    key('Enter');
    const steps = () => [...document.querySelectorAll<HTMLButtonElement>('.lp-step-list button')];
    const second = steps()[1] as HTMLButtonElement;
    second.focus();
    second.click();
    expect(text('.lp-scene-sub')).toMatch(/· S04\.2a ·/);
    key('PageDown');
    key('p');
    key('b');
    key('c');
    // The same button, still in the list, still focused; the current step marked.
    expect(steps()[1]).toBe(second);
    expect(document.activeElement).toBe(second);
    expect(steps()[2]?.getAttribute('aria-current')).toBe('true');
    expect(steps()[2]?.closest('li')?.className).toBe('current');
    // Another scene: a new list, the focus on its current step.
    key('ArrowRight', { shiftKey: true });
    expect(text('.lp-scene-sub')).toMatch(/· S05\.1 ·/);
    expect(steps()).not.toContain(second);
    expect(document.activeElement).toBe(steps()[0]);
  });

  it('says which of Notes and Script is chosen, as two pressed buttons', () => {
    open();
    const group = document.querySelector('.lp-tabs') as HTMLElement;
    expect(group.getAttribute('role')).toBe('group');
    const pressed = () =>
      [...group.querySelectorAll('button')].map((b) => `${b.textContent} ${b.getAttribute('aria-pressed')}`);
    expect(pressed()).toEqual(['Notes true', 'Script false']);
    key('f');
    expect(pressed()).toEqual(['Notes false', 'Script true']);
    expect(group.querySelector('[aria-selected]')).toBeNull();
  });

  it('sends the project to an audience window that asks for it, and only if it was given', async () => {
    /** What the console says when an audience window on the presentation's channel asks for the project. */
    const ask = async (): Promise<Payload[]> => {
      const channel = new BroadcastChannel(`loopweft-present-${SHOW}`);
      const heard: Payload[] = [];
      channel.onmessage = (e: MessageEvent) => {
        if ((e.data as { from?: string }).from === 'presenter') heard.push((e.data as { msg: Payload }).msg);
      };
      channel.postMessage({
        lw: 'loopweft-present',
        show: SHOW,
        from: 'audience',
        id: 'a1',
        seq: 1,
        msg: { t: 'needProject' },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      channel.close();
      return heard;
    };
    open(exampleText());
    expect((await ask()).some((m) => m.t === 'project' && m.text === exampleText())).toBe(true);
    dispose?.();
    dispose = null;
    open();
    expect((await ask()).some((m) => m.t === 'project')).toBe(false);
  });
});

describe('what the console reads from the project', () => {
  const deck = deckOf(project);

  it('names each lit link with its sign, type, conditions, mechanism and every page cited', () => {
    const rows = onScreenView(project, deck, { s: 4, b: 1 }).map((r) => r.textContent);
    const link = project.links.find((l) => l.id === 'E022');
    expect(rows[0]).toContain('E022');
    expect(rows[0]).toContain('+ increases');
    expect(rows[0]).toContain('conditional');
    expect(rows[0]).toContain(link?.rationale ?? '?');
    expect(rows[0]).toContain('Lawrence et al. (2024), p. 8');
  });

  it('gives a lit loop its own sources and caution', () => {
    const r1 = project.loops.find((l) => l.id === 'R1');
    const label = project.sources.find((s) => s.id === 'L')?.label;
    const row = onScreenView(project, deck, { s: 5, b: 0 })
      .map((r) => r.textContent ?? '')
      .find((t) => t.startsWith('R1 ·'));
    expect(row).toContain(`${label}, p. 8`);
    expect(row).toContain(r1?.caution ?? '?');
    // A loop that cites nothing says so.
    const bare = structuredClone(project);
    const loop = bare.loops.find((l) => l.id === 'R1');
    if (!loop) throw new Error('no R1');
    loop.citations = [];
    const none = onScreenView(bare, deckOf(bare), { s: 5, b: 0 })
      .map((r) => r.textContent ?? '')
      .find((t) => t.startsWith('R1 ·'));
    expect(none).toContain('No source cited');
  });

  it('shows what an overlay cites in full: pages, strength and note', () => {
    const cited = structuredClone(project);
    const overlay = cited.story.scenes[3]?.steps[0]?.overlays.find((o) => o.type === 'legend');
    if (!overlay || !('citations' in overlay)) throw new Error('no legend');
    overlay.citations = [{ source: 'L', pages: '7', strength: 'strong', note: 'Figure 2' }];
    const label = project.sources.find((s) => s.id === 'L')?.label;
    const rows = onScreenView(cited, deckOf(cited), { s: 3, b: 0 }).map((r) => r.textContent ?? '');
    expect(rows.find((t) => t.startsWith('legend'))).toBe(`legend${label}, p. 7 · strong · Figure 2`);
  });

  it('says when a step has nothing cited on screen', () => {
    const empty = {
      ...project,
      story: {
        scenes: [
          {
            ...project.story.scenes[0],
            steps: [{ id: '1', label: 'x', map: { show: false }, overlays: [] }],
          },
        ],
      },
    };
    const d = deckOf(empty as typeof project);
    expect(onScreenView(empty as typeof project, d, { s: 0, b: 0 }).map((r) => r.textContent)).toEqual([
      'Nothing cited on screen in this step.',
    ]);
  });

  it('marks each key press in a script: the steps by their ids, then the next scene', () => {
    const scripted = structuredClone(project);
    const scene = scripted.story.scenes[1];
    if (!scene) throw new Error('no scene');
    scene.script = 'One. [>] Two. [>] Three. [>] Four. [>] On to the next.';
    const d = deckOf(scripted);
    const marks = scriptView(document, d, { s: 1, b: 0 })
      .flatMap((el) => [...el.querySelectorAll('.lp-key[data-mark]')])
      .map((k) => k.textContent);
    expect(marks).toEqual(['2', '3', '4', 'S02']);
  });
});
