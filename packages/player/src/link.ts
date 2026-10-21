// Source: PolycrisisPresentation src/core/sync.ts @ 3e5da10 (private), adapted for Loopweft. The deck's
// windows talked over one BroadcastChannel, which needs a shared origin; a file opened from disk may have none
// (Safari, and Chrome in some settings). So every message goes two ways: over a BroadcastChannel named for the
// presentation where one can be opened, and straight to the windows this one knows (the window that opened it,
// the windows it opened, and any window it has let in). A message arriving twice is dropped the second time,
// and a change of the show is passed on to the other windows this one knows, so that two audience windows
// that only know the console both follow either of them.
//
// Who may move the show. On a site, a BroadcastChannel only carries messages between pages of that site, so
// those are trusted, and a message posted straight to this window is let in only from its own origin. A file
// opened from disk has no origin of its own, and some browsers let every local file share a channel, so there
// every message, by either way, must carry proof of the presentation's join token: a random value the console
// hands the audience window it opens (in its address), kept for the tab's life, never written into a file. The
// presentation's id says which windows belong together; anyone can work it out from the project, so it is not
// a key. A tab of the file that the console did not open has no token: it stays apart from the show.
//
// The token itself never travels. A message posted straight to a window reaches whatever page that window
// holds now (one the audience window went on to, say), so each message carries instead an HMAC of what it
// says, made with the token: a page that reads it can neither learn the token nor make another message. A
// message once read could still be sent again later (to a console reloaded with nothing saved, say), so a
// window acts on another's messages only once that window has answered a challenge of its own, fresh for this
// page, and only on the ones it numbered after its answer: a recorded message comes from a page gone, which
// cannot answer. A window posts nothing straight to the page that opened it until that page has shown the
// proof (any page could have opened the file). Every window pings every second, so a reloaded window hears
// from the other within a second, and then asks it where the show is.
import { hmacSha256, sameText } from './hmac.ts';
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
  | { t: 'project'; text: string }
  /** On a file opened from disk: a window asks another (`to`) to show it is there now, with a fresh value. */
  | { t: 'challenge'; to: string; nonce: string }
  /** The answer, with the same value: from then on the asking window acts on the other's messages. */
  | { t: 'answer'; to: string; nonce: string };

const KINDS: readonly string[] = [
  'hello',
  'ping',
  'bye',
  'state',
  'needProject',
  'project',
  'challenge',
  'answer',
];

export interface Envelope {
  lw: 'loopweft-present';
  /** The presentation's id: windows of other presentations ignore each other. */
  show: string;
  from: LinkRole;
  id: string;
  seq: number;
  msg: Payload;
  /** On a file opened from disk: the HMAC of the rest, made with the presentation's join token (`proof`). */
  mac?: string;
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
    (e.mac === undefined || typeof e.mac === 'string') &&
    !!e.msg &&
    typeof e.msg === 'object' &&
    KINDS.includes((e.msg as { t?: unknown }).t as string)
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
  /** This window has no origin of its own (a file opened from disk): every message needs the proof. */
  readonly #opaque: boolean;
  /**
   * On a file opened from disk: the windows whose messages this one acts on, each with the number of its
   * answer (only its later messages count), and the challenge put to each window not yet answered.
   */
  readonly #answered = new Map<string, number>();
  readonly #asked = new Map<string, string>();
  #stops: Array<() => void> = [];
  #seq = 0;
  #started = false;

  constructor(role: LinkRole, show: string, host: LinkHost, options: LinkOptions = {}) {
    this.role = role;
    this.show = show;
    this.#host = host;
    this.#token = options.token ?? '';
    this.#opaque = isOpaqueOrigin(host.origin);
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
    // disk, only once it has shown the proof (see the top of this file).
    const opener = this.#host.opener();
    if (opener && !this.#opaque) this.#windows.add(opener);
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
    this.#answered.clear();
    this.#asked.clear();
  }

  /** A window this one opened (the audience window): it hears every message from now on. */
  addWindow(w: PostTarget): void {
    this.#windows.add(w);
  }

  send(msg: Payload): void {
    const envelope: Envelope = this.#signed({
      lw: 'loopweft-present',
      show: this.show,
      from: this.role,
      id: this.id,
      seq: ++this.#seq,
      msg,
    });
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

