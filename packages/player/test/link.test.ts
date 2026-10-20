import { describe, expect, it } from 'vitest';
import {
  type Address,
  deckOf,
  initialShowState,
  Link,
  nextPos,
  type Payload,
  type Pos,
  PresentationStore,
  posKey,
  presentationId,
  resetSession,
  ShowSession,
  type ShowState,
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
  token?: string,
  targetOrigin?: string,
) {
  const link = new Link(role, SHOW, win.host(targetOrigin), { token });
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

describe('a step named in the address', () => {
  it('counts as a move made now, so a window holding an older saved place follows it', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const storage = new MemoryStorage();
    const first = session(browser, browser.window(), 'presenter', storage);
    browser.advance(10);
    first.s.dispatch({ type: 'gotoScene', number: 1 });
    first.link.stop();
    browser.advance(10_000);
    // The console opens at a bookmarked step; the audience window, opened from it, holds the saved place.
    const consoleWin = browser.window();
    const presenter = session(browser, consoleWin, 'presenter', storage, '#S04.2a');
    const audienceWin = browser.window(consoleWin);
    presenter.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience', storage);
    expect(posKey(deck, presenter.s.state.pos)).toBe('S04.2a');
    expect(posKey(deck, audience.s.state.pos)).toBe('S04.2a');
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

const after = (s: number, steps = 1): string => {
  let pos: Pos = { s, b: 0 };
  for (let i = 0; i < steps; i++) pos = nextPos(deck, pos) as Pos;
  return posKey(deck, pos);
};

describe('changes made in the same millisecond', () => {
  it('both reach the other window when one window makes two', () => {
    const browser = new FakeBrowser();
    const consoleWin = browser.window();
    const presenter = session(browser, consoleWin, 'presenter');
    const audienceWin = browser.window(consoleWin);
    presenter.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience');
    // No time passes between the two keys.
    consoleWin.run(() => {
      presenter.s.dispatch({ type: 'gotoScene', number: 4 });
      presenter.s.dispatch({ type: 'next' });
    });
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(4));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(4));
    expect(presenter.s.state.updatedAt).toBe(browser.now + 1);
  });

  it('settles two changes stamped alike the same way in every window, whichever arrives first', () => {
    const ends = [false, true].map((reversed) => {
      const browser = new FakeBrowser();
      browser.channels = false;
      const stateAt = (s: number, writer: string): ShowState => ({
        ...initialShowState(browser.now, { s, b: 0 }),
        writer,
      });
      const order = [stateAt(2, 'audience-a'), stateAt(5, 'audience-b')];
      if (reversed) order.reverse();
      const win = browser.window();
      const w = session(browser, win, 'audience');
      const senderWin = browser.window();
      const sender = new Link('audience', SHOW, senderWin.host());
      sender.addWindow(win);
      senderWin.run(() => {
        sender.start();
        for (const state of order) sender.send({ t: 'state', state, reason: 'update' });
      });
      return posKey(deck, w.s.state.pos);
    });
    expect(ends).toEqual([after(5, 0), after(5, 0)]);
  });
});

describe('two audience windows with no BroadcastChannel', () => {
  it('follow either of them, through the console that opened both', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const consoleWin = browser.window();
    const presenter = session(browser, consoleWin, 'presenter');
    const a = browser.window(consoleWin);
    const b = browser.window(consoleWin);
    presenter.link.addWindow(a);
    presenter.link.addWindow(b);
    const one = session(browser, a, 'audience');
    const two = session(browser, b, 'audience');
    const places = () => [presenter, one, two].map((w) => posKey(deck, w.s.state.pos));
    browser.advance(10);
    a.run(() => one.s.dispatch({ type: 'gotoScene', number: 3 }));
    expect(places()).toEqual(Array(3).fill(after(3, 0)));
    browser.advance(10);
    b.run(() => two.s.dispatch({ type: 'next' }));
    expect(places()).toEqual(Array(3).fill(after(3)));
    // Each change reached each window once, however many ways it came.
    expect(two.changes.filter((c) => c.startsWith(`${after(3, 0)} `))).toHaveLength(1);
    expect(one.changes.filter((c) => c.startsWith(`${after(3)} `))).toHaveLength(1);
  });
});

describe('who may move the show', () => {
  it('ignores a page of another origin that holds the audience window, and never lets it in', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const consoleWin = browser.window();
    const presenter = session(browser, consoleWin, 'presenter');
    const audienceWin = browser.window(consoleWin);
    presenter.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience');
    const evil = browser.window(null, 'https://evil.test');
    const forger = new Link('presenter', SHOW, evil.host());
    forger.addWindow(audienceWin);
    const forged = {
      ...audience.s.state,
      pos: { s: 9, b: 0 },
      updatedAt: browser.now + 60_000,
      writer: 'zzz',
    };
    evil.run(() => {
      forger.start();
      forger.send({ t: 'state', state: forged, reason: 'update' });
    });
    expect(posKey(deck, audience.s.state.pos)).toBe('S00.1');
    browser.advance(1100);
    // Nothing the audience window says reaches the forger, and it counts only the real console.
    expect(evil.origins).toEqual([]);
    expect(audience.link.count('presenter')).toBe(1);
    // The real console still moves it.
    consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(0));
  });

  it('lets in, on a file opened from disk, only windows with the presentation’s join token', () => {
    const TOKEN = '0123456789abcdef0123456789abcdef';
    const browser = new FakeBrowser();
    browser.channels = false;
    const consoleWin = browser.window(null, 'null');
    const presenter = session(browser, consoleWin, 'presenter', new MemoryStorage(), '', TOKEN, '*');
    const audienceWin = browser.window(consoleWin, 'null');
    presenter.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    browser.advance(10);
    consoleWin.run(() => presenter.s.dispatch({ type: 'gotoScene', number: 2 }));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2, 0));

    // Another file in the same browser, without the token or with a wrong one, moves nothing.
    for (const token of [undefined, 'f'.repeat(32)]) {
      const other = browser.window(null, 'null');
      const forger = new Link('presenter', SHOW, other.host('*'), { token });
      forger.addWindow(audienceWin);
      const forged = { ...audience.s.state, pos: { s: 9, b: 0 }, updatedAt: browser.now + 60_000 };
      other.run(() => {
        forger.start();
        forger.send({ t: 'state', state: forged, reason: 'update' });
      });
    }
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2, 0));

    // The audience window reloads: its token is in its address, so it rejoins and follows.
    audience.link.stop();
    const again = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    expect(posKey(deck, again.s.state.pos)).toBe(after(2, 0));
    browser.advance(10);
    consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
    expect(posKey(deck, again.s.state.pos)).toBe(after(2));

    // The console reloads (its tab keeps the token): the audience window's next message lets it back in.
    presenter.link.stop();
    const console2 = session(browser, consoleWin, 'presenter', presenter.storage, '', TOKEN, '*');
    browser.advance(1100);
    expect(console2.link.count('audience')).toBe(1);
    browser.advance(10);
    consoleWin.run(() => console2.s.dispatch({ type: 'next' }));
    expect(posKey(deck, again.s.state.pos)).toBe(after(2, 2));
  });

  it('ignores a state stamped with a time that is not a number of milliseconds, so later changes still arrive', () => {
    const browser = new FakeBrowser();
    const a = browser.window();
    const one = session(browser, a, 'presenter');
    const b = browser.window(a);
    one.link.addWindow(b);
    const two = session(browser, b, 'audience');
    for (const updatedAt of [Number.POSITIVE_INFINITY, Number.NaN, 1.5, -3])
      a.run(() =>
        one.link.send({
          t: 'state',
          state: { ...one.s.state, pos: { s: 9, b: 0 }, updatedAt },
          reason: 'update',
        }),
      );
    expect(posKey(deck, two.s.state.pos)).toBe('S00.1');
    browser.advance(10);
    a.run(() => one.s.dispatch({ type: 'gotoScene', number: 6 }));
    expect(posKey(deck, two.s.state.pos)).toBe(after(6, 0));
  });
});

describe('what a link remembers', () => {
  it('forgets the message numbers of a window that left or went quiet', () => {
    const browser = new FakeBrowser();
    browser.channels = false;
    const a = browser.window();
    const one = session(browser, a, 'presenter');
    const b = browser.window(a);
    one.link.addWindow(b);
    const two = session(browser, b, 'audience');
    browser.advance(1100);
    expect(one.link.remembered).toBe(1);
    b.run(() => two.link.stop());
    expect(one.link.remembered).toBe(0);
    // A window that says hello and then nothing more (it froze, or its tab was closed without a goodbye).
    const c = browser.window(a);
    const quiet = new Link('audience', SHOW, { ...c.host(), every: () => () => {} });
    c.run(() => quiet.start());
    expect(one.link.remembered).toBe(1);
    browser.advance(5000);
    expect(one.link.remembered).toBe(0);
    one.link.stop();
    expect(one.link.count('audience')).toBe(0);
  });
});
