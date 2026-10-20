import { describe, expect, it } from 'vitest';
import {
  type Address,
  deckOf,
  type Envelope,
  initialShowState,
  type KeyValue,
  LEAD_MS,
  Link,
  nextPos,
  type Payload,
  type Pos,
  PresentationStore,
  posKey,
  presentationId,
  receiveLimit,
  resetSession,
  restoreLimit,
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

  it('runs without storage, and with a storage that throws, keeping what the window saved while it is open', () => {
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
    for (const storage of [throwing, null]) {
      const store = new PresentationStore(SHOW, storage);
      expect(store.load('clock')).toBeNull();
      store.save('show', { a: 1 });
      expect(store.load('show')).toEqual({ a: 1 });
      store.remove('show');
      expect(store.load('show')).toBeNull();
      // Another window's store has nothing of it.
      expect(new PresentationStore(SHOW, storage).load('show')).toBeNull();
    }
    // Where storage works, it counts: a reset made in another window is seen here.
    const storage = new MemoryStorage();
    const here = new PresentationStore(SHOW, storage);
    here.save('clock', { running: false, startedAt: null, accumulatedMs: 60_000 });
    resetSession(new PresentationStore(SHOW, storage));
    expect(here.load('clock')).toBeNull();
  });

  it('lets storage count again once it works and another window has saved or reset there', () => {
    const clock = (ms: number) => ({ running: false, startedAt: null, accumulatedMs: ms });
    const shared = new MemoryStorage();
    // A storage that refuses to write (full), then writes again; in the second run it cannot even be read at
    // first.
    for (const unreadable of [false, true]) {
      shared.items.clear();
      let broken = true;
      const refuse = (): never => {
        throw new Error('Storage is full.');
      };
      const flaky: KeyValue = {
        getItem: (k) => (broken && unreadable ? refuse() : shared.getItem(k)),
        setItem: (k, v) => (broken ? refuse() : shared.setItem(k, v)),
        removeItem: (k) => shared.removeItem(k),
      };
      const audience = new PresentationStore(SHOW, flaky);
      audience.save('clock', clock(10_000));
      expect(audience.load('clock')).toEqual(clock(10_000));
      broken = false;
      // Storage works again, and holds nothing newer: the kept clock is still the one.
      expect(audience.load('clock')).toEqual(clock(10_000));
      // The console saves a newer clock, then resets it: this window sees both.
      const presenter = new PresentationStore(SHOW, flaky);
      presenter.save('clock', clock(60_000));
      expect(audience.load('clock')).toEqual(clock(60_000));
      presenter.remove('clock');
      expect(audience.load('clock')).toBeNull();
    }
  });

  it('saves nothing that is not JSON, without throwing, and keeps what was saved', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const refuse = (): never => {
      throw new Error('blocked');
    };
    for (const storage of [
      new MemoryStorage(),
      null,
      { getItem: refuse, setItem: refuse, removeItem: refuse },
    ]) {
      const store = new PresentationStore(SHOW, storage);
      store.save('show', { a: 1 });
      for (const bad of [{ big: 1n }, cyclic, undefined, () => 1])
        expect(() => store.save('show', bad)).not.toThrow();
      expect(store.load('show')).toEqual({ a: 1 });
    }
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

    // The audience window reloads: its token is in its address, so it rejoins and follows. It waits for the
    // console's next ping (it says nothing to its opener before that), then asks where the show is.
    audienceWin.run(() => audience.link.stop());
    const again = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    expect(posKey(deck, again.s.state.pos)).toBe('S00.1');
    browser.advance(1100);
    expect(posKey(deck, again.s.state.pos)).toBe(after(2, 0));
    browser.advance(10);
    consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
    expect(posKey(deck, again.s.state.pos)).toBe(after(2));

    // The console reloads (its tab keeps the token): the audience window's next message lets it back in.
    consoleWin.run(() => presenter.link.stop());
    const console2 = session(browser, consoleWin, 'presenter', presenter.storage, '', TOKEN, '*');
    browser.advance(1100);
    expect(console2.link.count('audience')).toBe(1);
    browser.advance(10);
    consoleWin.run(() => console2.s.dispatch({ type: 'next' }));
    expect(posKey(deck, again.s.state.pos)).toBe(after(2, 2));
  });

  it('hands the join token, on a file opened from disk, to no page that opened a window of the show', () => {
    const TOKEN = '0123456789abcdef0123456789abcdef';
    const browser = new FakeBrowser();
    browser.channels = false;
    // Another file in the same browser opens the console (any page can open a file the browser can reach),
    // and listens for what reaches it.
    const other = browser.window(null, 'null');
    const heard: unknown[] = [];
    other.host('*').listen((data) => heard.push(data));
    const consoleWin = browser.window(other, 'null');
    const presenter = session(browser, consoleWin, 'presenter', new MemoryStorage(), '', TOKEN, '*');
    const audienceWin = browser.window(consoleWin, 'null');
    presenter.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    // It opens a copy of the slides too, which makes a token of its own (its address has none).
    const copy = browser.window(other, 'null');
    session(browser, copy, 'audience', new MemoryStorage(), '', 'c'.repeat(32), '*');
    browser.advance(2500);
    consoleWin.run(() => presenter.s.dispatch({ type: 'gotoScene', number: 2 }));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2, 0));
    // Nothing reached it: no token, no state, not even a hello.
    expect(heard).toEqual([]);

    // So what it sends moves nothing, whether it names no token or the copy's.
    for (const token of [undefined, 'c'.repeat(32)]) {
      const forger = new Link('presenter', SHOW, other.host('*'), { token });
      forger.addWindow(consoleWin);
      forger.addWindow(audienceWin);
      const forged = { ...audience.s.state, pos: { s: 9, b: 0 }, updatedAt: browser.now + 60_000 };
      other.run(() => {
        forger.start();
        forger.send({ t: 'state', state: forged, reason: 'update' });
        forger.stop();
      });
    }
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(2, 0));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2, 0));
    expect(heard).toEqual([]);

    // The console and its audience window still find each other after either reloads.
    audienceWin.run(() => audience.link.stop());
    const audience2 = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    browser.advance(1100);
    expect(posKey(deck, audience2.s.state.pos)).toBe(after(2, 0));
    consoleWin.run(() => presenter.link.stop());
    const console2 = session(browser, consoleWin, 'presenter', new MemoryStorage(), '', TOKEN, '*');
    browser.advance(1100);
    // The reloaded console kept nothing, and learnt the show from the audience window.
    expect(posKey(deck, console2.s.state.pos)).toBe(after(2, 0));
    consoleWin.run(() => console2.s.dispatch({ type: 'next' }));
    expect(posKey(deck, audience2.s.state.pos)).toBe(after(2));
    audienceWin.run(() => audience2.s.dispatch({ type: 'next' }));
    expect(posKey(deck, console2.s.state.pos)).toBe(after(2, 2));
    expect(heard).toEqual([]);
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

