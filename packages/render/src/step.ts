// Source: PolycrisisPresentation src/viz/kit.ts (Step, land) @ 539bc8e (private), on @loopweft/motion instead
// of GSAP.
//
// One step's motion for a view. With a duration it collects tweens in a timeline that Motion plays (so Skip
// lands it and Pause holds it); for an instant step every tween is applied at once.
import { type EaseSpec, type Motion, type Props, Timeline } from '@loopweft/motion';

/** How a change of step looks: at once (jumps, first load), a quick fade (going back) or the full motion. */
export type Transition = 'instant' | 'quick' | 'smooth';

export const FADE: Record<Transition, number> = { instant: 0, quick: 0.4, smooth: 0.8 };

export interface StepTweenOptions {
  ease?: EaseSpec;
  onComplete?: () => void;
}

export class Step {
  readonly tl: Timeline | null;
  readonly fade: number;
  /** A forward step: entrances play their full choreography. */
  readonly smooth: boolean;
  readonly #motion: Motion;

  constructor(motion: Motion, transition: Transition) {
    this.#motion = motion;
    this.fade = FADE[transition];
    this.smooth = transition === 'smooth';
    this.tl = this.fade > 0 ? new Timeline() : null;
  }

  /** A choreography time: as written on a forward step, collapsed to now otherwise. */
  t(seconds: number): number {
    return this.smooth ? seconds : 0;
  }

  /** A choreography duration: as written on a forward step, the plain fade otherwise. */
  d(seconds: number): number {
    return this.smooth ? seconds : this.fade;
  }

  to(target: object, props: Props, at = 0, duration = this.fade, options: StepTweenOptions = {}): this {
    if (!this.tl) {
      this.#motion.set(target, props);
      options.onComplete?.();
    } else {
      this.tl.to(target, props, { ease: options.ease ?? 'power2.out', duration, at, ...pick(options) });
    }
    return this;
  }

  fromTo(
    target: object,
    from: Props,
    to: Props,
    at = 0,
    duration = this.fade,
    options: StepTweenOptions = {},
  ): this {
    if (!this.tl) {
      this.#motion.set(target, { ...from, ...to });
      options.onComplete?.();
    } else {
      this.tl.fromTo(target, from, to, {
        ease: options.ease ?? 'power2.out',
        duration,
        at,
        ...pick(options),
      });
    }
    return this;
  }

  set(target: object, props: Props, at = 0): this {
    if (!this.tl || at <= 0) this.#motion.set(target, props);
    else this.tl.set(target, props, at);
    return this;
  }

  call(fn: () => void, at = 0): this {
    if (!this.tl) fn();
    else this.tl.call(fn, at);
    return this;
  }

  /** Hands the timeline to Motion; returns it so the view can land it on the next step. */
  start(): Timeline | null {
    if (this.tl) this.#motion.play(this.tl);
    return this.tl;
  }
}

const pick = (options: StepTweenOptions) => (options.onComplete ? { onComplete: options.onComplete } : {});
