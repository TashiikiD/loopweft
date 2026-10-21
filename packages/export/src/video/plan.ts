// What a video plays, and for how long. Pure, so the Studio, the command line and the export page agree on
// it, and the tests can check it without a browser.
//
// A video plays the story's steps as the talk does (→ from one to the next, with the full motion), on a
// clock that steps exact frames. Each step lasts either its motion and then a hold (the step held, its
// pulses wandering, for a few seconds), or as long as the talk gives it: until the next step is due, as the
// Studio's preview plays a scene.
import { OpError, type Project, resolveScene, resolveStep, stepKey } from '@loopweft/model';
import { playTimes, sceneLength } from '@loopweft/player';
import { stepFileName } from '../pictures.ts';

/** MP4 (H.264): plays everywhere. WebM (VP9): for a browser that cannot make MP4. */
export type VideoFormat = 'mp4' | 'webm';

export const VIDEO_FORMATS: readonly VideoFormat[] = ['mp4', 'webm'];

/** What to play: the whole story, one scene, or the steps from one to another (both included). */
export type VideoTarget =
  | { kind: 'story' }
  | { kind: 'scene'; scene: string }
  | { kind: 'steps'; from: string; to: string };

/** Each step's motion and then a hold of `seconds`, or the talk's own timing. */
export type VideoTiming = { kind: 'hold'; seconds: number } | { kind: 'talk' };

/** The hold after each step's motion, in seconds, unless a job says otherwise. */
export const HOLD_DEFAULT = 3;

/** The longest hold a job may ask for, in seconds. */
export const HOLD_MAX = 60;

/** How long a step's motion may run before the export gives up on it, in seconds. */
export const MOTION_MAX = 120;

export const VIDEO_HEIGHTS = [1080, 720] as const;
export const FRAME_RATES = [30, 60] as const;

export interface VideoJob {
  format: VideoFormat;
  target: VideoTarget;
  timing: VideoTiming;
  /** 1080 for 1920 × 1080, 720 for 1280 × 720. */
  height: (typeof VIDEO_HEIGHTS)[number];
  fps: (typeof FRAME_RATES)[number];
  /** Name each shown variable's category in words (the C key's view). */
  categoryWords: boolean;
}

/** A step of the video, by its place in the story. */
export interface VideoStep {
  sceneIndex: number;
  stepIndex: number;
  key: string;
  /** In the talk's timing, how many frames the step lasts (0 when the next is due at once); else null. */
  frames: number | null;
}

export interface VideoPlan {
  steps: VideoStep[];
  /** What the video shows, for its title: "the story", a scene's title, or "S04.2 to S04.5". */
  what: string;
  /** Its file's name: "story.mp4", the scene's id ("S04.mp4"), or the steps' ("S04.2-to-S04.5.mp4"). */
  name: string;
  /** In the talk's timing, the frames of the whole video; else null (each step settles when it settles). */
  frames: number | null;
}

export function isVideoFormat(format: string): format is VideoFormat {
  return (VIDEO_FORMATS as readonly string[]).includes(format);
}

/** The video's size in pixels. */
export function videoSize(height: number): { width: number; height: number } {
  return { width: Math.round((height * 16) / 9), height };
}

/** Frames a hold of `seconds` lasts: at least the one frame that shows the step settled. */
export function holdFrames(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

/** Checks a job's options, so a mistake is named before any drawing starts. */
export function checkVideoJob(job: VideoJob): void {
  if (!isVideoFormat(job.format))
    throw new OpError(`Video is MP4 or WebM, not "${String(job.format)}".`, 'usage');
  if (!(VIDEO_HEIGHTS as readonly number[]).includes(job.height))
    throw new OpError('A video is 1080 (1920 × 1080) or 720 (1280 × 720) pixels high.', 'usage');
  if (!(FRAME_RATES as readonly number[]).includes(job.fps))
    throw new OpError('A video runs at 30 or 60 frames a second.', 'usage');
  if (job.timing.kind === 'hold') {
    const s = job.timing.seconds;
    if (!Number.isFinite(s) || s < 0 || s > HOLD_MAX)
      throw new OpError(`The hold after each step is 0 to ${HOLD_MAX} seconds, not ${s}.`, 'usage');
  } else if (job.timing.kind !== 'talk')
    throw new OpError('A video’s timing is a hold or the talk’s.', 'usage');
}

/** The steps a target plays, in story order, with their frames in the talk's timing. */
export function videoPlan(
  project: Project,
  job: Pick<VideoJob, 'format' | 'target' | 'timing' | 'fps'>,
): VideoPlan {
  const scenes = project.story.scenes;
  // Every step of the story, each with when it comes up and how long the talk gives it, in seconds.
  const all = scenes.flatMap((scene, sceneIndex) => {
    const times = playTimes(scene.steps);
    const end = sceneLength(scene);
    return scene.steps.map((step, stepIndex) => {
      const at = times[stepIndex] as number;
      const next = times[stepIndex + 1] ?? end;
      return { sceneIndex, stepIndex, key: stepKey(scene.id, step.id), seconds: next - at };
    });
  });
  const target = job.target;
  let chosen = all;
  let what = 'the story';
  let stem = 'story';
  if (target.kind === 'scene') {
    const found = resolveScene(project, target.scene);
    if (found.scene.steps.length === 0)
      throw new OpError(`Scene ${found.scene.id} has no steps yet, so there is nothing to play.`, 'usage');
    chosen = all.filter((s) => s.sceneIndex === found.index);
    what = found.scene.title;
    stem = found.scene.id;
  } else if (target.kind === 'steps') {
    const from = resolveStep(project, target.from);
    const to = resolveStep(project, target.to);
    const a = all.findIndex((s) => s.key === from.key);
    const b = all.findIndex((s) => s.key === to.key);
    if (b < a)
      throw new OpError(
        `${to.key} comes before ${from.key} in the story; name the first step of the video first.`,
        'usage',
      );
    chosen = all.slice(a, b + 1);
    what = a === b ? from.key : `${from.key} to ${to.key}`;
    stem = a === b ? from.key : `${from.key}-to-${to.key}`;
  } else if (target.kind !== 'story')
    throw new OpError('A video plays the story, a scene or steps.', 'usage');
  if (chosen.length === 0)
    throw new OpError('The story has no steps yet, so there is nothing to play.', 'usage');

  const name = stepFileName(stem, job.format);
  if (job.timing.kind !== 'talk') {
    return { steps: chosen.map((s) => ({ ...withoutSeconds(s), frames: null })), what, name, frames: null };
  }
  // Frames from the running total of seconds, so rounding never adds up along a long video.
  let seconds = 0;
  const steps = chosen.map((s) => {
    const first = Math.round(seconds * job.fps);
    seconds += s.seconds;
    return { ...withoutSeconds(s), frames: Math.round(seconds * job.fps) - first };
  });
  return { steps, what, name, frames: Math.round(seconds * job.fps) };
}

function withoutSeconds<T extends { seconds: number }>(s: T): Omit<T, 'seconds'> {
  const { seconds: _, ...rest } = s;
  return rest;
}