describe('on a file opened from disk, every message proves itself', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';

  /** A console and the audience window it opened, both files from disk, in step. */
  function fromDisk(channels: boolean) {
    const browser = new FakeBrowser();
    browser.channels = channels;
    const consoleWin = browser.window(null, 'null');
    const presenter = session(browser, consoleWin, 'presenter', new MemoryStorage(), '', TOKEN, '*');
    const audienceWin = browser.window(consoleWin, 'null');
    presenter.link.addWindow(audienceWin);
    const audience = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    browser.advance(1100);
    consoleWin.run(() => presenter.s.dispatch({ type: 'gotoScene', number: 2 }));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2, 0));
    return { browser, consoleWin, presenter, audienceWin, audience };
  }

  it('even over the channel, which another local file may share: its changes move nothing, nor travel', () => {
    const { browser, consoleWin, presenter, audienceWin, audience } = fromDisk(true);
    // Another file in the same browser on the same channel (its name comes from the project), without the
    // token or with one of its own.
    for (const token of [undefined, 'f'.repeat(32)]) {
      const other = browser.window(null, 'null');
      const forger = new Link('presenter', SHOW, other.host('*'), { token });
      const forged = {
        ...initialShowState(browser.now + 60_000, { s: 9, b: 0 }),
        writer: 'zzz',
      };
      other.run(() => {
        forger.start();
        forger.send({ t: 'state', state: forged, reason: 'update' });
        forger.send({ t: 'ping' });
      });
      browser.advance(1100);
      other.run(() => forger.stop());
    }
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(2, 0));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2, 0));
    expect(presenter.link.count('presenter')).toBe(0);
    expect(audience.link.count('presenter')).toBe(1);
    // The two still move each other.
    consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2));
    audienceWin.run(() => audience.s.dispatch({ type: 'next' }));
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(2, 2));
  });

  it('acts on no message recorded and sent again, even to a console that starts again with nothing saved', () => {
    for (const channels of [false, true]) {
      const { browser, consoleWin, presenter, audienceWin, audience } = fromDisk(channels);
      // The audience window goes on to another page, which records what the console sends.
      audienceWin.run(() => audience.link.stop());
      const heard: Envelope[] = [];
      audienceWin.host('*').listen((data) => heard.push(data as Envelope));
      consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
      const recorded = heard.filter((e) => e.msg.t === 'state');
      expect(recorded.length).toBeGreaterThan(0);
      // The console starts again from the first step (Start again, or nothing saved) in the same tab, with
      // the same token.
      consoleWin.run(() => presenter.link.stop());
      const again = session(browser, consoleWin, 'presenter', new MemoryStorage(), '', TOKEN, '*');
      expect(posKey(deck, again.s.state.pos)).toBe('S00.1');
      // The page sends the recorded messages back, unchanged, to the window that opened it.
      for (const e of [...recorded, ...heard]) audienceWin.run(() => consoleWin.postMessage(e, '*'));
      browser.advance(1100);
      expect(posKey(deck, again.s.state.pos)).toBe('S00.1');
      expect(again.link.count('presenter')).toBe(0);
      // The audience window comes back: the two find each other and move together.
      const back = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
      browser.advance(1100);
      expect(again.link.count('audience')).toBe(1);
      consoleWin.run(() => again.s.dispatch({ type: 'gotoScene', number: 4 }));
      expect(posKey(deck, back.s.state.pos)).toBe(after(4, 0));
      audienceWin.run(() => back.s.dispatch({ type: 'next' }));
      expect(posKey(deck, again.s.state.pos)).toBe(after(4));
    }
  });

  it('turns away, without throwing, a message whose content cannot be proved (a BigInt, a cycle)', () => {
    const { browser, consoleWin, presenter, audienceWin, audience } = fromDisk(true);
    const cyclic: Record<string, unknown> = { t: 'ping' };
    cyclic.self = cyclic;
    const probe = (msg: unknown, seq: number) => ({
      lw: 'loopweft-present',
      show: SHOW,
      from: 'audience',
      id: 'probe',
      seq,
      msg,
      mac: '0'.repeat(64),
    });
    const other = browser.window(null, 'null');
    const channel = browser.openChannel(`loopweft-present-${SHOW}`, other);
    for (const [i, msg] of [{ t: 'ping', extra: 1n }, cyclic].entries()) {
      expect(() => other.run(() => consoleWin.postMessage(probe(msg, i + 1), '*'))).not.toThrow();
      expect(() => other.run(() => channel?.postMessage(probe(msg, i + 10)))).not.toThrow();
    }
    expect(presenter.link.count('audience')).toBe(1);
    expect(audience.link.count('audience')).toBe(0);
    // A change made properly still arrives.
    consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
    expect(posKey(deck, audience.s.state.pos)).toBe(after(2));
    audienceWin.run(() => audience.s.dispatch({ type: 'next' }));
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(2, 2));
  });
});

