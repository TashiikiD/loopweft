// How `loopweft export` puts its files on disk: whole or not at all, never over the project, and never over
// anything else unless --force says so (even a file another program made while the export was being drawn).
import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { OpError } from '@loopweft/model';

/**
 * True when two paths name one file: the same path once resolved, or (where both exist) the same file on
 * disk, reached through another spelling ("./talk.loopweft", other letter case) or a link.
 */
export function sameFile(a: string, b: string): boolean {
  if (resolve(a) === resolve(b)) return true;
  try {
    const x = statSync(a, { bigint: true });
    const y = statSync(b, { bigint: true });
    return x.dev === y.dev && x.ino === y.ino;
  } catch {
    return false;
  }
}

/** True when anything has that name: a file, a folder, or a link, even one to nothing. */
export function taken(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** How systems say a drive has no hard links (Windows names a FAT drive's refusal EISDIR). */
const NO_HARD_LINKS = ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EISDIR'];

export const alreadyThere = (out: string): OpError =>
  new OpError(`${out} already exists; choose another name, or replace it with --force.`, 'usage');

/**
 * Puts a finished file in place, whole, without replacing anything: a hard link is made in one step, and
 * fails if anything has that name, even a file another program made a moment ago or a link to nothing. A
 * drive without hard links (FAT, some network shares) offers no such step (a rename replaces what is there),
 * so there the export says so rather than risk a file: --force, or another folder.
 */
function placeNew(temporary: string, out: string): void {
  try {
    linkSync(temporary, out);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (code === 'EEXIST' || taken(out)) throw alreadyThere(out);
    if (!NO_HARD_LINKS.includes(code)) throw error;
    throw new OpError(
      `The drive of ${out} cannot add a file without the risk of replacing one (it has no hard links): export to another folder and copy the file, or replace any file of that name with --force.`,
      'usage',
    );
  }
}

/**
 * Writes `data` to `out`: first in a new folder of its own beside it, then put in place, so a failed write
 * never leaves half a file, and no two exports (two processes, or two threads of one) share a temporary file.
 * With `force` a rename replaces what is there; without, it fails rather than replace a file that another
 * program wrote while this one was drawing.
 */
export function publishFile(out: string, data: string | Uint8Array, force: boolean): void {
  const folder = mkdtempSync(join(dirname(resolve(out)), '.loopweft-export-'));
  try {
    const temporary = join(folder, basename(out));
    writeFileSync(temporary, data);
    if (force) renameSync(temporary, out);
    else placeNew(temporary, out);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Refuses to write over the project, whatever the spelling, and even with --force. */
export function notTheProject(project: string, out: string, what: string): void {
  if (sameFile(project, out))
    throw new OpError(`${what} would replace the project; name another with -o.`, 'usage');
}

/**
 * A folder of files, written one by one. Without `force`, the folder must be new: it is made in one step
 * (which fails if anything has its name), each file is created only if nothing has its name, and if the export
 * fails the folder goes again. With `force`, an existing folder is used and files of the same names replaced.
 */
export class FolderOut {
  readonly path: string;
  readonly #force: boolean;
  readonly #made: boolean;

  constructor(path: string, force: boolean) {
    this.path = path;
    this.#force = force;
    if (force) {
      mkdirSync(path, { recursive: true });
      if (!statSync(path).isDirectory()) throw new OpError(`${path} is a file, not a folder.`, 'usage');
      this.#made = false;
    } else {
      try {
        mkdirSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw alreadyThere(path);
        throw error;
      }
      this.#made = true;
    }
  }

  write(name: string, data: Uint8Array): string {
    const file = join(this.path, name);
    if (this.#force) publishFile(file, data, true);
    else {
      try {
        writeFileSync(file, data, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw alreadyThere(file);
        throw error;
      }
    }
    return file;
  }

  /** After a failure: removes the folder if this export made it. */
  abandon(): void {
    if (this.#made) rmSync(this.path, { recursive: true, force: true });
  }
}
