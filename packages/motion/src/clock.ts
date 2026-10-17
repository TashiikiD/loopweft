// Where time comes from. Live playback follows the display's frames; tests and video export step a manual
// clock one exact frame at a time, so the same choreography always produces the same frames.

export interface Clock {
  /** Calls `frame` with the seconds elapsed since the previous frame, until the returned function is called. */
  onFrame(frame: (dt: number) => void): () => void;
}

/** Steps only when told to: every call delivers exact frames, so the output never depends on timing. */
export class ManualClock implements Clock {
  readonly #listeners = new Set<(dt: number) => void>();
  /** Seconds delivered so far. */
  time = 0;

  onFrame(frame: (dt: number) => void): () => void {
    this.#listeners.add(frame);
    return () => this.#listeners.delete(frame);
  }

  /** Delivers one frame of `dt` seconds. */
  tick(dt: number): void {
    this.time += dt;
    for (const frame of [...this.#listeners]) frame(dt);
  }

  /** Delivers `seconds` as whole frames at `fps` (the last one shorter if they do not divide evenly). */
  advance(seconds: number, fps = 60): void {
    const step = 1 / fps;
    let left = seconds;
    while (left > 1e-9) {
      const dt = Math.min(step, left);
      this.tick(dt);
      left -= dt;
    }
  }
}

/**
 * The display's frames (requestAnimationFrame). Used for live playback only; nothing that is saved or
 * exported reads it. A frame after a long gap (a hidden tab) counts as at most a tenth of a second, so
 * motion resumes rather than jumping to its end.
 */
export class FrameClock implements Clock {
  readonly #listeners = new Set<(dt: number) => void>();
  #last: number | null = null;
  #handle = 0;

  onFrame(frame: (dt: number) => void): () => void {
    this.#listeners.add(frame);
    if (this.#listeners.size === 1) this.#start();
    return () => {
      this.#listeners.delete(frame);
      if (this.#listeners.size === 0) this.#stop();
    };
  }

  #start(): void {
    const loop = (ms: number) => {
      const dt = this.#last === null ? 0 : Math.min(0.1, (ms - this.#last) / 1000);
      this.#last = ms;
      for (const frame of [...this.#listeners]) frame(dt);
      this.#handle = requestAnimationFrame(loop);
    };
    this.#handle = requestAnimationFrame(loop);
  }

  #stop(): void {
    cancelAnimationFrame(this.#handle);
    this.#last = null;
  }
}

/**
 * A timer-driven clock, for pages that get no animation frames (headless captures): delivers a frame of
 * exactly `1 / fps` seconds every `1000 / fps` ms of the page's timer.
 */
export class IntervalClock implements Clock {
  readonly #listeners = new Set<(dt: number) => void>();
  readonly #fps: number;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(fps = 60) {
    this.#fps = fps;
  }

  onFrame(frame: (dt: number) => void): () => void {
    this.#listeners.add(frame);
    this.#timer ??= setInterval(() => {
      for (const f of [...this.#listeners]) f(1 / this.#fps);
    }, 1000 / this.#fps);
    return () => {
      this.#listeners.delete(frame);
      if (this.#listeners.size === 0 && this.#timer !== null) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    };
  }
}
