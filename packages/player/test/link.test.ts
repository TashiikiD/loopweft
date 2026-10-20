import { describe, expect, it } from 'vitest';
import {
  type Address,
  deckOf,
  Link,
  type Payload,
  PresentationStore,
  posKey,
  presentationId,
  resetSession,
  ShowSession,
  savedSession,
} from '../src/index.ts';
import { example, exampleText, FakeBrowser, type FakeWindow, MemoryStorage } from './helpers.ts';

const project = example();
const deck = deckOf(project);
const SHOW = presentationId(exampleText());

function address(initial = ''): Address & { hash: string } {
  const a = {
    hash: initial,
    read: () => a.hash,
    write: (h: string) => {
      a.hash = h;
    },
    listen: () => () => {},
  };
  return a;
}

/** A window running a session of the example, as a presenter or an audience. */
function session(
  browser: FakeBrowser,
  win: FakeWindow,
  role: 'presenter' | 'audience',
  storage = new MemoryStorage(),
  hash = '',
) {
  const link = new Link(role, SHOW, win.host());
  const changes: string[] = [];
  const s = new ShowSession({
    deck,
    link,
    store: new PresentationStore(SHOW, storage),
    address: address(hash),
    now: () => browser.now,
    onChange: (next, _prev, reason) => changes.push(`${posKey(deck, next.pos)} ${reason}`),
  });
  win.run(() => s.start());
  return { s, link, changes, storage };
}

describe('the presentation id', () => {
  it('is the same for the same project text, and differs for another', () => {
    expect(presentationId(exampleText())).toBe(SHOW);
    expect(SHOW).toMatch(/^[0-9a-f]{8}$/);
    expect(presentationId(`${exampleText()} `)).not.toBe(SHOW);
  });
});

