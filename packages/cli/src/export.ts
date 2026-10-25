// `loopweft export`: a project as one HTML file to share or present, as pictures (PNG, or SVG drawings) of its
// steps or of the whole map, as PDF documents (the slides, the speaker notes, the references), or as video
// (MP4 or WebM) of its story, or a GIF of a scene or some steps. The files are the Studio's exports, byte for byte: the HTML is the player's page
// with the project in it; pictures and video are drawn by the export page in the Chrome or Edge on this
// computer, as the Studio draws them in its own tab.
import { join } from 'node:path';
import {
  checkPictureJob,
  checkVideoJob,
  type EventOf,
  type FileEvent,
  FRAME_RATES,
  GIF_HEIGHT,
  GIF_RATE,
  HOLD_DEFAULT,
  notesPdf,
  type Paper,
  type PictureJob,
  type PictureTarget,
  picturesFor,
  referencesPdf,
  type SlidePicture,
  slidesPdf,
  VIDEO_HEIGHTS,
  type VideoFormat,
  type VideoJob,
  type VideoTarget,
  videoPlan,
} from '@loopweft/export';
import { browserForExport, exportInBrowser, nodeFonts } from '@loopweft/export/node';
import { OpError, plural, serializeProject } from '@loopweft/model';
import { exportHtml } from '@loopweft/player';
import { playerTemplate } from '@loopweft/player/build';
import type { CommandResult } from './commands.ts';
import { loadProject } from './support.ts';
import { alreadyThere, FileOut, FolderOut, notTheProject, publishFile, taken } from './write.ts';

export interface ExportCommandOptions {
  html?: boolean;
  png?: boolean;
  svg?: boolean;
  /** The PDF document: notes (the speaker notes) or references. */
  pdf?: string;
  paper?: string;
  out?: string;
  /** False with --no-notes: leave out the speaker notes, the script and the cues. */
  notes?: boolean;
  force?: boolean;
  step?: string;
  allSteps?: boolean;
  map?: boolean;
  trim?: boolean;
  scale?: string;
  categoryWords?: boolean;
  /** svg: a drawing for PowerPoint and Word (glows as rings of flat colour, which Convert to Shape keeps). */
  forOffice?: boolean;
  mp4?: boolean;
  webm?: boolean;
  gif?: boolean;
  scene?: string;
  from?: string;
  to?: string;
  hold?: string;
  talkTiming?: boolean;
  height?: string;
  fps?: string;
}