describe('a window that goes on to another page', () => {
  it('leaves that page nothing to move the show with, and still finds the show when it comes back', () => {
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

    // The audience window goes on to another file (a link followed, an address typed), not closed: the
    // console still holds it, and posts to whatever page it holds now.
    audienceWin.run(() => audience.link.stop());
    const heard: Envelope[] = [];
    audienceWin.host('*').listen((data) => heard.push(data as Envelope));
    browser.advance(1100);
    consoleWin.run(() => presenter.s.dispatch({ type: 'next' }));
    expect(heard.some((e) => e.msg.t === 'ping')).toBe(true);
    expect(heard.some((e) => e.msg.t === 'state')).toBe(true);
    // What reaches it has a proof in it, never the token.
    expect(JSON.stringify(heard)).not.toContain(TOKEN);
    expect(heard.every((e) => typeof e.mac === 'string' && e.mac.length === 64)).toBe(true);

    // From what it heard it makes messages of its own, as another window would send them: a step under an
    // old proof, the console's own messages under another sender, a ping. None moves the console, and the
    // console counts no window there (the audience window said goodbye when it left).
    const ping = heard.find((e) => e.msg.t === 'ping') as Envelope;
    const state = heard.find((e) => e.msg.t === 'state') as Envelope;
    const step = (state.msg as { state: ShowState }).state;
    const moved: Payload = {
      t: 'state',
      state: { ...step, pos: { s: 9, b: 0 }, updatedAt: browser.now + 9 },
      reason: 'update',
    };
    const other = { from: 'audience' as const, id: 'audience-other' };
    const forged: Envelope[] = [
      { ...state, ...other, seq: 1, msg: moved },
      { ...state, ...other, seq: 2 },
      { ...ping, ...other, seq: 3 },
      ...heard.map((e, i) => ({ ...e, ...other, seq: 10 + i })),
    ];
    for (const e of forged) audienceWin.run(() => consoleWin.postMessage(e, '*'));
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(2));
    expect(presenter.link.count('audience')).toBe(0);

    // The audience window comes back to the show (its address keeps the token): it finds the console again.
    const back = session(browser, audienceWin, 'audience', new MemoryStorage(), '', TOKEN, '*');
    browser.advance(1100);
    expect(posKey(deck, back.s.state.pos)).toBe(after(2));
    audienceWin.run(() => back.s.dispatch({ type: 'next' }));
    expect(posKey(deck, presenter.s.state.pos)).toBe(after(2, 2));
  });
});

