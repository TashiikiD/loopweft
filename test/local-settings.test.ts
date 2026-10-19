// Where the private words come from in a linked worktree (`git worktree add`), which shares the repository but
// not its git-ignored `.local.json`: from the main checkout's, so the pre-push hook still checks a push.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privateWords } from '../packages/model/scripts/polycrisis-deck.ts';

// Made-up words: the real ones are set only on the machines that keep them (see repo.test.ts).
const WORD = 'quokkatoast';
const OTHER = 'wombatjam';

/**
 * The words found, with any that these tests did not make up hidden, so that a failure which reads this
 * machine's own `.local.json` never prints its words.
 */
const shown = (words: string[]): string[] =>
  words.map((word) => ([WORD, OTHER].includes(word) ? word : '(a word these tests did not set)'));

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
  vi.unstubAllEnvs();
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A new, empty folder, removed after the test. */
function folder(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** Git, in the folder `cwd`. */
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8', stdio: 'pipe' }).trim();

/**
 * A repository with one commit, holding `copied` (files of this repository, at the same paths), and a linked
 * worktree of it on a new branch: the folders of both checkouts.
 */
function checkouts(copied: string[] = []): { main: string; worktree: string } {
  const main = folder('loopweft-main-');
  git(main, 'init', '--quiet');
  for (const file of copied) {
    mkdirSync(dirname(join(main, file)), { recursive: true });
    copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(main, file));
  }
  git(main, 'add', '--all');
  git(main, 'commit', '--quiet', '--allow-empty', '--message=Start');
  const worktree = folder('loopweft-worktree-');
  git(main, 'worktree', 'add', '--quiet', '-b', 'side', worktree);
  return { main, worktree };
}

/** A `.local.json` in the folder `dir`, setting these private words. */
const settings = (dir: string, ...words: string[]) =>
  writeFileSync(join(dir, '.local.json'), `${JSON.stringify({ privateWords: words })}\n`);

describe('the private words of a linked worktree', () => {
  // LOOPWEFT_PRIVATE_WORDS comes before any `.local.json`, so it is left empty where they are what is read.
  beforeEach(() => vi.stubEnv('LOOPWEFT_PRIVATE_WORDS', ''));

  it("come from the main checkout's .local.json when the worktree has none of its own", () => {
    const { main, worktree } = checkouts();
    settings(main, WORD);
    expect(shown(privateWords(worktree))).toEqual([WORD]);
  });

  it("come from the worktree's own .local.json where it has one", () => {
    const { main, worktree } = checkouts();
    settings(main, WORD);
    settings(worktree, OTHER);
    expect(shown(privateWords(worktree))).toEqual([OTHER]);
  });

  it('come from LOOPWEFT_PRIVATE_WORDS before any .local.json', () => {
    const { main, worktree } = checkouts();
    settings(main, WORD);
    vi.stubEnv('LOOPWEFT_PRIVATE_WORDS', OTHER);
    expect(shown(privateWords(worktree))).toEqual([OTHER]);
  });

  it('are none where no checkout has a .local.json, as on CI', () => {
    const { worktree } = checkouts();
    expect(shown(privateWords(worktree))).toEqual([]);
  });

  // Git gives a hook GIT_DIR, and the tests that the pre-push hook runs (npm run verify:fast) read throwaway
  // repositories such as these.
  it("come from the worktree's own repository, whatever repository GIT_DIR names", () => {
    const { main, worktree } = checkouts();
    settings(main, WORD);
    const other = checkouts();
    settings(other.main, OTHER);
    vi.stubEnv('GIT_DIR', git(other.worktree, 'rev-parse', '--path-format=absolute', '--git-dir'));
    expect(shown(privateWords(worktree))).toEqual([WORD]);
  });

  it('come from no folder around a bare repository, which has no main checkout', () => {
    const { main } = checkouts();
    const around = folder('loopweft-bare-');
    const bare = join(around, 'project.git');
    git(around, 'clone', '--quiet', '--bare', main, bare);
    settings(around, WORD);
    const worktree = folder('loopweft-worktree-');
    // The clone has the main checkout's branches, `side` among them.
    git(bare, 'worktree', 'add', '--quiet', '-b', 'elsewhere', worktree);
    expect(shown(privateWords(worktree))).toEqual([]);
  });
});

/**
 * The files the pre-push hook runs, copied into a throwaway repository so that they read its `.local.json`,
 * never this machine's.
 */
const HOOK = ['scripts/check-push.ts', 'packages/model/scripts/polycrisis-deck.ts', 'test/private-words.ts'];

/**
 * A throwaway repository holding the hook's files, a linked worktree of it, and somewhere to push to. Its
 * pre-push hook runs the privacy check as .githooks/pre-push does, from the checkout that pushes.
 */
function guarded(): { main: string; worktree: string } {
  const { main, worktree } = checkouts(HOOK);
  const hook = join(main, '.git', 'hooks', 'pre-push');
  mkdirSync(dirname(hook), { recursive: true });
  writeFileSync(
    hook,
    `#!/bin/sh\nexec "${process.execPath.replaceAll('\\', '/')}" scripts/check-push.ts "$@"\n`,
  );
  chmodSync(hook, 0o755);
  const remote = folder('loopweft-remote-');
  git(remote, 'init', '--quiet', '--bare');
  git(main, 'remote', 'add', 'origin', remote);
  return { main, worktree };
}

/** A real `git push` of the worktree's branch, which runs the hook, with the words read from `.local.json`. */
const push = (worktree: string) =>
  spawnSync('git', ['push', '--quiet', 'origin', 'HEAD:refs/heads/side'], {
    cwd: worktree,
    env: { ...ENV, LOOPWEFT_PRIVATE_WORDS: '' },
    encoding: 'utf8',
  });

/** What a push printed: git sends the hook's output to its standard error. */
const printed = (run: ReturnType<typeof push>) => `${run.stdout}${run.stderr}`;

describe('the pre-push hook of a linked worktree', () => {
  it('stops a private word set only in the main checkout, and lets the push through once it is gone', () => {
    const { main, worktree } = guarded();
    settings(main, WORD);
    git(worktree, 'commit', '--quiet', '--allow-empty', `--message=Notes for ${WORD}`);
    const stopped = push(worktree);
    expect(stopped.status).not.toBe(0);
    expect(stopped.stderr).toContain(`message: "${WORD}"`);
    expect(git(worktree, 'ls-remote', 'origin')).toBe('');

    git(worktree, 'commit', '--quiet', '--amend', '--allow-empty', '--message=Notes');
    const sent = push(worktree);
    expect(sent.status, sent.stderr).toBe(0);
    expect(printed(sent)).toContain('No private word in what this push sends.');
  });

  it('says that it checked nothing where no words are set, as on CI, and lets the push through', () => {
    const { worktree } = guarded();
    git(worktree, 'commit', '--quiet', '--allow-empty', `--message=Notes for ${WORD}`);
    const sent = push(worktree);
    expect(sent.status, sent.stderr).toBe(0);
    expect(printed(sent)).toContain(
      'No private words are set (privateWords, see CONTRIBUTING.md), so none were checked.',
    );
    expect(git(worktree, 'ls-remote', 'origin')).toBe(
      `${git(worktree, 'rev-parse', 'HEAD')}\trefs/heads/side`,
    );
  });
});