/** Where a long export says how far it has got (a terminal's line, rewritten), if anywhere. */
export interface ExportProgress {
  progress?: (text: string) => void;
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The project file's name without ".loopweft": the start of every default output name. */
const stemOf = (file: string) => file.replace(/\.loopweft$/i, '');

const FORMATS = ['html', 'png', 'svg', 'pdf', 'mp4', 'webm', 'gif'] as const;

/** The options only a video takes. */
const VIDEO_OPTIONS = ['scene', 'from', 'to', 'hold', 'talkTiming', 'height', 'fps'] as const;

export async function exportCommand(
  file: string,
  o: ExportCommandOptions,
  report: ExportProgress = {},
): Promise<CommandResult> {
  const chosen = FORMATS.filter((f) => o[f]);
  if (chosen.length !== 1) {
    throw new OpError(
      chosen.length === 0
        ? 'Choose what to export: --html (one HTML file), --png (pictures), --svg (drawings), --pdf slides|notes|references (documents), or --mp4, --webm or --gif (video).'
        : `Export one format at a time (${chosen.map((f) => `--${f}`).join(', ')} given).`,
      'usage',
    );
  }
  const format = chosen[0] as (typeof FORMATS)[number];
  if (format !== 'pdf' && o.paper !== undefined)
    throw new OpError('--paper is for the PDFs (--pdf).', 'usage');
  if (format !== 'svg' && o.forOffice !== undefined)
    throw new OpError('--for-office is only valid with --svg.', 'usage');
  if (format === 'mp4' || format === 'webm' || format === 'gif') return videoExport(file, o, format, report);
  for (const option of VIDEO_OPTIONS) {
    if (o[option] !== undefined)
      throw new OpError(`--${dashed(option)} is for video (--mp4, --webm or --gif).`, 'usage');
  }
  if (format === 'html') return htmlExport(file, o);
  if (format === 'pdf') return pdfExport(file, o);
  return pictureExport(file, o, format);
}

async function htmlExport(file: string, o: ExportCommandOptions): Promise<CommandResult> {
  for (const option of ['step', 'allSteps', 'map', 'trim', 'scale', 'categoryWords'] as const) {
    if (o[option] !== undefined)
      throw new OpError(`--${dashed(option)} is for pictures (--png or --svg).`, 'usage');
  }
  const project = loadProject(file);
  const out = o.out ?? `${stemOf(file)}.html`;
  notTheProject(file, out, 'The HTML file');
  if (!o.force && taken(out)) throw alreadyThere(out);
  const notes = o.notes !== false;
  const made = exportHtml(project, await playerTemplate(), { notes });
  publishFile(out, made.html, o.force === true);
  const scenes = project.story.scenes.length;
  const steps = project.story.scenes.reduce((n, s) => n + s.steps.length, 0);
  const text = [
    `Wrote ${out} (${megabytes(made.bytes)}): ${scenes} scenes, ${steps} steps, ${project.sources.length} sources; speaker notes ${notes ? 'included' : 'left out'}.`,
    ...made.warnings.map((w) => `warning: ${w}`),
  ].join('\n');
  return {
    text,
    data: {
      file,
      out,
      format: 'html',
      bytes: made.bytes,
      notes,
      images: made.images,
      fontsLeftOut: made.fontsLeftOut,
      warnings: made.warnings,
    },
  };
}

const dashed = (option: string) => option.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** What --step, --all-steps and --map ask for: exactly one of them. */
function pictureTarget(o: ExportCommandOptions): PictureTarget {
  const given = [o.step !== undefined && '--step', o.allSteps && '--all-steps', o.map && '--map'].filter(
    Boolean,
  ) as string[];
  if (given.length !== 1) {
    throw new OpError(
      given.length === 0
        ? 'Choose what to draw: --step <step> (e.g. S04.2a), --all-steps, or --map (the whole map).'
        : `Draw one thing at a time (${given.join(', ')} given).`,
      'usage',
    );
  }
  if (o.trim && !o.map) throw new OpError('--trim is for the whole map (--map).', 'usage');
  if (o.map) return { kind: 'map', trim: o.trim === true };
  if (o.allSteps) return { kind: 'steps' };
  return { kind: 'step', step: o.step as string };
}

function scaleOf(text: string | undefined): 1 | 2 {
  if (text === undefined || text === '1') return 1;
  if (text === '2') return 2;
  throw new OpError(`--scale is 1 (1920 × 1080) or 2 (3840 × 2160), not "${text}".`, 'usage');
}

interface Written {
  name: string;
  path: string;
  key?: string;
  width: number;
  height: number;
  bytes: number;
}

async function pictureExport(
  file: string,
  o: ExportCommandOptions,
  format: 'png' | 'svg',
): Promise<CommandResult> {
  if (o.notes === false) throw new OpError('--no-notes is for the HTML file (--html).', 'usage');
  if (format === 'svg' && o.scale !== undefined)
    throw new OpError(
      'An SVG drawing has no size in pixels: it stays sharp at any size. --scale is for --png.',
      'usage',
    );
  const target = pictureTarget(o);
  const job: PictureJob = {
    format,
    target,
    scale: scaleOf(o.scale),
    categoryWords: o.categoryWords === true,
    ...(o.forOffice ? { office: true } : {}),
  };
  checkPictureJob(job);
  const project = loadProject(file);
  // Named before the browser starts: a step that isn't there, a story with no steps, a name that is taken.
  const pictures = picturesFor(project, target, format);
  const stem = stemOf(file);
  const force = o.force === true;
  const steps = target.kind === 'steps';
  const folderName = format === 'png' ? `${stem}-steps` : `${stem}-steps-svg`;
  const out = o.out ?? (steps ? folderName : `${stem}-${(pictures[0] as (typeof pictures)[number]).name}`);
  if (steps) {
    for (const picture of pictures) notTheProject(file, join(out, picture.name), 'A picture');
  } else {
    notTheProject(file, out, 'The picture');
  }
  if (!force && taken(out)) throw alreadyThere(out);
  browserForExport();

  const written: Written[] = [];
  const notes = new Set<string>();
  const record = (event: FileEvent, path: string) => {
    for (const note of event.notes ?? []) notes.add(note);
    written.push({
      name: event.name,
      path,
      ...(event.key ? { key: event.key } : {}),
      width: event.width,
      height: event.height,
      bytes: event.bytes.length,
    });
  };
  if (steps) {
    const folder = new FolderOut(out, force);
    try {
      await exportInBrowser(serializeProject(project), job, (event) => {
        record(event, folder.write(event.name, event.bytes));
      });
    } catch (error) {
      folder.abandon();
      throw error;
    }
  } else {
    await exportInBrowser(serializeProject(project), job, (event) => {
      publishFile(out, event.bytes, force);
      record(event, out);
    });
  }

  const total = written.reduce((n, w) => n + w.bytes, 0);
  const first = written[0] as Written;
  const size = `${first.width} × ${first.height}`;
  const what = format === 'png' ? 'picture' : 'drawing';
  const text = [
    steps
      ? `Wrote ${plural(written.length, what)} to ${out} (${size} each, ${megabytes(total)} in all).`
      : `Wrote ${out} (${size}, ${megabytes(total)}).`,
    ...[...notes].map((note) => `note: ${note}`),
  ].join('\n');
  return {
    text,
    data: {
      file,
      out,
      format,
      what: target.kind === 'step' ? 'step' : target.kind === 'steps' ? 'all-steps' : 'map',
      ...(format === 'png' ? { scale: job.scale } : {}),
      categoryWords: job.categoryWords,
      ...(target.kind === 'map' ? { trim: target.trim === true } : {}),
      files: written,
      bytes: total,
      ...(format === 'svg' ? { forOffice: job.office === true, notes: [...notes] } : {}),
    },
  };
}

/** The PDF documents `--pdf` makes, and the file each is called by default. */
const DOCUMENTS = {
  notes: { make: notesPdf, file: 'speaker-notes', what: 'speaker notes' },
  references: { make: referencesPdf, file: 'references', what: 'references' },
} as const;

function paperOf(text: string | undefined): Paper {
  if (text === undefined || text === 'letter') return 'letter';
  if (text === 'a4') return 'a4';
  throw new OpError(`--paper is letter (the default) or a4, not "${text}".`, 'usage');
}

async function pdfExport(file: string, o: ExportCommandOptions): Promise<CommandResult> {
  const which = o.pdf as string;
  const slides = which === 'slides';
  for (const option of ['step', 'allSteps', 'map', 'trim', 'scale', 'categoryWords'] as const) {
    if (option === 'categoryWords' && slides) continue;
    if (o[option] !== undefined)
      throw new OpError(
        `--${dashed(option)} is for pictures (--png or --svg)${option === 'categoryWords' ? ' and the slides (--pdf slides)' : ''}.`,
        'usage',
      );
  }
  if (o.notes === false) throw new OpError('--no-notes is for the HTML file (--html).', 'usage');
  if (slides) return slidesExport(file, o);
  const document = DOCUMENTS[which as keyof typeof DOCUMENTS];
  if (!document || !Object.hasOwn(DOCUMENTS, which))
    throw new OpError(
      `--pdf is slides (one page per step), notes (the speaker notes) or references, not "${which}".`,
      'usage',
    );
  const paper = paperOf(o.paper);
  const project = loadProject(file);
  const out = o.out ?? `${stemOf(file)}-${document.file}.pdf`;
  notTheProject(file, out, 'The PDF');
  if (!o.force && taken(out)) throw alreadyThere(out);
  const made = await document.make(project, { paper, fonts: nodeFonts });
  publishFile(out, made.bytes, o.force === true);
  const paperName = paper === 'a4' ? 'A4' : 'Letter';
  const text = [
    `Wrote ${out} (${document.what}: ${plural(made.pages, 'page')}, ${paperName}, ${megabytes(made.bytes.length)}).`,
    ...made.notes.map((note) => `note: ${note}`),
  ].join('\n');
  return {
    text,
    data: {
      file,
      out,
      format: 'pdf',
      document: which,
      paper,
      pages: made.pages,
      bytes: made.bytes.length,
      notes: made.notes,
    },
  };
}

/** The slides PDF: every step drawn by the export page in this computer's browser, one 16:9 page each. */
async function slidesExport(file: string, o: ExportCommandOptions): Promise<CommandResult> {
  if (o.paper !== undefined)
    throw new OpError(
      'The slides are 16:9 pages, the stage’s own shape: --paper is for notes and references.',
      'usage',
    );
  const job: PictureJob = {
    format: 'jpeg',
    target: { kind: 'steps' },
    scale: 1,
    categoryWords: o.categoryWords === true,
  };
  const project = loadProject(file);
  if (project.story.scenes.every((scene) => scene.steps.length === 0))
    throw new OpError('The story has no steps yet, so there are no slides to make.', 'usage');
  const out = o.out ?? `${stemOf(file)}-slides.pdf`;
  notTheProject(file, out, 'The PDF');
  if (!o.force && taken(out)) throw alreadyThere(out);
  browserForExport();
  const pictures: SlidePicture[] = [];
  await exportInBrowser(serializeProject(project), job, (event) => {
    pictures.push({ key: event.key as string, jpeg: event.bytes });
  });
  const made = await slidesPdf(project, pictures);
  publishFile(out, made.bytes, o.force === true);
  return {
    text: `Wrote ${out} (slides: ${plural(made.pages, 'page')}, 16:9, ${megabytes(made.bytes.length)}).`,
    data: {
      file,
      out,
      format: 'pdf',
      document: 'slides',
      categoryWords: job.categoryWords,
      pages: made.pages,
      bytes: made.bytes.length,
      notes: [],
    },
  };
}

/** What --scene, --from and --to ask a video to play: the story unless one of them is given. */
function videoTarget(o: ExportCommandOptions): VideoTarget {
  if (o.scene !== undefined && (o.from !== undefined || o.to !== undefined))
    throw new OpError('Play a scene (--scene) or steps (--from and --to), not both.', 'usage');
  if (o.scene !== undefined) return { kind: 'scene', scene: o.scene };
  if (o.from !== undefined || o.to !== undefined) {
    if (o.from === undefined || o.to === undefined)
      throw new OpError(
        'Steps run --from one --to another (e.g. --from S04.2a --to S04.6; the same step twice for one).',
        'usage',
      );
    return { kind: 'steps', from: o.from, to: o.to };
  }
  return { kind: 'story' };
}

function choice<T extends number>(
  text: string | undefined,
  allowed: readonly T[],
  option: string,
  what: string,
): T {
  if (text === undefined) return allowed[0] as T;
  const value = Number(text);
  if (!(allowed as readonly number[]).includes(value))
    throw new OpError(`--${option} is ${allowed.join(' or ')} (${what}), not "${text}".`, 'usage');
  return value as T;
}

const minutes = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A video of the story, a scene or steps, played by the export page in this computer's browser. */
async function videoExport(
  file: string,
  o: ExportCommandOptions,
  format: VideoFormat,
  report: ExportProgress,
): Promise<CommandResult> {
  for (const option of ['step', 'allSteps', 'map', 'trim', 'scale'] as const) {
    if (o[option] !== undefined)
      throw new OpError(
        `--${dashed(option)} is for pictures (--png or --svg)${option === 'step' ? '; a video of one step is --from S04.2a --to S04.2a' : ''}.`,
        'usage',
      );
  }
  if (o.notes === false) throw new OpError('--no-notes is for the HTML file (--html).', 'usage');
  if (o.hold !== undefined && o.talkTiming)
    throw new OpError(
      'Hold each step (--hold) or keep the talk’s timing (--talk-timing), not both.',
      'usage',
    );
  const gif = format === 'gif';
  if (gif && (o.height !== undefined || o.fps !== undefined))
    throw new OpError(
      'A GIF is 960 × 540 at 15 frames a second: --height and --fps are for MP4 and WebM.',
      'usage',
    );
  const hold = o.hold === undefined ? HOLD_DEFAULT : Number(o.hold);
  if (o.hold !== undefined && (o.hold.trim() === '' || !Number.isFinite(hold)))
    throw new OpError(`--hold is a number of seconds, not "${o.hold}".`, 'usage');
  const job: VideoJob = {
    format,
    target: videoTarget(o),
    timing: o.talkTiming ? { kind: 'talk' } : { kind: 'hold', seconds: hold },
    height: gif ? GIF_HEIGHT : choice(o.height, VIDEO_HEIGHTS, 'height', '1920 × 1080 or 1280 × 720 pixels'),
    fps: gif ? GIF_RATE : choice(o.fps, FRAME_RATES, 'fps', 'frames a second'),
    categoryWords: o.categoryWords === true,
  };
  checkVideoJob(job);
  const project = loadProject(file);
  // Named before the browser starts: a scene or step that isn't there, steps out of order, a name taken.
  const plan = videoPlan(project, job);
  const out = o.out ?? `${stemOf(file)}-${plan.name}`;
  notTheProject(file, out, 'The video');
  const force = o.force === true;
  if (!force && taken(out)) throw alreadyThere(out);
  browserForExport();

  const written = new FileOut(out, force);
  let end: Extract<EventOf<VideoJob>, { type: 'video' }> | null = null;
  try {
    await exportInBrowser(serializeProject(project), job, (event) => {
      if (event.type === 'data') {
        written.append(event.bytes);
        report.progress?.(
          `Playing ${event.key} (${event.done} of ${event.total} steps): ${minutes(event.seconds)} of video so far`,
        );
      } else {
        written.rewriteStart(event.head);
        end = event;
      }
    });
    const made = end as Extract<EventOf<VideoJob>, { type: 'video' }> | null;
    if (!made || made.size !== written.size) throw new Error('The video did not arrive whole.');
    written.finish();
  } catch (error) {
    written.abandon();
    throw error;
  } finally {
    report.progress?.('');
  }
  const made = end as unknown as Extract<EventOf<VideoJob>, { type: 'video' }>;
  const timing =
    job.timing.kind === 'talk' ? 'the talk’s timing' : `each step held ${plural(hold, 'second')}`;
  const text = [
    `Wrote ${out} (${minutes(made.seconds)}, ${made.width} × ${made.height} at ${made.fps} fps, ${plural(plan.steps.length, 'step')}, ${timing}, ${megabytes(made.size)}).`,
    ...made.warnings.map((warning) => `warning: ${warning}`),
    ...made.notes.map((note) => `note: ${note}`),
  ].join('\n');
  return {
    text,
    data: {
      file,
      out,
      format,
      what: job.target.kind,
      ...(job.target.kind === 'scene' ? { scene: job.target.scene } : {}),
      ...(job.target.kind === 'steps' ? { from: job.target.from, to: job.target.to } : {}),
      timing: job.timing.kind,
      ...(job.timing.kind === 'hold' ? { hold: job.timing.seconds } : {}),
      width: made.width,
      height: made.height,
      fps: made.fps,
      frames: made.frames,
      seconds: made.seconds,
      steps: plan.steps.length,
      codec: made.codec,
      categoryWords: job.categoryWords,
      bytes: made.size,
      warnings: made.warnings,
      notes: made.notes,
    },
  };
}
