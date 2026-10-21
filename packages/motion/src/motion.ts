// The director: plays timelines from a clock, and is the one place the presenter's Pause and Skip reach.
// Standalone tweens (Motion.to) take a property over from any earlier standalone tween still driving it,
// like GSAP's "auto" overwrite, so quick successive steps never fight over an element.
import type { Clock } from './clock.ts';
import type { Props } from './props.ts';
import { channels } from './props.ts';
import { Timeline, type TimelineOptions, type Tween, type TweenOptions } from './timeline.ts';

export interface MotionOptions {
  /** Most frames per second to render (0 = every frame). Low-power mode uses 30. */
  maxFps?: number;
}

export class Motion {
  readonly #playing = new Set<Timeline>();
  /** Standalone tweens by target and property key, for overwrites. */
  readonly #owners = new WeakMap<object, Map<string, Tween>>();
  readonly #stopClock: () => void;
  #paused = false;
  #maxFps: number;
  #pending = 0;

  constructor(clock: Clock, options: MotionOptions = {}) {
    this.#maxFps = options.maxFps ?? 0;
    this.#stopClock = clock.onFrame((dt) => this.#frame(dt));
  }

  get paused(): boolean {
    return this.#paused;
  }

  /** Timelines playing now. */
  get active(): number {
    return this.#playing.size;
  }

  /** Timelines playing now that are a step's motion, not idle ones: 0 once the step has settled. */
  get busy(): number {
    let busy = 0;
    for (const timeline of this.#playing) if (!timeline.idle) busy++;
    return busy;
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
  }

  /** Low power: render at most 30 frames a second (0 = no limit). */
  setMaxFps(fps: number): void {
    this.#maxFps = fps;
  }

  #frame(dt: number): void {
    if (this.#paused || this.#playing.size === 0) return;
    this.#pending += dt;
    if (this.#maxFps > 0 && this.#pending < 1 / this.#maxFps - 1e-9) return;
    const step = this.#pending;
    this.#pending = 0;
    for (const timeline of [...this.#playing]) {
      const now = timeline.time === Number.NEGATIVE_INFINITY ? 0 : timeline.time;
      timeline.seek(now + step);
      if (timeline.completed) timeline.kill();
    }
  }

  /** Starts playing a timeline (rendering its first frame at once). */
  play(timeline: Timeline): Timeline {
    this.#playing.add(timeline);
    timeline.onDetach = () => this.#playing.delete(timeline);
    if (timeline.time === Number.NEGATIVE_INFINITY) timeline.seek(0);
    if (timeline.completed) timeline.kill();
    return timeline;
  }

  /** A new, empty timeline that plays from now: add tweens and calls, positioned in seconds from now. */
  timeline(options: TimelineOptions = {}): Timeline {
    const timeline = new Timeline(options);
    this.#playing.add(timeline);
    timeline.onDetach = () => this.#playing.delete(timeline);
    return timeline;
  }

  /** Tweens `props` from their current values, taking them over from earlier standalone tweens. */
  to(target: object, props: Props, options: TweenOptions = {}): Timeline {
    const timeline = new Timeline().to(target, props, { ...options, at: options.at ?? 0 });
    this.#own(target, timeline);
    return this.play(timeline);
  }

  /** Sets `props` now, stopping standalone tweens that drive them. */
  set(target: object, props: Props): void {
    this.killTweensOf(target, Object.keys(props));
    for (const { channel, value } of channels(target, props)) channel.write(value);
  }

  /** Calls `fn` after `seconds` (paused and skipped with everything else). */
  delayedCall(seconds: number, fn: () => void, options: Pick<TimelineOptions, 'idle'> = {}): Timeline {
    return this.play(new Timeline(options).call(fn, seconds));
  }

  /** Stops standalone tweens driving `keys` of `target` (all of its properties when `keys` is absent). */
  killTweensOf(target: object, keys?: string[]): void {
    const owners = this.#owners.get(target);
    if (!owners) return;
    const wanted = keys?.flatMap((k) =>
      k === 'attr' ? [...owners.keys()].filter((o) => o.startsWith('attr.')) : [k],
    );
    for (const [key, tween] of [...owners]) {
      if (wanted && !wanted.includes(key)) continue;
      tween.release(key);
      owners.delete(key);
    }
  }

  #own(target: object, timeline: Timeline): void {
    let owners = this.#owners.get(target);
    if (!owners) {
      owners = new Map();
      this.#owners.set(target, owners);
    }
    for (const tween of timeline.tweens()) {
      for (const channel of tween.channels) {
        owners.get(channel.key)?.release(channel.key);
        owners.set(channel.key, tween);
      }
    }
  }

  /** Skip: every playing timeline jumps to its end state. */
  landAll(): void {
    for (const timeline of [...this.#playing]) timeline.land();
  }

  /** Stops everything without landing it, and detaches from the clock. */
  dispose(): void {
    for (const timeline of [...this.#playing]) timeline.kill();
    this.#stopClock();
  }
}
