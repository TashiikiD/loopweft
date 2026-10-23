// What a picture export draws, and what its files are called. Pure, so the Studio, the command line and the
// export page agree on it, and the tests can check it without a browser.
import { OpError, type Project, resolveStep, slugify, stepKey } from '@loopweft/model';

/** What to draw: one step, every step, or the whole map (which needs no story). */
export type PictureTarget =
  | { kind: 'step'; step: string }
  | { kind: 'steps' }
  | {
      kind: 'map';
      /** Only the map and a margin, not the whole 16:9 stage. */
      trim?: boolean;
    };

/** PNG: pixels, as the screen shows them. SVG: a drawing that stays sharp at any size and can be edited. */
export type PictureFormat = 'png' | 'svg';

/** What the engine can make of a stage: a picture, or, for the slides PDF, a JPEG of each step. */
export type FrameFormat = PictureFormat | 'jpeg';

export const PICTURE_FORMATS: readonly PictureFormat[] = ['png', 'svg'];

export interface PictureJob {
  format: FrameFormat;
  target: PictureTarget;
  /** PNG: 1 for 1920 × 1080, 2 for 3840 × 2160 (print and posters). An SVG has no pixels: always 1. */
  scale: 1 | 2;
  /** Name each shown variable's category in words (the C key's view). */
  categoryWords: boolean;
  /**
   * SVG only: a drawing for PowerPoint and Word, whose Convert to Shape makes radial gradients solid and drops a
   * group's opacity: glows as rings of flat colour, each faded part with its own opacity.
   */
  office?: boolean;
}

/** One picture of a job: a step by its place in the story, or the whole map. */
export type Picture =
  | { kind: 'step'; sceneIndex: number; stepIndex: number; key: string; name: string }
  | { kind: 'map'; trim: boolean; name: string };

export const SCALES = [1, 2] as const;

/** The margin left around a trimmed map, in stage pixels. */
export const TRIM_MARGIN = 40;

/** Names Windows keeps for devices, whatever follows the first dot ("CON.1.png" is refused). */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** A file name for a step's picture: its key, e.g. "S04.2a.png". */
export function stepFileName(key: string, extension: string): string {
  const head = key.split('.')[0] ?? key;
  return `${RESERVED.test(head) ? '_' : ''}${key}.${extension}`;
}

/** A file name stem for a project: its title as letters, digits and dashes. */
export const fileStem = (title: string): string => slugify(title).replace(/_/g, '-') || 'map';

/** The pictures a target asks for, in story order. Refuses a step that isn't there, or a story with none. */
export function picturesFor(project: Project, target: PictureTarget, extension: string): Picture[] {
  if (target.kind === 'map') {
    return [{ kind: 'map', trim: target.trim === true, name: `map.${extension}` }];
  }
  if (target.kind === 'step') {
    const found = resolveStep(project, target.step);
    return [
      {
        kind: 'step',
        sceneIndex: found.sceneIndex,
        stepIndex: found.stepIndex,
        key: found.key,
        name: stepFileName(found.key, extension),
      },
    ];
  }
  const pictures = project.story.scenes.flatMap((scene, sceneIndex) =>
    scene.steps.map((step, stepIndex): Picture => {
      const key = stepKey(scene.id, step.id);
      return { kind: 'step', sceneIndex, stepIndex, key, name: stepFileName(key, extension) };
    }),
  );
  if (pictures.length === 0)
    throw new OpError('The story has no steps to draw yet; draw the whole map instead.', 'usage');
  return pictures;
}

/** Checks a job's options, so a mistake is named before any drawing starts. */
export function checkPictureJob(job: PictureJob): void {
  if (!PICTURE_FORMATS.includes(job.format as PictureFormat) && job.format !== 'jpeg')
    throw new OpError(`Pictures are PNG or SVG, not "${job.format}".`, 'usage');
  if (job.office && job.format !== 'svg')
    throw new OpError(
      'Only an SVG drawing is made for PowerPoint and Word; a PNG is pixels already.',
      'usage',
    );
  if (job.format === 'jpeg' && (job.scale !== 1 || job.target.kind !== 'steps'))
    throw new OpError('The slides are every step, at the stage’s own size.', 'usage');
  if (job.format === 'svg' && job.scale !== 1)
    throw new OpError(
      'An SVG drawing has no size in pixels: it stays sharp at any size. The scale is for PNG.',
      'usage',
    );
  if (!SCALES.includes(job.scale))
    throw new OpError('The scale is 1 (1920 × 1080) or 2 (3840 × 2160).', 'usage');
  if (job.target.kind !== 'map' && 'trim' in job.target)
    throw new OpError('Only the whole map can be trimmed.', 'usage');
}

/** A picture's size in pixels. */
export function pictureSize(
  scale: number,
  crop?: { w: number; h: number },
): { width: number; height: number } {
  return { width: Math.round((crop?.w ?? 1920) * scale), height: Math.round((crop?.h ?? 1080) * scale) };
}
