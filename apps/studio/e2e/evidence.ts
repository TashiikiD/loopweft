// Evidence for a check that two exports are the same bytes: when they are not, both are saved (in the review
// folder, LOOPWEFT_REVIEW, which CI keeps as the run's "screens-<system>" artifact), so a difference that comes
// and goes (as PNG pictures once did on slow macOS runners) can be looked at afterwards rather than guessed at.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

/**
 * Whether two files are the same bytes. If not, and there is a folder to keep them in, both are written to its
 * `mismatch/` folder as `<name>-a<ext>` and `<name>-b<ext>`, and the paths are logged.
 */
export function sameBytes(
  name: string,
  a: Uint8Array,
  b: Uint8Array,
  folder: string | null = REVIEW,
): boolean {
  if (Buffer.from(a).equals(Buffer.from(b))) return true;
  if (folder) {
    const dir = join(folder, 'mismatch');
    mkdirSync(dir, { recursive: true });
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    const files = [join(dir, `${stem}-a${ext}`), join(dir, `${stem}-b${ext}`)];
    writeFileSync(files[0] as string, a);
    writeFileSync(files[1] as string, b);
    console.log(`Not the same bytes (${a.length} and ${b.length}); both kept: ${files.join(', ')}`);
  }
  return false;
}
