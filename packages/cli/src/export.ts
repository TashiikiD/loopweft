// `loopweft export`: a project as one HTML file to share or present, or as pictures (PNG, or SVG drawings) of
// its steps or of the whole map. The files are the Studio's exports, byte for byte: the HTML is the player's page with the
// project in it; pictures are drawn by the export page in the Chrome or Edge on this computer, as the Studio
// draws them in its own tab.
import { join } from 'node:path';
import {
  checkPictureJob,
  type JobEvent,
  type PictureJob,
  type PictureTarget,
  picturesFor,
} from '@loopweft/export';
import { browserForExport, exportInBrowser } from '@loopweft/export/node';
import { OpError, plural, serializeProject } from '@loopweft/model';
import { exportHtml } from '@loopweft/player';
import { playerTemplate } from '@loopweft/player/build';
import type { CommandResult } from './commands.ts';
import { loadProject } from './support.ts';
import { alreadyThere, FolderOut, notTheProject, publishFile, taken } from './write.ts';

export interface ExportCommandOptions {
  html?: boolean;
  png?: boolean;
  svg?: boolean;
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
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The project file's name without ".loopweft": the start of every default output name. */
const stemOf = (file: string) => file.replace(/\.loopweft$/i, '');

const FORMATS = ['html', 'png', 'svg'] as const;

export async function exportCommand(file: string, o: ExportCommandOptions): Promise<CommandResult> {
  const chosen = FORMATS.filter((f) => o[f]);
  if (chosen.length !== 1) {
    throw new OpError(
      chosen.length === 0
        ? 'Choose what to export: --html (one HTML file), --png (pictures) or --svg (drawings).'
        : `Export one format at a time (${chosen.map((f) => `--${f}`).join(', ')} given).`,
      'usage',
    );
  }
  const format = chosen[0] as (typeof FORMATS)[number];
  return format === 'html' ? htmlExport(file, o) : pictureExport(file, o, format);
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
  const record = (event: JobEvent, path: string) => {
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
      ...(format === 'svg' ? { notes: [...notes] } : {}),
    },
  };
}
