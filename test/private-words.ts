// The check that no private word reaches the repository (AGENTS.md: nothing personal in the repository). It
// reads each file as git holds it for the next commit, not only as it is on disk.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Images, fonts and PDFs: no text to read. */
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i;

/** The index entry of a submodule names a commit, not a file. */
const SUBMODULE = '160000';

const git = (root: string, args: string[], input?: string): Buffer =>
  execFileSync('git', args, { cwd: root, input, maxBuffer: 2 ** 30 });

/** File names as git lists them with `-z`: ended by NUL and never quoted, so every character stays as it is. */
const names = (out: Buffer): string[] => out.toString('utf8').split('\0').filter(Boolean);

/** The contents of git objects by id, from one `git cat-file --batch`. */
function objects(root: string, ids: string[]): Map<string, Buffer> {
  const contents = new Map<string, Buffer>();
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return contents;
  const out = git(root, ['cat-file', '--batch'], `${wanted.join('\n')}\n`);
  let at = 0;
  for (const id of wanted) {
    // Each object comes as "<id> <type> <size>", a newline, its contents and another newline.
    const eol = out.indexOf(0x0a, at);
    const size = Number(out.toString('latin1', at, eol).split(' ')[2]);
    if (!Number.isInteger(size)) throw new Error(`git cannot read object ${id}`);
    contents.set(id, out.subarray(eol + 1, eol + 1 + size));
    at = eol + 1 + size + 1;
  }
  return contents;
}

/**
 * Every place one of the words appears, in any letter case, as `<file> (<copy>): "<word>"`. Three copies are
 * read:
 * - staged: each file in git's index, as git holds it, which is what the next commit takes;
 * - working: each tracked file as it is on disk, with any change not yet staged;
 * - untracked: each file git neither tracks nor ignores, which `git add .` would take.
 * Files git ignores, such as `.local.json` where the words are kept, are not read.
 */
export function findPrivateWords(root: string, words: readonly string[]): string[] {
  const wanted = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return [];
  const found: string[] = [];
  const read = (file: string, copy: 'staged' | 'working' | 'untracked', content: Buffer) => {
    const text = content.toString('utf8').toLowerCase();
    for (const word of wanted) if (text.includes(word)) found.push(`${file} (${copy}): "${word}"`);
  };
  const onDisk = (file: string, copy: 'working' | 'untracked') => {
    // A path, never a URL: a name such as `draft#1.md` is a file, not a fragment. A file deleted but not yet
    // staged has no copy on disk; links and submodules are not files to read.
    const path = join(root, file);
    if (lstatSync(path, { throwIfNoEntry: false })?.isFile()) read(file, copy, readFileSync(path));
  };

  // Each entry: "<mode> <object> <stage>", a tab, then the name. A file in the middle of a merge has up to three.
  const staged = names(git(root, ['ls-files', '-z', '--stage']))
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [mode = '', id = ''] = entry.slice(0, tab).split(' ');
      return { mode, id, file: entry.slice(tab + 1) };
    })
    .filter((e) => e.mode !== SUBMODULE && !BINARY.test(e.file));
  const contents = objects(
    root,
    staged.map((e) => e.id),
  );
  for (const e of staged) read(e.file, 'staged', contents.get(e.id) ?? Buffer.alloc(0));
  for (const file of new Set(staged.map((e) => e.file))) onDisk(file, 'working');
  for (const file of names(git(root, ['ls-files', '-z', '--others', '--exclude-standard']))) {
    if (!BINARY.test(file)) onDisk(file, 'untracked');
  }
  return found;
}
