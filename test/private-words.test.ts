import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { findPrivateWords, findPrivateWordsInPush } from './private-words.ts';

// A made-up word: the real ones are set only on the machines that keep them (see repo.test.ts).
const WORD = 'quokkatoast';
const SAFE = 'Nothing personal here.\n';

/** The pre-push hook's check (.githooks/pre-push). */
const CHECK = fileURLToPath(new URL('../scripts/check-push.ts', import.meta.url));

/**
 * Git in the throwaway repositories: none of this machine's git settings (`/dev/null`, which Git for Windows
 * understands too, holds none) or variables, since these tests also run inside the pre-push hook, and a
 * made-up identity, as CI has none.
 */
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Someone',
  GIT_AUTHOR_EMAIL: 'someone@example.com',
  GIT_COMMITTER_NAME: 'Someone',
  GIT_COMMITTER_EMAIL: 'someone@example.com',
};

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A new, empty folder, removed after the test. */
function folder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** A new, empty bare repository to push to. */
function remote(): string {
  const dir = folder('loopweft-remote-');
  execFileSync('git', ['init', '--quiet', '--bare'], { cwd: dir, env: ENV, stdio: 'pipe' });
  return dir;
}

/** A new, empty git repository to write files into, run git in, commit, push from, and check. */
function repository() {
  const dir = folder('loopweft-words-');
  /** Git, with `env` (such as another identity) where given. */
  const run = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, env: { ...ENV, ...env }, encoding: 'utf8', stdio: 'pipe' }).trim();
  const git = (...args: string[]) => run(args);
  git('init', '--quiet');
  return {
    dir,
    git,
    run,
    write: (file: string, text: string) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    },
    /** Commits every change, by `identity` where given, and gives the new commit's id. */
    commit: (message: string, identity: Record<string, string> = {}) => {
      git('add', '--all');
      run(['commit', '--quiet', '--allow-empty', `--message=${message}`], identity);
      return git('rev-parse', 'HEAD');
    },
    /**
     * Makes the push check this repository's pre-push hook, alone and on the made-up word: .githooks/pre-push
     * then runs the whole fast gate.
     */
    guard: () => {
      const hook = join(dir, '.git', 'hooks', 'pre-push');
      const quoted = (path: string) => `"${path.replaceAll('\\', '/')}"`;
      mkdirSync(dirname(hook), { recursive: true });
      writeFileSync(hook, `#!/bin/sh\nexec ${quoted(process.execPath)} ${quoted(CHECK)} "$@"\n`);
      chmodSync(hook, 0o755);
    },
    /** A real `git push`, which runs the hook, with the made-up word set as the private one. */
    push: (...args: string[]) =>
      spawnSync('git', ['push', '--quiet', ...args], {
        cwd: dir,
        env: { ...ENV, LOOPWEFT_PRIVATE_WORDS: WORD },
        encoding: 'utf8',
      }),
    found: () => findPrivateWords(dir, [WORD]).sort(),
  };
}

describe('the private-word check', () => {
  it('reads the staged copy, which the next commit takes, even when the copy on disk no longer has the word', () => {
    const repo = repository();
    repo.write('notes.md', `Written by ${WORD}.\n`);
    repo.git('add', 'notes.md');
    repo.write('notes.md', SAFE);
    expect(repo.found()).toEqual([`notes.md (staged): "${WORD}"`]);
  });

  it('reads the copy on disk, whose change is not staged yet', () => {
    const repo = repository();
    repo.write('notes.md', SAFE);
    repo.git('add', 'notes.md');
    repo.write('notes.md', `Written by ${WORD}.\n`);
    expect(repo.found()).toEqual([`notes.md (working): "${WORD}"`]);
  });

  it('reads untracked files in any letter case, but none that git ignores', () => {
    const repo = repository();
    repo.write('.gitignore', '.local.json\n');
    repo.write('.local.json', `{ "privateWords": ["${WORD}"] }\n`);
    repo.write('draft.md', `${WORD.toUpperCase()} wrote this.\n`);
    expect(repo.found()).toEqual([`draft.md (untracked): "${WORD}"`]);
  });

  // Names that read as URL syntax (# and ?), or that git quotes or splits unless asked for -z, are files like any
  // other. Windows allows neither ? nor a line break in a name.
  const unusual = [
    'draft#1.md',
    'café notes.md',
    ...(process.platform === 'win32' ? [] : ['why?.md', 'two\nlines.md']),
  ];
  it.each(unusual)('reads a file named %j', (name) => {
    const repo = repository();
    repo.write(name, `${WORD}\n`);
    repo.git('add', '--', name);
    expect(repo.found()).toEqual([`${name} (staged): "${WORD}"`, `${name} (working): "${WORD}"`]);
  });

  it('finds nothing where the word is nowhere', () => {
    const repo = repository();
    repo.write('notes.md', SAFE);
    repo.git('add', 'notes.md');
    expect(repo.found()).toEqual([]);
  });
});

