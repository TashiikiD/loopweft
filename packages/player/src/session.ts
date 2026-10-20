// Source: PolycrisisPresentation src/core/session.ts @ 3e5da10 (private), adapted for Loopweft: the link,
// the storage and the page address are handed in (so it is tested without a browser), and the time too.
import { type Deck, parseKey, posKey } from './deck.ts';
import type { Link, Payload } from './link.ts';
import { type Command, initialShowState, reduce, type ShowState, sanitizeShowState } from './show.ts';
import type { PresentationStore } from './storage.ts';

/** Why the show changed: a key pressed here, another window's change, or a window catching up. */
export type ChangeReason = 'local' | 'remote' | 'sync';

/** The page address's fragment ("#S05.3"), which names the step on show. */
export interface Address {
  read(): string;
  write(hash: string): void;
  listen(fn: () => void): () => void;
}

export interface SessionOptions {
  deck: Deck;
  link: Link;
  store: PresentationStore;
  address: Address | null;
  now: () => number;
  onChange: (next: ShowState, prev: ShowState, reason: ChangeReason) => void;
}

/**
 * One window's copy of the show. The newest snapshot wins. The page address and the browser's storage let a
 * window find its place again after a reload.
 */
export class ShowSession {
  state: ShowState;
  readonly link: Link;
  readonly #o: SessionOptions;
  #stops: Array<() => void> = [];

  constructor(options: SessionOptions) {
    this.#o = options;
    this.link = options.link;
    this.state = this.#restore();
  }

  start(): void {
    this.#writeAddress();
    this.#stops.push(this.link.on((msg) => this.#receive(msg)));
    // Typing a step's address (e.g. #S05.3) into the address bar goes there.
    const address = this.#o.address;
    if (address) {
      this.#stops.push(
        address.listen(() => {
          const pos = parseKey(this.#o.deck, address.read());
          if (pos && (pos.s !== this.state.pos.s || pos.b !== this.state.pos.b))
            this.dispatch({ type: 'goto', pos });
        }),
      );
    }
    this.link.start();
  }

  stop(): void {
    for (const stop of this.#stops) stop();
    this.#stops = [];
  }

  dispatch(cmd: Command): void {
    const prev = this.state;
    const next = reduce(this.#o.deck, prev, cmd, this.#o.now());
    if (next === prev) return;
    this.state = next;
    this.#persist();
    this.link.send({ t: 'state', state: next, reason: 'update' });
    this.#o.onChange(next, prev, 'local');
  }

  #receive(msg: Payload): void {
    if (msg.t === 'hello') {
      // Tell a newcomer where the show is; it keeps it only if it is newer than its own.
      this.link.send({ t: 'state', state: this.state, reason: 'sync' });
      return;
    }
    if (msg.t !== 'state') return;
    const incoming = sanitizeShowState(this.#o.deck, msg.state, this.#o.now());
    if (!incoming) return;
    // Keep the sender's kind of move, so that every window animates alike.
    const nav = msg.state.nav;
    const validNav =
      !!nav &&
      typeof nav.seq === 'number' &&
      ['forward', 'backward', 'jump', 'replay', 'sync'].includes(nav.kind as string);
    const fresh: ShowState = { ...incoming, nav: validNav ? nav : incoming.nav };
    if (fresh.updatedAt <= this.state.updatedAt) return;
    const prev = this.state;
    this.state = fresh;
    this.#persist();
    this.#o.onChange(fresh, prev, msg.reason === 'sync' ? 'sync' : 'remote');
  }

  #restore(): ShowState {
    const now = this.#o.now();
    const stored = sanitizeShowState(this.#o.deck, this.#o.store.load('show'), now);
    // A window with nothing saved starts at the first step, older than any change: the first state another
    // window sends it wins (a reloaded audience window, in a browser that kept nothing, joins the show).
    const start = initialShowState(0);
    const fromAddress = this.#o.address ? parseKey(this.#o.deck, this.#o.address.read()) : null;
    // An address that names a step wins (a bookmarked step); otherwise carry on where the show was. A step
    // named that differs from the saved one is a move made now, so other windows follow it.
    if (fromAddress) {
      const moved = !stored || stored.pos.s !== fromAddress.s || stored.pos.b !== fromAddress.b;
      const base = stored ?? start;
      return {
        ...base,
        pos: fromAddress,
        nav: { kind: 'sync', seq: base.nav.seq },
        updatedAt: moved ? now : base.updatedAt,
      };
    }
    return stored ?? start;
  }

  #persist(): void {
    this.#o.store.save('show', this.state);
    this.#writeAddress();
  }

  #writeAddress(): void {
    if (!this.#o.address || this.#o.deck.scenes.length === 0) return;
    const key = `#${encodeURIComponent(posKey(this.#o.deck, this.state.pos))}`;
    if (this.#o.address.read() !== key) this.#o.address.write(key);
  }
}

/** The page address of a real window. */
export function browserAddress(win: Window = window): Address {
  return {
    read: () => win.location.hash,
    write(hash) {
      try {
        win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${hash}`);
      } catch {
        // The history can be closed to a sandboxed frame: harmless.
      }
    },
    listen(fn) {
      win.addEventListener('hashchange', fn);
      return () => win.removeEventListener('hashchange', fn);
    },
  };
}
