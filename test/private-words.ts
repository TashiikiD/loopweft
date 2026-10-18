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

/** Git, reading each object itself, never a local replacement for it (`git replace`), as a push does. */
const git = (root: string, args: string[], input?: string): Buffer =>
  execFileSync('git', args, {
    cwd: root,
    input,
    maxBuffer: 2 ** 30,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    stdio: 'pipe',
  });

/** Git's output split at each `separator` byte, without the empty pieces. */
function split(out: Buffer, separator: number): Buffer[] {
  const found: Buffer[] = [];
  for (let at = 0; at < out.length; ) {
    const next = out.indexOf(separator, at);
    const end = next < 0 ? out.length : next;
    if (end > at) found.push(out.subarray(at, end));
    at = end + 1;
  }
  return found;
}

/**
 * A name git gives as bytes, such as a file's or a ref's, read as UTF-8. One that is not UTF-8 throws, shown
 * as near as it can be, rather than lose a word to a replacement character.
 */
function utf8(name: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(name);
  } catch {
    throw new Error(
      `${JSON.stringify(name.toString('utf8'))} is not valid UTF-8, so this check cannot read it.`,
    );
  }
}

/** File names as git lists them with `-z`: ended by NUL and never quoted, so every character stays as it is. */
const names = (out: Buffer): string[] => split(out, 0x00).map(utf8);

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

/** The type of each object git has, by id, from one `git cat-file --batch-check`. */
function types(root: string, ids: string[]): Map<string, string> {
  const found = new Map<string, string>();
  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) return found;
  // Each line: "<id> <type> <size>", or "<id> missing".
  const out = git(root, ['cat-file', '--batch-check'], `${wanted.join('\n')}\n`).toString('latin1');
  for (const line of out.split('\n')) {
    const [id = '', type = ''] = line.split(' ');
    if (['blob', 'tree', 'commit', 'tag'].includes(type)) found.set(id, type);
  }
  return found;
}

/**
 * The text of a file, to look for words in: UTF-8, or UTF-16 where the file starts with UTF-16's byte order
 * mark. Bytes that are not valid text in that encoding throw, naming `what`, so no word hides behind them.
 */
function readable(content: Buffer, what: string): string {
  const encoding =
    content[0] === 0xff && content[1] === 0xfe
      ? 'utf-16le'
      : content[0] === 0xfe && content[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(content);
  } catch {
    const name = encoding === 'utf-8' ? 'UTF-8' : 'UTF-16';
    throw new Error(`${what} is not ${name} text, nor an image, font or PDF, so this check cannot read it.`);
  }
}

/**
 * A commit or a tag as git keeps it: a header on each line ("<name> <value>"), a blank line, the message. It
 * is UTF-8 unless an `encoding` header names another encoding, as git allows, and is then read in that one.
 * An encoding this check cannot read, or bytes not valid in it, stop the push rather than hide a word.
 */
function parse(
  raw: Buffer | undefined,
  id: string,
): {
  header: (name: string) => string;
  others: (known: readonly string[]) => [string, string][];
  message: string;
} {
  const bytes = raw ?? Buffer.alloc(0);
  // The header names are ASCII, so the encoding can be found before the object is read in it.
  const ascii = bytes.toString('latin1');
  const end = ascii.indexOf('\n\n');
  const declared = /^encoding (.*)$/m.exec(end < 0 ? ascii : ascii.slice(0, end))?.[1]?.trim();
  let text: string;
  try {
    text = new TextDecoder(declared || 'utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      declared
        ? `${id} is written in ${declared}, which this check cannot read.`
        : `${id} is not valid UTF-8 and names no other encoding, so this check cannot read it.`,
    );
  }
  const blank = text.indexOf('\n\n');
  // A header can go on over further lines, each starting with a space, such as a merged tag (`mergetag`) or a
  // signature.
  const headers: [string, string][] = [];
  for (const line of (blank < 0 ? text : text.slice(0, blank)).split('\n')) {
    const last = headers.at(-1);
    if (line.startsWith(' ') && last) last[1] += `\n${line.slice(1)}`;
    else {
      const space = line.indexOf(' ');
      headers.push(space < 0 ? [line, ''] : [line.slice(0, space), line.slice(space + 1)]);
    }
  }
  return {
    header: (name) => headers.find(([n]) => n === name)?.[1] ?? '',
    others: (known) => headers.filter(([n]) => !known.includes(n)),
    message: blank < 0 ? '' : text.slice(blank + 2),
  };
}

