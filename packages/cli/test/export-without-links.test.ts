// `loopweft export` on a drive without hard links (FAT, some network shares), played here by a link that the
// file system refuses. Node's rename replaces what is there, so without a hard link an export cannot add a file
// safely: without --force it refuses, never replacing anything, even a file another program makes while it
// works; with --force a rename puts the whole file in place at once.
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/main.ts';

/**
 * What the pretend file system does: how many renames it stops (an export stopped part way), and where another
 * program writes a file of its own just before a rename puts anything there.
 */
const fake = vi.hoisted(() => ({ stopRenames: 0, otherWriter: '' }));

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  const refused = (what: string, code: string) => Object.assign(new Error(`${code}: ${what}`), { code });
  return {
    ...real,
    linkSync: () => {
      throw refused('operation not permitted, link', 'EPERM');
    },
    renameSync: (from: string, to: string) => {
      if (fake.otherWriter && to === fake.otherWriter) real.writeFileSync(to, 'made by another program');
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
  fake.otherWriter = '';
});

async function run(...args: string[]): Promise<{ code: number; err: string }> {
  let err = '';
  const code = await main(args, { out: () => {}, err: (t) => (err += t) }, { today: '2026-10-18' });
  return { code, err };
}

const project = join(dir, 'talk.loopweft');
const at = (name: string) => join(dir, name);
const leftovers = () => readdirSync(dir).filter((f) => f.startsWith('.loopweft-export-'));

describe('export on a drive without hard links', () => {
  writeFileSync(
    project,
    readFileSync(fileURLToPath(new URL('../../../examples/polycrisis.loopweft', import.meta.url))),
  );

  it('asks for --force rather than risk a file, and with it puts the whole file in place', async () => {
    const { code, err } = await run('export', project, '--html', '-o', at('talk.html'));
    expect(code).toBe(2);
    expect(err).toContain('it has no hard links');
    expect(err).toContain('--force');
    expect(existsSync(at('talk.html'))).toBe(false);
    expect(leftovers()).toEqual([]);
    expect((await run('export', project, '--html', '--force', '-o', at('talk.html'))).code).toBe(0);
    expect(readFileSync(at('talk.html'), 'utf8')).toContain('data-notes="included"');
    expect(leftovers()).toEqual([]);
  });

  it('never puts its file over one another program makes while it works', async () => {
    // Another program writes the file just before anything would be moved there: an export without --force
    // moves nothing there, so whatever that program wrote is never replaced.
    fake.otherWriter = at('busy.html');
    const { code } = await run('export', project, '--html', '-o', at('busy.html'));
    expect(code).toBe(2);
    expect(existsSync(at('busy.html')) ? readFileSync(at('busy.html'), 'utf8') : '').not.toContain('<html');
    // A file made after the export first looked, before it would put its own there, is found and kept.
    writeFileSync(at('late.html'), 'made by another program');
    fake.otherWriter = '';
    const late = await run('export', project, '--html', '-o', at('late.html'));
    expect(late.code).toBe(2);
    expect(readFileSync(at('late.html'), 'utf8')).toBe('made by another program');
    expect(leftovers()).toEqual([]);
  });

  it('counts a link to nothing as a file of that name', async (ctx) => {
    try {
      symlinkSync(at('nowhere.html'), at('dangling.html'));
    } catch {
      // Windows lets only some accounts make symbolic links.
      ctx.skip();
    }
    const { code, err } = await run('export', project, '--html', '-o', at('dangling.html'));
    expect(code).toBe(2);
    expect(err).toContain('dangling.html already exists');
    expect(lstatSync(at('dangling.html')).isSymbolicLink()).toBe(true);
    expect(existsSync(at('nowhere.html'))).toBe(false);
  });

  it('leaves the old file whole when a --force export stops before putting its own there', async () => {
    writeFileSync(at('stopped.html'), 'the old file');
    fake.stopRenames = 1;
    expect((await run('export', project, '--html', '--force', '-o', at('stopped.html'))).code).toBe(3);
    expect(readFileSync(at('stopped.html'), 'utf8')).toBe('the old file');
    expect(leftovers()).toEqual([]);
  });
});