describe('the link between windows', () => {
  for (const channels of [true, false]) {
    it(`keeps a console and the audience window it opened in step ${channels ? 'over a BroadcastChannel' : 'with no BroadcastChannel (a file in Safari)'}`, () => {
      const browser = new FakeBrowser();
      browser.channels = channels;
      const consoleWin = browser.window();
      const presenter = session(browser, consoleWin, 'presenter');
      const audienceWin = browser.window(consoleWin);
      presenter.link.addWindow(audienceWin);
      const audience = session(browser, audienceWin, 'audience');

      consoleWin.run(() => presenter.s.dispatch({ type: 'gotoScene', number: 4 }));
      expect(posKey(deck, audience.s.state.pos)).toBe('S04.1');
      expect(audience.changes.at(-1)).toBe('S04.1 remote');
      // Keys work in the audience window too, and the console follows.
      browser.advance(10);
      audienceWin.run(() => audience.s.dispatch({ type: 'next' }));
      expect(posKey(deck, presenter.s.state.pos)).toBe('S04.2a');
      // Each change arrived once, however many ways it came.
      expect(presenter.changes.filter((c) => c.startsWith('S04.2a'))).toHaveLength(1);
      browser.advance(1500);
      expect(presenter.link.count('audience')).toBe(1);
      expect(audience.link.alive('presenter')).toBe(true);
    });
  }

  it('brings a reloaded audience window back to where the show is', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const consoleWin = browser.window();
    const presenter = session(browser, consoleWin, 'presenter');
    const audienceWin = browser.window(consoleWin);
    presenter.link.addWindow(audienceWin);
    session(browser, audienceWin, 'audience');
    browser.advance(10);
    consoleWin.run(() => presenter.s.dispatch({ type: 'gotoScene', number: 7 }));
    // The reload: a new page in the same window, with nothing saved (another browser profile, say).
    audienceWin.closed = false;
    const again = session(browser, audienceWin, 'audience');
    expect(posKey(deck, again.s.state.pos)).toBe('S07.1');
    expect(again.changes.at(-1)).toBe('S07.1 sync');
  });

  it('finds a reloaded console again through the audience window that it opened', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const consoleWin = browser.window();
    const first = session(browser, consoleWin, 'presenter');
    const audienceWin = browser.window(consoleWin);
    first.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience');
    browser.advance(10);
    audienceWin.run(() => audience.s.dispatch({ type: 'gotoScene', number: 3 }));
    // The console reloads: it has lost its handle on the audience window, which still has its opener.
    first.link.stop();
    const reloaded = session(browser, consoleWin, 'presenter', first.storage);
    expect(posKey(deck, reloaded.s.state.pos)).toBe('S03.1');
    browser.advance(1100);
    // The audience window's ping reached it, so it can answer.
    expect(reloaded.link.count('audience')).toBe(1);
    browser.advance(10);
    consoleWin.run(() => reloaded.s.dispatch({ type: 'next' }));
    expect(posKey(deck, audience.s.state.pos)).toBe('S03.2');
  });

  it('keeps the newest change when two windows disagree, and ignores other presentations', () => {
    const browser = new FakeBrowser();
    const a = browser.window();
    const one = session(browser, a, 'presenter');
    const b = browser.window(a);
    one.link.addWindow(b);
    const two = session(browser, b, 'audience');
    browser.advance(5);
    a.run(() => one.s.dispatch({ type: 'gotoScene', number: 2 }));
    const stale = { ...two.s.state, pos: { s: 9, b: 0 }, updatedAt: 1 };
    const other = new Link('presenter', 'ffffffff', b.host());
    const heard: Payload[] = [];
    other.on((m) => heard.push(m));
    b.run(() => other.start());
    a.run(() => one.link.send({ t: 'state', state: stale, reason: 'update' }));
    expect(posKey(deck, two.s.state.pos)).toBe('S02.1');
    expect(heard).toEqual([]);
  });

  it('forgets a window that went quiet', () => {
    const browser = new FakeBrowser();
    const a = browser.window();
    const one = session(browser, a, 'presenter');
    const b = browser.window(a);
    one.link.addWindow(b);
    const two = session(browser, b, 'audience');
    browser.advance(1100);
    expect(one.link.count('audience')).toBe(1);
    two.link.stop();
    expect(one.link.count('audience')).toBe(0);
  });

  it('posts to the window’s own origin, or to any where it has none', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const a = browser.window();
    const b = browser.window(a);
    const link = new Link('audience', SHOW, b.host('*'));
    b.run(() => link.start());
    expect(a.origins).toEqual(['*']);
    const c = browser.window(a);
    const own = new Link('audience', SHOW, c.host('https://example.test'));
    c.run(() => own.start());
    expect(a.origins.at(-1)).toBe('https://example.test');
  });
});

describe('the saved place', () => {
  it('opens where the address says, or where the last run left off, and resets to the start', () => {
    const browser = new FakeBrowser();
    const storage = new MemoryStorage();
    const first = session(browser, browser.window(), 'presenter', storage);
    first.s.dispatch({ type: 'gotoScene', number: 6 });
    const store = new PresentationStore(SHOW, storage);
    expect(savedSession(deck, store, browser.now)).toMatchObject({ key: 'S06.1', fresh: false });
    expect(posKey(deck, session(browser, browser.window(), 'audience', storage).s.state.pos)).toBe('S06.1');
    expect(posKey(deck, session(browser, browser.window(), 'audience', storage, '#S02.3').s.state.pos)).toBe(
      'S02.3',
    );
    resetSession(store);
    expect(savedSession(deck, store, browser.now)).toMatchObject({ key: 'S00.1', fresh: true });
    // Each presentation keeps its own place.
    expect([...storage.items.keys()].every((k) => k.startsWith(`loopweft.present.${SHOW}.`))).toBe(true);
  });

  it('runs without storage, and with a storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new PresentationStore(SHOW, throwing);
    store.save('show', { a: 1 });
    expect(store.load('show')).toBeNull();
    expect(new PresentationStore(SHOW, null).load('clock')).toBeNull();
  });
});