/** The id git gives for a ref that one side does not have. */
const ZERO = '0'.repeat(40);

/** What the pre-push hook gets for pushing `id` to `ref`, which the remote has at `remote` (or lacks). */
const pushing = (id: string, ref = 'refs/heads/main', remote = ZERO) =>
  `refs/heads/main ${id} ${ref} ${remote}\n`;

/** An object's id as the push check names it. */
const short = (id: string) => id.slice(0, 7);

describe('the push check', () => {
  const inPush = (dir: string, pushed: string, destination?: string) =>
    findPrivateWordsInPush(dir, [WORD], pushed, destination).sort();

  it('stops a commit whose message has the word, in any letter case', () => {
    const repo = repository();
    repo.write('notes.md', SAFE);
    const id = repo.commit(`Add the notes ${WORD.toUpperCase()} asked for`);
    expect(inPush(repo.dir, pushing(id))).toEqual([`${short(id)} message: "${WORD}"`]);
  });

  it("reads the author's and the committer's names and emails", () => {
    const repo = repository();
    const id = repo.commit('Add nothing', {
      GIT_AUTHOR_NAME: `Dr ${WORD}`,
      GIT_COMMITTER_EMAIL: `${WORD}@example.com`,
    });
    expect(inPush(repo.dir, pushing(id))).toEqual([
      `${short(id)} author name: "${WORD}"`,
      `${short(id)} committer email: "${WORD}"`,
    ]);
  });

  it('stops a word that one commit adds and a later one removes', () => {
    const repo = repository();
    repo.write('notes.md', `Written by ${WORD}.\n`);
    const added = repo.commit('Add the notes');
    repo.write('notes.md', SAFE);
    const tip = repo.commit('Edit the notes');
    // No file holds the word any more, but the push still sends the commit that added it.
    expect(repo.found()).toEqual([]);
    expect(inPush(repo.dir, pushing(tip))).toEqual([`${short(added)} file notes.md: "${WORD}"`]);
  });

  it('reads the names of files and folders, even of a file whose contents it skips', () => {
    const repo = repository();
    repo.write(`private-${WORD}.md`, SAFE);
    repo.write(`docs/${WORD}/notes.md`, SAFE);
    repo.write(`${WORD}.png`, `${WORD}\n`);
    const id = repo.commit('Add the notes');
    expect(inPush(repo.dir, pushing(id))).toEqual(
      [
        `${short(id)} path docs/${WORD}/notes.md: "${WORD}"`,
        `${short(id)} path private-${WORD}.md: "${WORD}"`,
        `${short(id)} path ${WORD}.png: "${WORD}"`,
      ].sort(),
    );
  });

  it('passes a clean range, even where commits the destination already holds have the word', () => {
    const repo = repository();
    const origin = remote();
    const sent = repo.commit(`Notes by ${WORD}`);
    repo.git('push', '--quiet', origin, 'HEAD:refs/heads/main');
    repo.write('notes.md', SAFE);
    const tip = repo.commit('Add the notes');
    expect(inPush(repo.dir, pushing(tip, 'refs/heads/main', sent), origin)).toEqual([]);
  });

  it('reads a commit that only another remote holds', () => {
    const repo = repository();
    const [upstream, origin] = [remote(), remote()];
    repo.git('remote', 'add', 'upstream', upstream);
    const id = repo.commit(`Notes by ${WORD}`);
    // This leaves upstream's remote-tracking branch at the commit, which says nothing of what origin holds.
    repo.git('push', '--quiet', 'upstream', 'HEAD:refs/heads/main');
    expect(inPush(repo.dir, pushing(id), origin)).toEqual([`${short(id)} message: "${WORD}"`]);
    expect(inPush(repo.dir, pushing(id), upstream)).toEqual([]);
  });

  it('reads the names of the refs it pushes to, but lets a deletion through', () => {
    const repo = repository();
    const origin = remote();
    const id = repo.commit('Add nothing');
    repo.git('push', '--quiet', origin, 'HEAD:refs/heads/main');
    const refs = pushing(id, `refs/heads/${WORD}`) + pushing(id, `refs/tags/v1-${WORD}`);
    expect(inPush(repo.dir, refs, origin)).toEqual([
      `${short(id)} ref refs/heads/${WORD}: "${WORD}"`,
      `${short(id)} ref refs/tags/v1-${WORD}: "${WORD}"`,
    ]);
    // Deleting a ref sends nothing, and must stay possible for one whose name already shows the word.
    expect(inPush(repo.dir, `(delete) ${ZERO} refs/heads/${WORD} ${id}\n`, origin)).toEqual([]);
  });

  it('reads annotated tags, a tag of a tag too: their names, taggers and messages', () => {
    const repo = repository();
    const origin = remote();
    repo.commit('Add nothing');
    repo.git('push', '--quiet', origin, 'HEAD:refs/heads/main');
    repo.run(['tag', '--annotate', '--message=First release', 'v1'], {
      GIT_COMMITTER_EMAIL: `${WORD}@example.com`,
    });
    repo.git('tag', '--annotate', `--message=Notes by ${WORD}`, 'v1-notes', 'v1');
    const [inner, outer] = [repo.git('rev-parse', 'v1'), repo.git('rev-parse', 'v1-notes')];
    expect(inPush(repo.dir, pushing(outer, 'refs/tags/v1-notes'), origin)).toEqual(
      [`${short(inner)} tagger email: "${WORD}"`, `${short(outer)} tag message: "${WORD}"`].sort(),
    );
  });

  it('reads what a merge changes from all of its parents, and what each branch brings in its own commits', () => {
    const repo = repository();
    repo.write('notes.md', SAFE);
    repo.commit('Add the notes');
    repo.git('switch', '--quiet', '--create', 'side');
    repo.write('side.md', `${WORD}\n`);
    const side = repo.commit('Add a side note');
    repo.git('switch', '--quiet', '-');
    repo.write('more.md', SAFE);
    repo.commit('Add more notes');
    repo.git('merge', '--quiet', '--no-ff', '--no-commit', 'side');
    repo.write('merged.md', `${WORD}\n`);
    const merge = repo.commit('Merge the side note');
    expect(inPush(repo.dir, pushing(merge))).toEqual(
      [`${short(merge)} file merged.md: "${WORD}"`, `${short(side)} file side.md: "${WORD}"`].sort(),
    );
  });

  describe('in a real push', () => {
    it('stops the push, and lets it through once the commit is clean', () => {
      const repo = repository();
      repo.git('remote', 'add', 'origin', remote());
      repo.guard();
      repo.write('notes.md', SAFE);
      const id = repo.commit(`Notes for ${WORD}`);
      const stopped = repo.push('origin', 'HEAD:refs/heads/main');
      expect(stopped.status).not.toBe(0);
      expect(stopped.stderr).toContain(`${short(id)} message: "${WORD}"`);
      expect(repo.git('ls-remote', 'origin')).toBe('');

      repo.git('commit', '--quiet', '--amend', '--message=Notes');
      const sent = repo.push('origin', 'HEAD:refs/heads/main');
      expect(sent.status, sent.stderr).toBe(0);
      expect(repo.git('ls-remote', 'origin')).toBe(`${repo.git('rev-parse', 'HEAD')}\trefs/heads/main`);
    });

    it('stops a commit that only another remote holds', () => {
      const repo = repository();
      repo.git('remote', 'add', 'upstream', remote());
      repo.git('remote', 'add', 'origin', remote());
      const id = repo.commit(`Notes by ${WORD}`);
      repo.git('push', '--quiet', 'upstream', 'HEAD:refs/heads/main');
      repo.guard();
      const stopped = repo.push('origin', 'HEAD:refs/heads/main');
      expect(stopped.status).not.toBe(0);
      expect(stopped.stderr).toContain(`${short(id)} message: "${WORD}"`);
      expect(repo.git('ls-remote', 'origin')).toBe('');
    });

    it('stops an annotated tag on a commit the remote already holds', () => {
      const repo = repository();
      repo.git('remote', 'add', 'origin', remote());
      repo.guard();
      repo.commit('Add nothing');
      expect(repo.push('origin', 'HEAD:refs/heads/main').status).toBe(0);
      repo.git('tag', '--annotate', `--message=Notes by ${WORD}`, 'v1');
      const stopped = repo.push('origin', 'refs/tags/v1');
      expect(stopped.status).not.toBe(0);
      expect(stopped.stderr).toContain(`${short(repo.git('rev-parse', 'v1'))} tag message: "${WORD}"`);
      expect(repo.git('ls-remote', '--tags', 'origin')).toBe('');
    });

    it('reads the commit it sends, not a clean local replacement for it', () => {
      const repo = repository();
      repo.git('remote', 'add', 'origin', remote());
      repo.guard();
      repo.write('notes.md', `Written by ${WORD}.\n`);
      const original = repo.commit('Add the notes');
      repo.write('notes.md', SAFE);
      repo.git('add', '--all');
      const clean = repo.git('commit-tree', repo.git('write-tree'), '-m', 'Add the notes');
      repo.git('replace', original, clean);
      // Git now shows the clean commit in place of the original, but a push sends the original.
      expect(repo.git('show', original)).not.toContain(WORD);
      const stopped = repo.push('origin', 'HEAD:refs/heads/main');
      expect(stopped.status).not.toBe(0);
      expect(stopped.stderr).toContain(`${short(original)} file notes.md: "${WORD}"`);
      expect(repo.git('ls-remote', 'origin')).toBe('');
    });
  });
});
