// Source: PolycrisisPresentation src/core/sync.ts @ 3e5da10 (private), adapted for Loopweft. The deck's
// windows talked over one BroadcastChannel, which needs a shared origin; a file opened from disk may have none
// (Safari, and Chrome in some settings). So every message goes two ways: over a BroadcastChannel named for the
// presentation where one can be opened, and straight to the windows this one knows (the window that opened it,
// the windows it opened, and any window it has heard from). A message arriving twice is dropped the second time.
import type { ShowState } from './show.ts';

export type LinkRole = 'presenter' | 'audience';

/** What the windows of one presentation say to each other. */
export type Payload =
  | { t: 'hello' }
  | { t: 'ping' }
  | { t: 'bye' }
  | { t: 'state'; state: ShowState; reason: 'update' | 'sync' }
  /** An audience window without its own copy of the project (the Studio's) asks for it. */
  | { t: 'needProject' }
  | { t: 'project'; text: string };

export interface Envelope {
  lw: 'loopweft-present';
  /** The presentation's id: windows of other presentations ignore each other. */
  show: string;
  from: LinkRole;
  id: string;
  seq: number;
  msg: Payload;
}

/** A window that can be posted to: another window's WindowProxy. */
export interface PostTarget {
  postMessage(message: unknown, targetOrigin: string): void;
  readonly closed?: boolean;
}

export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

/** What the link needs from its window, so that it can be tested without one. */
export interface LinkHost {
  listen(fn: (data: unknown, source: unknown) => void): () => void;
  /** The window that opened this one, if any. */
  opener(): PostTarget | null;
  /** The origin to post to: this window's own, or "*" where it has none (a file opened from disk). */
  targetOrigin: string;
  /** A BroadcastChannel, or null where none can be opened. */
  channel(name: string): ChannelLike | null;
  every(ms: number, fn: () => void): () => void;
  now(): number;
  /** A fresh id for this window (not part of any output). */
  newId(): string;
}

export const PING_MS = 1000;
export const ALIVE_MS = 3500;
const REMEMBERED = 64;

const isTarget = (w: unknown): w is PostTarget => !!w && typeof (w as PostTarget).postMessage === 'function';

export function isEnvelope(data: unknown): data is Envelope {
  if (!data || typeof data !== 'object') return false;
  const e = data as Partial<Envelope>;
  return (
    e.lw === 'loopweft-present' &&
    typeof e.show === 'string' &&
    (e.from === 'presenter' || e.from === 'audience') &&
    typeof e.id === 'string' &&
    typeof e.seq === 'number' &&
    !!e.msg &&
    typeof e.msg === 'object' &&
    typeof (e.msg as { t?: unknown }).t === 'string'
  );
}

export interface Peer {
  role: LinkRole;
  seen: number;
}

/**
 * The link between one presentation's windows: the presenter console, the audience window(s) and a single
 * window rehearsing. Windows are peers: any of them can change the show and sends a whole snapshot; each keeps
 * the newest. Pings only tell the windows who is there.
 */
export class Link {
  readonly id: string;
  readonly role: LinkRole;
  readonly show: string;
  readonly #host: LinkHost;
  #channel: ChannelLike | null = null;
  readonly #windows = new Set<PostTarget>();
  readonly #peers = new Map<string, Peer>();
  readonly #seen = new Map<string, number[]>();
  readonly #listeners = new Set<(msg: Payload, from: { id: string; role: LinkRole }) => void>();
  readonly #peerListeners = new Set<() => void>();
  #stops: Array<() => void> = [];
  #seq = 0;
  #started = false;

  constructor(role: LinkRole, show: string, host: LinkHost) {
    this.role = role;
    this.show = show;
    this.#host = host;
    this.id = `${role}-${host.newId()}`;
  }