describe('a state stamped far ahead of the clock', () => {
  it('lets the change after it arrive, whether a window took it back from storage or from another window', () => {
    // Every window's clock stands still: nothing that follows can lean on time passing.
    const browser = new FakeBrowser();
    const now = browser.now;
    // A saved place stamped as far ahead as a window takes back (the clock was set back since).
    const storage = new MemoryStorage();
    new PresentationStore(SHOW, storage).save('show', initialShowState(restoreLimit(now), { s: 3, b: 0 }));
    const a = browser.window();
    const one = session(browser, a, 'presenter', storage);
    expect(one.s.state.updatedAt).toBe(now + LEAD_MS);
    const b = browser.window(a);
    one.link.addWindow(b);
    const two = session(browser, b, 'audience');
    expect(posKey(deck, two.s.state.pos)).toBe('S03.1');
    a.run(() => one.s.dispatch({ type: 'next' }));
    expect(posKey(deck, two.s.state.pos)).toBe(after(3));
    b.run(() => two.s.dispatch({ type: 'next' }));
    expect(posKey(deck, one.s.state.pos)).toBe(after(3, 2));

    // A change from a third window stamped as far ahead as the two take in: both take it, and each
    // one's next change reaches the other. A millisecond more is refused.
    const c = browser.window();
    const third = new Link('presenter', SHOW, c.host());
    c.run(() => third.start());
    const edge = receiveLimit(now, one.s.state);
    const ahead = (updatedAt: number, s: number): ShowState => ({
      ...initialShowState(updatedAt, { s, b: 0 }),
      writer: third.id,
    });
    c.run(() => third.send({ t: 'state', state: ahead(edge + 1, 7), reason: 'update' }));
    expect(posKey(deck, one.s.state.pos)).toBe(after(3, 2));
    c.run(() => third.send({ t: 'state', state: ahead(edge, 5), reason: 'update' }));
    expect([posKey(deck, one.s.state.pos), posKey(deck, two.s.state.pos)]).toEqual(['S05.1', 'S05.1']);
    a.run(() => one.s.dispatch({ type: 'next' }));
    expect(posKey(deck, two.s.state.pos)).toBe(after(5));
    b.run(() => two.s.dispatch({ type: 'next' }));
    expect(posKey(deck, one.s.state.pos)).toBe(after(5, 2));
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
