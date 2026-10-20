// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { presentationId, startPage } from '../src/index.ts';
import { example, exampleText, MemoryStorage } from './helpers.ts';

const project = example();
const SHOW = presentationId(exampleText());

let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.replaceChildren();
});

/** The start page in a page whose main landmark is its host, as the exported file has it. */
function open(notes: boolean) {
  const host = document.createElement('main');
  host.id = 'player';
  document.body.appendChild(host);
  dispose = startPage({ host, project, show: SHOW, notes, storage: new MemoryStorage() }).dispose;
  return host;
}

const keys = () => [...document.querySelectorAll('.lp-start-keys dt')].map((d) => d.textContent);

describe('the start page', () => {
  it('offers each way in as a heading, a few words and a link, inside the one main landmark', () => {
    open(true);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    const cards = [...document.querySelectorAll('.lp-start-card')];
    expect(cards.map((c) => c.tagName)).toEqual(['ARTICLE', 'ARTICLE']);
    expect(cards.map((c) => c.querySelector('h2')?.textContent)).toEqual([
      'Presenter console',
      'Full-screen slides',
    ]);
    expect(cards.map((c) => c.querySelector('a')?.getAttribute('href'))).toEqual([
      '?view=presenter',
      '?view=audience&rehearse',
    ]);
    expect(document.querySelector('.lp-start-card button')).toBeNull();
    expect(keys()).toContain('N (slides)');
    expect(keys()).toContain('G / F (console)');
  });

  it('in a copy for the audience, offers the slides only, and lists no key it does not have', () => {
    open(false);
    const links = [...document.querySelectorAll('.lp-start-card a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['?view=audience']);
    expect(keys()).not.toContain('N (slides)');
    expect(keys()).not.toContain('G / F (console)');
    expect(keys()).toContain('F (slides)');
  });
});
