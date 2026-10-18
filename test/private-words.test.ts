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

/** A new, empty git repository to write files into, run git in, commit, and check. */
function repository() {
  const dir = folder('loopweft-words-');
  const run = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, env: { ...ENV, ...env }, encoding: 'utf8', stdio: 'pipe' }).trim();
  const git = (...args: string[]) => run(args);
  git('init', '--quiet');
  return {
    dir,
    git,
    write: (file: string, text: string) => writeFileSync(join(dir, file), text),
    /** Commits every change, by `identity` where given, and gives the new commit's id. */
    commit: (message: string, identity: Record<string, string> = {}) => {
      git('add', '--all');
      run(['commit', '--quiet', '--allow-empty', `--message=${message}`], identity);
      return git('rev-parse', 'HEAD');
    },
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

/** What git gives the pre-push hook for pushing `id` to a branch the remote has at `remote` (or not yet). */
const pushing = (id: string, remote = ZERO) => `refs/heads/main ${id} refs/heads/main ${remote}\n`;

/** A commit's id as the push check names it. */
const short = (id: string) => id.slice(0, 7);

describe('the push check', () => {
  const inPush = (dir: string, pushed: string) => findPrivateWordsInPush(dir, [WORD], pushed).sort();

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

  it('passes a clean range, even where commits the remote already has hold the word', () => {
    const repo = repository();
    const sent = repo.commit(`Notes by ${WORD}`);
    // As a push or a fetch leaves it: the remote-tracking branch is where the remote's branch is.
    repo.git('update-ref', 'refs/remotes/origin/main', sent);
    repo.write('notes.md', SAFE);
    const tip = repo.commit('Add the notes');
    expect(inPush(repo.dir, pushing(tip, sent))).toEqual([]);
  });

  it('ignores a deleted branch, which sends nothing', () => {
    const repo = repository();
    const gone = repo.commit(`Notes by ${WORD}`);
    expect(inPush(repo.dir, `(delete) ${ZERO} refs/heads/notes ${gone}\n`)).toEqual([]);
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

  it('stops a real push, and lets it through once the commit is clean', () => {
    const repo = repository();
    const remote = folder('loopweft-remote-');
    execFileSync('git', ['init', '--quiet', '--bare'], { cwd: remote, env: ENV, stdio: 'pipe' });
    repo.git('remote', 'add', 'origin', remote);
    // A hook with the check alone, on the made-up word: .githooks/pre-push then runs the whole fast gate.
    const hook = join(repo.dir, '.git', 'hooks', 'pre-push');
    const quoted = (path: string) => `"${path.replaceAll('\\', '/')}"`;
    mkdirSync(dirname(hook), { recursive: true });
    writeFileSync(hook, `#!/bin/sh\nexec ${quoted(process.execPath)} ${quoted(CHECK)}\n`);
    chmodSync(hook, 0o755);
    const push = () =>
      spawnSync('git', ['push', '--quiet', 'origin', 'HEAD:refs/heads/main'], {
        cwd: repo.dir,
        env: { ...ENV, LOOPWEFT_PRIVATE_WORDS: WORD },
        encoding: 'utf8',
      });

    repo.write('notes.md', SAFE);
    const id = repo.commit(`Notes for ${WORD}`);
    const stopped = push();
    expect(stopped.status).not.toBe(0);
    expect(stopped.stderr).toContain(`${short(id)} message: "${WORD}"`);
    expect(repo.git('ls-remote', 'origin')).toBe('');

    repo.git('commit', '--quiet', '--amend', '--message=Notes');
    const sent = push();
    expect(sent.status, sent.stderr).toBe(0);
    expect(repo.git('ls-remote', 'origin')).toBe(`${repo.git('rev-parse', 'HEAD')}\trefs/heads/main`);
  });
});
