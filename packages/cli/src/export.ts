// `loopweft export`: a project as one HTML file to share or present (more formats come in Phase 6). The file
// is the Studio's export, byte for byte: the player's page with the project in it.
import {
  constants,
  copyFileSync,
  existsSync,
  linkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { OpError } from '@loopweft/model';
import { exportHtml } from '@loopweft/player';
import { playerTemplate } from '@loopweft/player/build';
import type { CommandResult } from './commands.ts';
import { loadProject } from './support.ts';

export interface ExportCommandOptions {
  html?: boolean;
  out?: string;
  /** False with --no-notes: leave out the speaker notes, the script and the cues. */
  notes?: boolean;
  force?: boolean;
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * True when two paths name one file: the same path once resolved, or (where both exist) the same file on
 * disk, reached through another spelling ("./talk.loopweft", other letter case) or a link.
 */
function sameFile(a: string, b: string): boolean {
  if (resolve(a) === resolve(b)) return true;
  try {
    const x = statSync(a, { bigint: true });
    const y = statSync(b, { bigint: true });
    return x.dev === y.dev && x.ino === y.ino;
  } catch {
    return false;
  }
}

/** Numbers this process's exports, so that two at once never share a temporary file. */
let exportsMade = 0;

/**
 * Puts a finished file in place without replacing one: a hard link fails if `out` exists, even one another
 * export wrote a moment ago. Where the drive has no hard links, a copy that refuses to replace does the same.
 */
function placeNew(temporary: string, out: string, exists: () => Error): void {
  try {
    linkSync(temporary, out);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw exists();
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(code ?? '')) throw error;
  }
  try {
    copyFileSync(temporary, out, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw exists();
    throw error;
  }
}

export async function exportCommand(file: string, o: ExportCommandOptions): Promise<CommandResult> {
  if (!o.html) throw new OpError('Choose what to export: --html (the only format so far).', 'usage');
  const project = loadProject(file);
  const out = o.out ?? `${file.replace(/\.loopweft$/i, '')}.html`;
  // Never the project itself, whatever the spelling, and even with --force.
  if (sameFile(file, out))
    throw new OpError('The HTML file would replace the project; name another with -o.', 'usage');
  const exists = () =>
    new OpError(`${out} already exists; choose another name, or replace it with --force.`, 'usage');
  if (existsSync(out) && !o.force) throw exists();
  const notes = o.notes !== false;
  const made = exportHtml(project, await playerTemplate(), { notes });
  // Written beside the file under a name of its own, then put in place, so a failed write never leaves half a
  // file. With --force it replaces what is there; without, it fails rather than replace a file that another
  // export wrote while this one was building.
  const temporary = `${out}.tmp-${process.pid}-${++exportsMade}`;
  try {
    writeFileSync(temporary, made.html, { flag: 'wx' });
    if (o.force) renameSync(temporary, out);
    else placeNew(temporary, out, exists);
  } finally {
    rmSync(temporary, { force: true });
  }
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
