// Source: PolycrisisPresentation src/core/sync.ts @ 3e5da10 (private), adapted for Loopweft. The deck's
// windows talked over one BroadcastChannel, which needs a shared origin; a file opened from disk may have none
// (Safari, and Chrome in some settings). So every message goes two ways: over a BroadcastChannel named for the
// presentation where one can be opened, and straight to the windows this one knows (the window that opened it,
// the windows it opened, and any window it has let in). A message arriving twice is dropped the second time,
// and a change of the show is passed on to the other windows this one knows, so that two audience windows
// that only know the console both follow either of them.
//
// Who may move the show: a BroadcastChannel only carries messages between pages of one origin, so those are
// trusted. A message posted straight to this window could come from any page holding it, so it is let in only
// from this window's own origin, or, where the page has no origin of its own (a file opened from disk), when
// it carries the presentation's join token: a random value the console hands the audience window it opens (in
// its address), kept for the tab's life, never written into a file. The presentation's id says which windows
// belong together; anyone can work it out from the project, so it is not a key.
//
// Every message a window sends carries its token, so on a file opened from disk, where a message posted
// straight to a window reaches any page, a window posts to another only once that window has shown the token
// (or it opened that window itself, handing it the token). The page that opened it is not trusted until then:
// any page could have opened the file. Every window pings every second, so a reloaded window hears from the
// other within a second, and then asks it where the show is.
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
  /** The join token, where the sender has one. */
  key?: string;
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
  /** Calls `fn` with each message posted to this window, the window that posted it and that window's origin. */
  listen(fn: (data: unknown, source: unknown, origin: string) => void): () => void;
  /** This window's origin ("null" or "file://" for a file opened from disk). */
  origin: string;
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
    (e.key === undefined || typeof e.key === 'string') &&
    !!e.msg &&
    typeof e.msg === 'object' &&
    typeof (e.msg as { t?: unknown }).t === 'string'
  );
}

export interface Peer {
  role: LinkRole;
  seen: number;
}

/** True for an origin no other page can prove it shares: a file opened from disk, a sandboxed page. */
export const isOpaqueOrigin = (origin: string): boolean =>
  !origin || origin === 'null' || origin.startsWith('file:');

export interface LinkOptions {
  /** The presentation's join token (`joinToken`); without one, a file from disk joins only over a BroadcastChannel. */
  token?: string;
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
  readonly #token: string;
  #stops: Array<() => void> = [];
  #seq = 0;
  #started = false;

  constructor(role: LinkRole, show: string, host: LinkHost, options: LinkOptions = {}) {
    this.role = role;
    this.show = show;
    this.#host = host;
    this.#token = options.token ?? '';
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
    if (this.#channel) this.#channel.onmessage = (e) => this.#receive(e.data, null, null);
    this.#stops.push(this.#host.listen((data, source, origin) => this.#receive(data, source, origin)));
    // The window that opened this one hears it from the start where its origin is checked; on a file from
    // disk, only once it has shown the token (see the top of this file).
    const opener = this.#host.opener();
    if (opener && !isOpaqueOrigin(this.#host.origin)) this.#windows.add(opener);
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
    this.#peers.clear();
    this.#seen.clear();
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
      ...(this.#token ? { key: this.#token } : {}),
    };
    try {
      this.#channel?.postMessage(envelope);
    } catch {
      // A closed channel: the windows below still hear it.
    }
    this.#post(envelope, null);
  }

  /** Posts an envelope straight to every window this one knows, but `except`. */
  #post(envelope: Envelope, except: unknown): void {
    for (const w of this.#windows) {
      if (w === except) continue;
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

  /** How many windows' message numbers this one keeps (to drop repeats): a window that leaves is forgotten. */
  get remembered(): number {
    return this.#seen.size;
  }

  /** Whether a message may reach this window: see the top of this file. `origin` is null for the channel's. */
  #admits(data: Envelope, origin: string | null): boolean {
    if (origin === null) return true;
    if (!isOpaqueOrigin(this.#host.origin)) return origin === this.#host.origin;
    return this.#token !== '' && data.key === this.#token;
  }

  #receive(data: unknown, source: unknown, origin: string | null): void {
    if (!isEnvelope(data) || data.show !== this.show || data.id === this.id) return;
    if (!this.#admits(data, origin)) return;
    // A window let in hears this one's messages from now on (a reloaded console finds its audience window),
    // and, new to this one, is asked where the show is: until now, this window's hello did not reach it.
    if (origin !== null && isTarget(source) && !this.#windows.has(source)) {
      this.#windows.add(source);
      if (data.msg.t !== 'bye') this.send({ t: 'hello' });
    }
    // The same message may come both ways: keep the first.
    const seen = this.#seen.get(data.id) ?? [];
    if (seen.includes(data.seq)) return;
    seen.push(data.seq);
    if (seen.length > REMEMBERED) seen.shift();
    this.#seen.set(data.id, seen);

    if (data.msg.t === 'bye') {
      this.#seen.delete(data.id);
      if (this.#peers.delete(data.id)) this.#peersChanged();
      return;
    }
    // Pass a change on, as it is (its id and number let every window drop it the second time), to the other
    // windows this one knows: without a BroadcastChannel they may know only this one. This window vouches
    // for it with its own token.
    if (data.msg.t === 'state') this.#post(this.#token ? { ...data, key: this.#token } : data, source);
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
        this.#seen.delete(id);
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
      const handler = (e: MessageEvent) => fn(e.data, e.source, e.origin);
      win.addEventListener('message', handler);
      return () => win.removeEventListener('message', handler);
    },
    origin,
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

/** The address parameter that hands an opened audience window its presentation's join token. */
export const JOIN_PARAM = 'join';
const TOKEN = /^[0-9a-f]{32}$/;

/** Random hex digits, from the browser's cryptographic source (a key, never part of any output). */
function randomHex(win: Window, bytes: number): string {
  const values = new Uint8Array(bytes);
  win.crypto.getRandomValues(values);
  return [...values].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * This tab's join token for a presentation: the one in its address (an audience window the console opened),
 * else the one this tab already made (it survives a reload), else a new one. Kept in the tab's session
 * storage: another tab of the same file makes its own, and joins over the BroadcastChannel instead.
 */
export function joinToken(win: Window, show: string): string {
  const key = `loopweft.join.${show}`;
  let kept: Storage | null = null;
  try {
    kept = win.sessionStorage;
  } catch {
    // Storage blocked: the token lasts as long as the page.
  }
  const given = new URLSearchParams(win.location.search).get(JOIN_PARAM);
  let token = given && TOKEN.test(given) ? given : null;
  if (!token) {
    try {
      const saved = kept?.getItem(key);
      if (saved && TOKEN.test(saved)) token = saved;
    } catch {
      // As above.
    }
  }
  token ??= randomHex(win, 16);
  try {
    kept?.setItem(key, token);
  } catch {
    // As above.
  }
  return token;
}

/** An audience window's address with the join token in it. */
export const withJoin = (url: string, token: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}${JOIN_PARAM}=${token}`;
