import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findPrivateWords } from './private-words.ts';

// A made-up word: the real ones are set only on the machines that keep them (see repo.test.ts).
const WORD = 'quokkatoast';
const SAFE = 'Nothing personal here.\n';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A new, empty git repository to write files into, run git in, and check. */
function repository() {
  const dir = mkdtempSync(join(tmpdir(), 'loopweft-words-'));
  made.push(dir);
  const git = (...args: string[]) => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '--quiet');
  return {
    git,
    write: (file: string, text: string) => writeFileSync(join(dir, file), text),
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
