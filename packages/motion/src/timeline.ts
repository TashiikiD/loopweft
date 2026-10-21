// A timeline: tweens, calls and nested timelines placed at times on one playhead. Rendering is a function
// of the playhead's position, so jumping to the end (land), stepping frame by frame and playing live all
// leave the same final state. Children render in order of start time; where two tweens drive the same
// property, the later-starting one wins while both run.
import { type Ease, type EaseSpec, ease } from './ease.ts';
import { type Channel, channels, type Props, type Value } from './props.ts';

export interface TweenOptions {
  /** Seconds. Default 0.5. */
  duration?: number;
  /** Default "power1.out". */
  ease?: EaseSpec;
  /** Seconds from the timeline's start. Default 0. */
  at?: number;
  onStart?: () => void;
  /** After every render while the tween runs. */
  onUpdate?: () => void;
  onComplete?: () => void;
}

interface Child {
  start: number;
  /** Renders the child at `local` seconds into it; `prev` is where it was (−Infinity before the first render). */
  render(local: number, prev: number): void;
  readonly length: number;
}

interface Track {
  channel: Channel;
  from: number | null;
  to: Value;
  /** False once another tween took the property over (see Motion's overwrite). */
  live: boolean;
}

export class Tween implements Child {
  readonly start: number;
  readonly length: number;
  readonly #ease: Ease;
  readonly #tracks: Track[];
  readonly #options: TweenOptions;
  #started = false;
  #done = false;

  constructor(target: object, to: Props, options: TweenOptions = {}, from?: Props) {
    this.start = options.at ?? 0;
    this.length = Math.max(0, options.duration ?? 0.5);
    this.#ease = ease(options.ease);
    this.#options = options;
    const fromValues = new Map(
      (from ? channels(target, from) : []).map(({ channel, value }) => [channel.key, value]),
    );
    this.#tracks = channels(target, to).map(({ channel, value }) => {
      const given = fromValues.get(channel.key);
      return { channel, from: typeof given === 'number' ? given : null, to: value, live: true };
    });
    // fromTo shows its starting state straight away, as GSAP does, so staggered entrances wait unseen.
    if (from) for (const { channel, value } of channels(target, from)) channel.write(value);
  }

  /** The properties this tween drives, by target. */
  get channels(): Channel[] {
    return this.#tracks.map((t) => t.channel);
  }

  /** Stops driving `key` (another tween took it over). */
  release(key: string): void {
    for (const track of this.#tracks) if (track.channel.key === key) track.live = false;
  }

  render(local: number, prev: number): void {
    if (local < 0) return;
    // A finished tween does not write again unless the playhead went back into it.
    if (this.#done && prev >= this.length && local >= this.length) return;
    if (!this.#started) {
      this.#started = true;
      for (const track of this.#tracks) {
        if (track.from === null && typeof track.to === 'number') track.from = track.channel.read();
      }
      this.#options.onStart?.();
    }
    const p = this.length > 0 ? Math.min(1, local / this.length) : 1;
    const k = p >= 1 ? 1 : this.#ease(p);
    for (const track of this.#tracks) {
      if (!track.live) continue;
      if (typeof track.to === 'number' && track.from !== null) {
        track.channel.write(p >= 1 ? track.to : track.from + (track.to - track.from) * k);
      } else track.channel.write(track.to);
    }
    this.#options.onUpdate?.();
    if (p >= 1 && !this.#done) {
      this.#done = true;
      this.#options.onComplete?.();
    } else if (p < 1) this.#done = false;
  }
}

class Call implements Child {
  readonly start: number;
  readonly length = 0;
  readonly #fn: () => void;

  constructor(fn: () => void, at: number) {
    this.#fn = fn;
    this.start = at;
  }

  render(local: number, prev: number): void {
    // Fires when the playhead reaches its time going forward (including a jump past it).
    if (local >= 0 && prev < 0) this.#fn();
  }
}

class Nested implements Child {
  readonly start: number;
  readonly #timeline: Timeline;

  constructor(timeline: Timeline, at: number) {
    this.#timeline = timeline;
    this.start = at;
  }

  get length(): number {
    return this.#timeline.duration;
  }

  render(local: number): void {
    this.#timeline.seek(local);
  }
}

export interface TimelineOptions {
  onComplete?: () => void;
  /**
   * Plays on while a step is held (the pulses that wander a held map), so it is not part of the step's
   * motion: a video holds a step once only idle timelines are left.
   */
  idle?: boolean;
}

export class Timeline {
  readonly #children: Child[] = [];
  readonly #options: TimelineOptions;
  #time = Number.NEGATIVE_INFINITY;
  #completed = false;
  /** Set by Motion while the timeline plays; cleared when it lands, completes or is killed. */
  onDetach: (() => void) | null = null;

  constructor(options: TimelineOptions = {}) {
    this.#options = options;
  }

  /** True for a timeline that plays on while a step is held (see TimelineOptions). */
  get idle(): boolean {
    return this.#options.idle === true;
  }

  /** The playhead, in seconds (−Infinity before the first render). */
  get time(): number {
    return this.#time;
  }

  /** When the last child ends. */
  get duration(): number {
    return this.#children.reduce((end, c) => Math.max(end, c.start + c.length), 0);
  }

  get completed(): boolean {
    return this.#completed;
  }

  #add(child: Child): this {
    // Keep children in start order (stable), which is also their render order.
    let i = this.#children.length;
    while (i > 0 && (this.#children[i - 1] as Child).start > child.start) i--;
    this.#children.splice(i, 0, child);
    return this;
  }

  /** Animates `props` from their current values when the tween starts. */
  to(target: object, props: Props, options: TweenOptions = {}): this {
    return this.#add(new Tween(target, props, options));
  }

  /** Animates from `from` to `to`; the `from` state shows at once. */
  fromTo(target: object, from: Props, to: Props, options: TweenOptions = {}): this {
    return this.#add(new Tween(target, to, options, from));
  }

  /** Sets `props` when the playhead reaches `at`. */
  set(target: object, props: Props, at = 0): this {
    return this.#add(new Tween(target, props, { duration: 0, at, ease: 'none' }));
  }

  /** Calls `fn` when the playhead reaches `at`. */
  call(fn: () => void, at = 0): this {
    return this.#add(new Call(fn, at));
  }

  /** Places another timeline at `at`. */
  add(timeline: Timeline, at = 0): this {
    return this.#add(new Nested(timeline, at));
  }

  /** Every tween in the timeline (nested timelines included), for overwrite checks. */
  tweens(): Tween[] {
    return this.#children.flatMap((c) => (c instanceof Tween ? [c] : []));
  }

  /** Moves the playhead to `time` and renders everything that changed. */
  seek(time: number): this {
    const prev = this.#time;
    this.#time = time;
    for (const child of this.#children) child.render(time - child.start, prev - child.start);
    if (!this.#completed && time >= this.duration) {
      this.#completed = true;
      this.#options.onComplete?.();
    } else if (time < this.duration) this.#completed = false;
    return this;
  }

  /** Jumps to the end, so everything lands in its final state, and stops playing. */
  land(): this {
    this.seek(Math.max(this.duration, this.#time === Number.NEGATIVE_INFINITY ? 0 : this.#time));
    this.kill();
    return this;
  }

  /** Stops playing where it is. */
  kill(): this {
    const detach = this.onDetach;
    this.onDetach = null;
    detach?.();
    return this;
  }
}

/** Lands a timeline if there is one; returns null, for `this.running = land(this.running)`. */
export function land(timeline: Timeline | null | undefined): null {
  timeline?.land();
  return null;
}
