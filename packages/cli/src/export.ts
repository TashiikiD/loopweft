// `loopweft export`: a project as one HTML file to share or present (more formats come in Phase 6). The file
// is the Studio's export, byte for byte: the player's page with the project in it.
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

export async function exportCommand(file: string, o: ExportCommandOptions): Promise<CommandResult> {
  if (!o.html) throw new OpError('Choose what to export: --html (the only format so far).', 'usage');
  const project = loadProject(file);
  const out = o.out ?? `${file.replace(/\.loopweft$/i, '')}.html`;
  if (out === file)
    throw new OpError('The HTML file would replace the project; name another with -o.', 'usage');
  if (existsSync(out) && !o.force)
    throw new OpError(`${out} already exists; choose another name, or replace it with --force.`, 'usage');
  const notes = o.notes !== false;
  const made = exportHtml(project, await playerTemplate(), { notes });
  // Written beside the file, then moved into place, so a failed write never leaves half a file.
  const temporary = `${out}.tmp-${process.pid}`;
  writeFileSync(temporary, made.html);
  try {
    renameSync(temporary, out);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
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
