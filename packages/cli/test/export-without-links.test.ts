// `loopweft export` on a drive without hard links (FAT, some network shares), played here by a link that the
// file system refuses. The file then goes in place by a rename under a lock folder: never half a file, even
// when the export stops part way, and still never over a file another export made.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/main.ts';

/** What the pretend file system does: how many renames it stops (an export stopped part way). */
const fake = vi.hoisted(() => ({ stopRenames: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const refused = (what: string, code: string) => Object.assign(new Error(`${code}: ${what}`), { code });
  return {
    ...real,
    linkSync: () => {
      throw refused('operation not permitted, link', 'EPERM');
    },
    // A copy stopped part way leaves the start of the file, as a killed process would.
    copyFileSync: (from: string, to: string) => {
      real.writeFileSync(to, real.readFileSync(from).subarray(0, 1000));
      throw refused('i/o error, copyfile', 'EIO');
    },
    renameSync: (from: string, to: string) => {
      if (fake.stopRenames > 0) {
        fake.stopRenames -= 1;
        throw refused('i/o error, rename', 'EIO');
      }
      real.renameSync(from, to);
    },
  };
});

const dir = mkdtempSync(join(tmpdir(), 'loopweft-nolinks-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  fake.stopRenames = 0;
});

async function run(...args: string[]): Promise<{ code: number; err: string }> {
  let err = '';
  const code = await main(args, { out: () => {}, err: (t) => (err += t) }, { today: '2026-10-18' });
  return { code, err };
}

const project = join(dir, 'talk.loopweft');
const at = (name: string) => join(dir, name);
const leftovers = () =>
  readdirSync(dir).filter((f) => f.startsWith('.loopweft-export-') || f.endsWith('.loopweft-lock'));

describe('export on a drive without hard links', () => {
  // Not copyFileSync: the pretend one cuts it short.
  writeFileSync(
    project,
    readFileSync(fileURLToPath(new URL('../../../examples/polycrisis.loopweft', import.meta.url))),
  );

  it('puts the whole file in place, and never over another', async () => {
    expect((await run('export', project, '--html', '--force', '-o', at('reference.html'))).code).toBe(0);
    const reference = readFileSync(at('reference.html'), 'utf8');
    expect((await run('export', project, '--html', '-o', at('talk.html'))).code).toBe(0);
    expect(readFileSync(at('talk.html'), 'utf8')).toBe(reference);
    // Two at once: one makes the file, the other finds it there.
    const both = await Promise.all([
      run('export', project, '--html', '-o', at('race.html')),
      run('export', project, '--html', '-o', at('race.html')),
    ]);
    expect(both.map((r) => r.code).sort()).toEqual([0, 2]);
    expect(both.find((r) => r.code === 2)?.err).toContain('race.html already exists');
    expect(readFileSync(at('race.html'), 'utf8')).toBe(reference);
    expect(leftovers()).toEqual([]);
  });

  it('leaves nothing where the file goes when it stops before putting it there', async () => {
    fake.stopRenames = 1;
    const { code } = await run('export', project, '--html', '-o', at('stopped.html'));
    expect(code).toBe(3);
    expect(existsSync(at('stopped.html'))).toBe(false);
    expect(leftovers()).toEqual([]);
    // The next export makes it.
    expect((await run('export', project, '--html', '-o', at('stopped.html'))).code).toBe(0);
  });

  it('waits for no lock it finds, and says what to remove if the export that made it was stopped', async () => {
    mkdirSync(at('locked.html.loopweft-lock'));
    const { code, err } = await run('export', project, '--html', '-o', at('locked.html'));
    expect(code).toBe(2);
    expect(err).toContain('Another export is writing');
    expect(err).toContain('remove the folder');
    expect(existsSync(at('locked.html'))).toBe(false);
    rmSync(at('locked.html.loopweft-lock'), { recursive: true });
    expect((await run('export', project, '--html', '-o', at('locked.html'))).code).toBe(0);
  });
});
