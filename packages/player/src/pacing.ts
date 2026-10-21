// When each step comes up as a scene plays by itself: the Studio's preview of a scene, and a video in the
// talk's own timing. Pure, so both keep the same rule.
import type { Scene, Step } from '@loopweft/model';

/** How long a step holds while a scene plays when the next has no time it is due. */
export const HOLD_SECONDS = 4;

/**
 * When each step of a scene comes up as the scene plays, in seconds into the scene: a step due at a time
 * (`at`) comes up then, or at once when the step before came up later; an untimed step comes up HOLD_SECONDS
 * after the one before. The first step comes up at its own time, or at 0.
 */
export function playTimes(steps: readonly Pick<Step, 'at'>[]): number[] {
  const times: number[] = [];
  for (const step of steps) {
    const before = times.at(-1);
    if (before === undefined) times.push(step.at ?? 0);
    else times.push(step.at !== undefined ? Math.max(before, step.at) : before + HOLD_SECONDS);
  }
  return times;
}

/**
 * How long a scene runs when it plays by itself, in seconds: its target length, when its last step comes up
 * before then; otherwise HOLD_SECONDS after its last step (0 for a scene with no steps).
 */
export function sceneLength(scene: {
  steps: readonly Pick<Step, 'at'>[];
  targetSeconds?: Scene['targetSeconds'];
}): number {
  const last = playTimes(scene.steps).at(-1);
  if (last === undefined) return 0;
  return scene.targetSeconds !== undefined && scene.targetSeconds > last
    ? scene.targetSeconds
    : last + HOLD_SECONDS;
}
