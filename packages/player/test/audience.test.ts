// @vitest-environment jsdom
import { ManualClock } from '@loopweft/motion';
import { afterEach, describe, expect, it } from 'vitest';
import { posKey, presentationId, startAudience } from '../src/index.ts';
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

function open(rehearse: boolean, storage = new MemoryStorage()) {
  const host = document.createElement('main');
  document.body.appendChild(host);
  const clock = new ManualClock();
  const audience = startAudience({ host, project, show: SHOW, rehearse, storage, clock });
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
});