  /** Calls `fn` with every message from another window (pings aside). Returns a function that stops it. */
  on(fn: (msg: Payload, from: { id: string; role: LinkRole }) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Calls `fn` whenever a window joins or leaves. */
  onPeers(fn: () => void): () => void {
    this.#peerListeners.add(fn);
    return () => this.#peerListeners.delete(fn);
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#channel = this.#host.channel(`loopweft-present-${this.show}`);
    if (this.#channel) this.#channel.onmessage = (e) => this.#receive(e.data, null);
    this.#stops.push(this.#host.listen((data, source) => this.#receive(data, source)));
    const opener = this.#host.opener();
    if (opener) this.#windows.add(opener);
    this.send({ t: 'hello' });
    this.#stops.push(this.#host.every(PING_MS, () => this.send({ t: 'ping' })));
    this.#stops.push(this.#host.every(PING_MS, () => this.#sweep()));
  }

  stop(): void {
    if (!this.#started) return;
    this.send({ t: 'bye' });
    for (const stop of this.#stops) stop();
    this.#stops = [];
    this.#channel?.close();
    this.#channel = null;
    this.#started = false;
  }

  /** A window this one opened (the audience window): it hears every message from now on. */
  addWindow(w: PostTarget): void {
    this.#windows.add(w);
  }

  send(msg: Payload): void {
    const envelope: Envelope = {
      lw: 'loopweft-present',
      show: this.show,
      from: this.role,
      id: this.id,
      seq: ++this.#seq,
      msg,
    };
    try {
      this.#channel?.postMessage(envelope);
    } catch {
      // A closed channel: the windows below still hear it.
    }
    for (const w of this.#windows) {
      if (w.closed) {
        this.#windows.delete(w);
        continue;
      }
      try {
        w.postMessage(envelope, this.#host.targetOrigin);
      } catch {
        // A window that went away or moved to another page.
        this.#windows.delete(w);
      }
    }
  }

  /** How many windows of a role are there now. */
  count(role: LinkRole): number {
    const now = this.#host.now();
    let n = 0;
    for (const p of this.#peers.values()) if (p.role === role && now - p.seen < ALIVE_MS) n++;
    return n;
  }

  alive(role: LinkRole): boolean {
    return this.count(role) > 0;
  }

  #receive(data: unknown, source: unknown): void {
    if (!isEnvelope(data) || data.show !== this.show || data.id === this.id) return;
    if (isTarget(source)) this.#windows.add(source);
    // The same message may come both ways: keep the first.
    const seen = this.#seen.get(data.id) ?? [];
    if (seen.includes(data.seq)) return;
    seen.push(data.seq);
    if (seen.length > REMEMBERED) seen.shift();
    this.#seen.set(data.id, seen);

    if (data.msg.t === 'bye') {
      if (this.#peers.delete(data.id)) this.#peersChanged();
      return;
    }
    const known = this.#peers.has(data.id);
    this.#peers.set(data.id, { role: data.from, seen: this.#host.now() });
    if (!known) this.#peersChanged();
    if (data.msg.t === 'ping') return;
    for (const fn of this.#listeners) fn(data.msg, { id: data.id, role: data.from });
  }

  #sweep(): void {
    const now = this.#host.now();
    let changed = false;
    for (const [id, p] of this.#peers) {
      if (now - p.seen >= ALIVE_MS) {
        this.#peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.#peersChanged();
  }

  #peersChanged(): void {
    for (const fn of this.#peerListeners) fn();
  }
}

/** The link's view of a real browser window. */
export function browserHost(win: Window = window): LinkHost {
  const origin = win.location.origin;
  return {
    listen(fn) {
      const handler = (e: MessageEvent) => fn(e.data, e.source);
      win.addEventListener('message', handler);
      return () => win.removeEventListener('message', handler);
    },
    opener: () => {
      try {
        return isTarget(win.opener) ? (win.opener as PostTarget) : null;
      } catch {
        return null;
      }
    },
    targetOrigin: win.location.protocol === 'file:' || !origin || origin === 'null' ? '*' : origin,
    channel(name) {
      try {
        return typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(name) as ChannelLike);
      } catch {
        return null;
      }
    },
    every(ms, fn) {
      const t = win.setInterval(fn, ms);
      return () => win.clearInterval(t);
    },
    now: () => Date.now(),
    newId() {
      const bytes = new Uint8Array(6);
      win.crypto.getRandomValues(bytes);
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
  };
}