/** The name and email of an identity, "<name> <<email>> <time> <zone>". */
function identity(value: string): { name: string; email: string } {
  const [, name = value, email = ''] = /^([^<]*)<([^>]*)>/.exec(value) ?? [];
  return { name, email };
}

/**
 * The commits that the refs of `destination` point to (`git ls-remote`), of those this repository has: what
 * the destination already holds, so a push sends none of them. None when it cannot be listed.
 */
function held(root: string, destination: string): string[] {
  let listing: string;
  try {
    listing = git(root, ['ls-remote', '--', destination]).toString('latin1');
  } catch {
    return [];
  }
  // Each line: "<id>", a tab and the ref; an annotated tag also comes peeled, as "<ref>^{}".
  const ids = listing.split('\n').map((line) => line.split('\t')[0] ?? '');
  return [...types(root, ids)].filter(([, kind]) => kind === 'commit').map(([id]) => id);
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
    const text = readable(content, `${file} (${copy})`).toLowerCase();
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
 * `<id> <place>: "<word>"`. `pushed` is what git gives the pre-push hook on its standard input, one line for
 * each ref the push updates: `<local ref> <local id> <remote ref> <remote id>`. Given as bytes, a ref name
 * that is not UTF-8 stops the check, as a file name does. `destination` is where the
 * push goes (the hook's second argument, its URL). A deleted ref, whose local id is all zeros, sends nothing,
 * so deleting one is never stopped. For every other ref the places are:
 * - `ref <remote ref>`: the name the push gives it at the destination;
 * - for an annotated tag, and a tag of a tag: `tag name`, `tagger name`, `tagger email` and `tag message`, in
 *   each tag down to the commit;
 * - the commits the push sends: those the local ids reach and no ref of the destination does (as
 *   `git ls-remote` lists them). Without a destination, or where it cannot be listed, every commit they reach
 *   is read.
 * In each of those commits the places are:
 * - `message`, `author name`, `author email`, `committer name` and `committer email`;
 * - `header <name>`: every other header but the tree and the parents, such as a merged tag (`mergetag`) or a
 *   signature (and likewise in a tag);
 * - `path <name>`: the name of each file the commit adds or changes, with its folders;
 * - `file <name>`: the contents of each of those files, so a word that a later commit removes is still found.
 *   Like findPrivateWords, it reads no images, fonts, PDFs or submodules.
 * A merge is compared with all of its parents at once, so only what differs from each of them is its own;
 * what a branch brings is read in that branch's commits.
 */
export function findPrivateWordsInPush(
  root: string,
  words: readonly string[],
  pushed: string | Buffer,
  destination?: string,
): string[] {
  const wanted = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return [];
  const found: string[] = [];
  const read = (id: string, place: string, content: string) => {
    const lower = content.toLowerCase();
    for (const word of wanted) if (lower.includes(word)) found.push(`${id.slice(0, 7)} ${place}: "${word}"`);
  };

  const updates: { id: string; ref: string }[] = [];
  for (const line of split(typeof pushed === 'string' ? Buffer.from(pushed) : pushed, 0x0a)) {
    // The ids are ASCII. A deletion is let through unread, even of a ref whose name is not UTF-8.
    const [, id = ''] = line.toString('latin1').trim().split(' ');
    if (id === '' || NONE.test(id)) continue;
    const [, , ref = ''] = utf8(line).trim().split(' ');
    updates.push({ id, ref });
  }
  for (const { id, ref } of updates) read(id, `ref ${ref}`, ref);

  // Each local id names a commit, or an annotated tag of one, maybe through further tags.
  const tips: string[] = [];
  let level = [...new Set(updates.map((update) => update.id))];
  while (level.length > 0) {
    const kinds = types(root, level);
    for (const id of level) {
      const kind = kinds.get(id);
      if (kind === 'commit') tips.push(id);
      else if (kind !== 'tag') {
        const what = kind ? `a ${kind}` : 'which git does not have';
        throw new Error(`The push sends ${id}, ${what}: only commits and tags can be checked.`);
      }
    }
    const tags = level.filter((id) => kinds.get(id) === 'tag');
    const contents = objects(root, tags);
    level = [
      ...new Set(
        tags.map((id) => {
          const tag = parse(contents.get(id), id);
          const tagger = identity(tag.header('tagger'));
          read(id, 'tag name', tag.header('tag'));
          read(id, 'tagger name', tagger.name);
          read(id, 'tagger email', tagger.email);
          read(id, 'tag message', tag.message);
          for (const [name, value] of tag.others(['object', 'type', 'tag', 'tagger']))
            read(id, `header ${name}`, value);
          return tag.header('object');
        }),
      ),
    ];
  }
  if (tips.length === 0) return found;

  const sent = destination === undefined ? [] : held(root, destination);
  const commits = git(root, ['rev-list', '--stdin'], [...tips, ...sent.map((id) => `^${id}`), ''].join('\n'))
    .toString('latin1')
    .split('\n')
    .filter(Boolean);
  if (commits.length === 0) return found;

  // The files each commit adds or changes (-c: for a merge, those that differ from every parent): the
  // commit's id, then each file's entry and name, all ended by NUL. An entry starts with a colon per parent,
  // then gives the mode of each parent's copy and of the commit's own, then their object ids in that order.
  const changed = new Map(
    commits.map((commit) => [commit, [] as { file: string; id: string; text: boolean }[]]),
  );
  // The ids and entries are ASCII; a name is read as UTF-8 only once its file is known to be in the commit.
  const listing = split(
    git(root, ['diff-tree', '--stdin', '-r', '--root', '-c', '-z'], `${commits.join('\n')}\n`),
    0x00,
  );
  let current = '';
  for (let i = 0; i < listing.length; i++) {
    const entry = (listing[i] ?? Buffer.alloc(0)).toString('latin1');
    if (!entry.startsWith(':')) {
      current = entry;
      continue;
    }
    const parents = entry.length - entry.replace(/^:+/, '').length;
    const fields = entry.slice(parents).split(' ');
    const mode = fields[parents] ?? '';
    const id = fields[2 * parents + 1] ?? '';
    const name = listing[++i] ?? Buffer.alloc(0);
    // A deleted file sends nothing, not even its name, so removing a file whose name is not UTF-8 stays
    // possible. A submodule's entry names a commit of another repository: only its name is sent.
    if (NONE.test(id)) continue;
    const file = utf8(name);
    changed.get(current)?.push({ file, id, text: mode !== SUBMODULE && !BINARY.test(file) });
  }

  const files = [...changed.values()].flat();
  const contents = objects(root, [...commits, ...files.filter((f) => f.text).map((f) => f.id)]);
  for (const commit of commits) {
    const { header, others, message } = parse(contents.get(commit), commit);
    read(commit, 'message', message);
    for (const role of ['author', 'committer']) {
      const { name, email } = identity(header(role));
      read(commit, `${role} name`, name);
      read(commit, `${role} email`, email);
    }
    // Every other header, such as the tag a merge records (`mergetag`), which the push sends without the tag.
    for (const [name, value] of others(['tree', 'parent', 'author', 'committer'])) {
      read(commit, `header ${name}`, value);
    }
    for (const { file, id, text } of changed.get(commit) ?? []) {
      read(commit, `path ${file}`, file);
      const content = contents.get(id) ?? Buffer.alloc(0);
      if (text) read(commit, `file ${file}`, readable(content, `${commit.slice(0, 7)} file ${file}`));
    }
  }
  return found;
}
