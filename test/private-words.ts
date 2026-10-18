// The check that no private word reaches the repository (AGENTS.md: nothing personal in the repository). It
// reads each file as git holds it for the next commit, not only as it is on disk, and, before a push, every
// commit the push sends.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Images, fonts and PDFs: no text to read. */
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i;

/** The index entry of a submodule names a commit, not a file. */
const SUBMODULE = '160000';

/** An object id of zeros names nothing: a deleted file, or a deleted ref. */
const NONE = /^0+$/;

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

/**
 * Every place one of the words appears, in any letter case, in what a push sends, as
 * `<commit> <place>: "<word>"`. `pushed` is what git gives the pre-push hook on its standard input, one line
 * for each ref the push updates: `<local ref> <local id> <remote ref> <remote id>`. The push sends the
 * commits that the local ids reach and no remote-tracking branch does
 * (`git rev-list <local id> --not --remotes`); a deleted ref, whose local id is all zeros, sends none. In each
 * of those commits the places are:
 * - `message`;
 * - `author name`, `author email`, `committer name` and `committer email`;
 * - `file <name>`: each file the commit adds or changes, so a word that a later commit removes is still
 *   found. A merge is compared with all of its parents at once, so only what differs from each of them is its
 *   own; what a branch brings is read in that branch's commits.
 * Like findPrivateWords, it reads no images, fonts, PDFs or submodules.
 */
export function findPrivateWordsInPush(root: string, words: readonly string[], pushed: string): string[] {
  const wanted = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const tips = pushed
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.trim().split(' ')[1] ?? '')
    .filter((id) => !NONE.test(id));
  if (wanted.length === 0 || tips.length === 0) return [];
  const commits = git(root, ['rev-list', ...tips, '--not', '--remotes'])
    .toString('latin1')
    .split('\n')
    .filter(Boolean);
  if (commits.length === 0) return [];

  // The files each commit adds or changes (-c: for a merge, those that differ from every parent): the
  // commit's id, then each file's entry and name, all ended by NUL. An entry starts with a colon per parent,
  // then gives the mode of each parent's copy and of the commit's own, then their object ids in that order.
  const changed = new Map(commits.map((commit) => [commit, [] as { file: string; id: string }[]]));
  const listing = names(
    git(root, ['diff-tree', '--stdin', '-r', '--root', '-c', '-z'], `${commits.join('\n')}\n`),
  );
  let current = '';
  for (let i = 0; i < listing.length; i++) {
    const entry = listing[i] ?? '';
    if (!entry.startsWith(':')) {
      current = entry;
      continue;
    }
    const parents = entry.length - entry.replace(/^:+/, '').length;
    const fields = entry.slice(parents).split(' ');
    const mode = fields[parents] ?? '';
    const id = fields[2 * parents + 1] ?? '';
    const file = listing[++i] ?? '';
    // A deleted file sends nothing, and a submodule's entry names a commit of another repository.
    if (!NONE.test(id) && mode !== SUBMODULE && !BINARY.test(file)) changed.get(current)?.push({ file, id });
  }

  const contents = objects(root, [...commits, ...[...changed.values()].flat().map((f) => f.id)]);
  const text = (id: string) => (contents.get(id) ?? Buffer.alloc(0)).toString('utf8');
  const found: string[] = [];
  for (const commit of commits) {
    const short = commit.slice(0, 7);
    const read = (place: string, content: string) => {
      const lower = content.toLowerCase();
      for (const word of wanted) if (lower.includes(word)) found.push(`${short} ${place}: "${word}"`);
    };
    // A commit: a header on each line, such as "author <name> <<email>> <time> <zone>", then a blank line and
    // the message.
    const raw = text(commit);
    const blank = raw.indexOf('\n\n');
    const headers = (blank < 0 ? raw : raw.slice(0, blank)).split('\n');
    read('message', blank < 0 ? '' : raw.slice(blank + 2));
    for (const role of ['author', 'committer']) {
      const value = headers.find((h) => h.startsWith(`${role} `))?.slice(role.length + 1) ?? '';
      const [, name = value, email = ''] = /^([^<]*)<([^>]*)>/.exec(value) ?? [];
      read(`${role} name`, name);
      read(`${role} email`, email);
    }
    for (const { file, id } of changed.get(commit) ?? []) read(`file ${file}`, text(id));
  }
  return found;
}