  /** An envelope with this window's proof, on a file opened from disk; elsewhere, as it is. */
  #signed(envelope: Envelope): Envelope {
    const { mac: _, ...rest } = envelope;
    return this.#opaque && this.#token ? { ...rest, mac: proof(this.#token, rest) } : rest;
  }

  /** Whether a message may reach this window: see the top of this file. `origin` is null for the channel's. */
  #admits(data: Envelope, origin: string | null): boolean {
    if (!this.#opaque) return origin === null || origin === this.#host.origin;
    if (!this.#token || typeof data.mac !== 'string') return false;
    try {
      return sameText(data.mac, proof(this.#token, data));
    } catch {
      // What it says is not JSON (a cycle, a BigInt): it proves nothing.
      return false;
    }
  }

  /**
   * On a file opened from disk, whether this window acts on a message: challenges and answers are dealt with
   * here; anything else counts once its sender has answered this window's challenge, and only if numbered after
   * the answer. Challenges and answers for other windows are passed on, as changes are.
   */
  #answers(data: Envelope, source: unknown): boolean {
    if (!this.#opaque) return true;
    const msg = data.msg;
    if (msg.t === 'challenge' || msg.t === 'answer') {
      if (typeof msg.to !== 'string' || typeof msg.nonce !== 'string') return false;
      if (msg.to !== this.id) {
        this.#post(this.#signed(data), source);
        return false;
      }
      if (msg.t === 'challenge') this.send({ t: 'answer', to: data.id, nonce: msg.nonce });
      else if (!this.#answered.has(data.id) && this.#asked.get(data.id) === msg.nonce) {
        this.#asked.delete(data.id);
        this.#answered.set(data.id, data.seq);
        // Its messages count from now on, and the ones before were dropped: ask where the show is, and say it.
        this.send({ t: 'hello' });
        for (const fn of this.#listeners) fn({ t: 'hello' }, { id: data.id, role: data.from });
      }
      return false;
    }
    const since = this.#answered.get(data.id);
    if (since === undefined) {
      if (msg.t !== 'bye') this.#challenge(data.id);
      return false;
    }
    return data.seq > since;
  }

  #challenge(id: string): void {
    let nonce = this.#asked.get(id);
    if (!nonce) {
      nonce = `${this.#host.newId()}${this.#host.newId()}`;
      this.#asked.set(id, nonce);
    }
    this.send({ t: 'challenge', to: id, nonce });
  }

  #forget(id: string): void {
    this.#seen.delete(id);
    this.#answered.delete(id);
    this.#asked.delete(id);
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
    if (!this.#answers(data, source)) return;

    if (data.msg.t === 'bye') {
      this.#forget(data.id);
      if (this.#peers.delete(data.id)) this.#peersChanged();
      return;
    }
    // Pass a change on, as it is (its id and number let every window drop it the second time), to the other
    // windows this one knows: without a BroadcastChannel they may know only this one. This window vouches
    // for it with its own proof.
    if (data.msg.t === 'state') this.#post(this.#signed(data), source);
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
        this.#forget(id);
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

/**
 * The proof a message carries on a file opened from disk: the HMAC-SHA256, under the join token, of everything
 * it says (its presentation, sender, number and payload), so that none of it can be changed or made up.
 */
export function proof(token: string, envelope: Omit<Envelope, 'mac'>): string {
  const { show, from, id, seq, msg } = envelope;
  return hmacSha256(token, JSON.stringify([show, from, id, seq, msg]));
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
 * storage: another tab of the same file makes its own, so it stays apart from the show (it can prove nothing).
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
