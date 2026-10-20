// Source: PolycrisisPresentation src/core/clock.ts @ 3e5da10 (private), unchanged but for comments: the
// presenter's clock and pace. The clock never moves the show; it only tells the presenter how they are doing
// against the scenes' targets. Every function is given the time, so none reads a clock.

export interface ClockState {
  running: boolean;
  /** The computer clock (ms) when the current run started, while running. */
  startedAt: number | null;
  /** Milliseconds banked from earlier runs. */
  accumulatedMs: number;
}

export const newClock = (): ClockState => ({ running: false, startedAt: null, accumulatedMs: 0 });

export function elapsedMs(c: ClockState, now: number): number {
  return c.accumulatedMs + (c.running && c.startedAt !== null ? Math.max(0, now - c.startedAt) : 0);
}

export function startClock(c: ClockState, now: number): ClockState {
  return c.running ? c : { running: true, startedAt: now, accumulatedMs: c.accumulatedMs };
}

export function pauseClock(c: ClockState, now: number): ClockState {
  return c.running ? { running: false, startedAt: null, accumulatedMs: elapsedMs(c, now) } : c;
}

export const toggleClock = (c: ClockState, now: number): ClockState =>
  c.running ? pauseClock(c, now) : startClock(c, now);

const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** A clock read back from storage, if it is one: anything else (a time that is not a finite number) starts it again. */
export function sanitizeClock(value: unknown): ClockState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ClockState>;
  if (typeof v.running !== 'boolean' || !isTime(v.accumulatedMs)) return null;
  if (v.running && !isTime(v.startedAt)) return null;
  return {
    running: v.running,
    startedAt: v.running ? (v.startedAt as number) : null,
    accumulatedMs: v.accumulatedMs,
  };
}

/** When the current scene was entered, on the presenter's clock. */
export interface SceneEntry {
  sceneId: string;
  atMs: number;
}

export type PaceStatus = 'idle' | 'ahead' | 'on' | 'late' | 'very-late';

export interface Pace {
  /** Seconds behind (negative: ahead): the lateness carried into the scene plus any overrun. */
  behind: number;
  /** Seconds left of the scene's target (negative: over). */
  sceneRemaining: number;
  status: PaceStatus;
}

export interface SceneSchedule {
  clockStart: number;
  targetSeconds: number;
}

// Gentle thresholds: within 15 s is on pace; amber up to 45 s behind; beyond that, red.
export const PACE_ON = 15;
export const PACE_LATE = 45;
export const PACE_AHEAD = 30;

export function pace(
  scene: SceneSchedule,
  elapsedSec: number,
  sceneElapsedSec: number,
  clockStarted: boolean,
): Pace {
  const sceneRemaining = scene.targetSeconds - sceneElapsedSec;
  if (!clockStarted) return { behind: 0, sceneRemaining, status: 'idle' };
  const entryLate = elapsedSec - sceneElapsedSec - scene.clockStart;
  const overrun = Math.max(0, sceneElapsedSec - scene.targetSeconds);
  const behind = entryLate + overrun;
  let status: PaceStatus = 'on';
  if (behind > PACE_LATE) status = 'very-late';
  else if (behind > PACE_ON) status = 'late';
  else if (behind < -PACE_AHEAD) status = 'ahead';
  return { behind, sceneRemaining, status };
}

/** "m:ss", with a minus sign for negatives. */
export function fmt(seconds: number): string {
  const neg = seconds < 0;
  const s = Math.floor(Math.abs(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${neg ? '−' : ''}${m}:${r.toString().padStart(2, '0')}`;
}
