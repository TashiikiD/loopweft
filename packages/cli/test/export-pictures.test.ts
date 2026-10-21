// `loopweft export --png` and `--svg`: every mistake in the options is named before a browser is started (the drawing
// itself is tested end to end, apps/studio/e2e/export-pictures.spec.ts). LOOPWEFT_CHROME names a browser that
// isn't there, so a test that got as far as starting one would say so.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-png-'));
const project = join(dir, 'talk.loopweft');
const missing = join(dir, 'no-such-browser.exe');
let before: string | undefined;
beforeAll(() => {
  copyFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), project);
  before = process.env.LOOPWEFT_CHROME;
  process.env.LOOPWEFT_CHROME = missing;
});
afterAll(() => {
  if (before === undefined) delete process.env.LOOPWEFT_CHROME;
  else process.env.LOOPWEFT_CHROME = before;
  rmSync(dir, { recursive: true, force: true });
});

async function run(...args: string[]) {
  let out = '';
  let err = '';
  const code = await main(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe('loopweft export --png and --svg', () => {
  it.each([
    [['--png'], 'Choose what to draw: --step <step> (e.g. S04.2a), --all-steps, or --map (the whole map).'],
    [['--png', '--map', '--all-steps'], 'Draw one thing at a time (--all-steps, --map given).'],
    [['--png', '--step', 'S04.2a', '--trim'], '--trim is for the whole map (--map).'],
    [['--png', '--map', '--scale', '3'], '--scale is 1 (1920 × 1080) or 2 (3840 × 2160), not "3".'],
    [['--png', '--map', '--no-notes'], '--no-notes is for the HTML file (--html).'],
    [['--png', '--step', 'S99.1'], 'No scene "S99" (did you mean "S09"?).'],
    [['--html', '--png', '--map'], 'Export one format at a time (--html, --png given).'],
    [['--html', '--step', 'S04.2a'], '--step is for pictures (--png or --svg).'],
    [['--html', '--category-words'], '--category-words is for pictures (--png or --svg).'],
    [[], 'Choose what to export: --html (one HTML file), --png (pictures) or --svg (drawings).'],
    [['--svg', '--png', '--map'], 'Export one format at a time (--png, --svg given).'],
    [
      ['--svg', '--map', '--scale', '2'],
      'An SVG drawing has no size in pixels: it stays sharp at any size. --scale is for --png.',
    ],
    [['--svg', '--step', 'S04.2a', '--trim'], '--trim is for the whole map (--map).'],
    [['--svg'], 'Choose what to draw: --step <step> (e.g. S04.2a), --all-steps, or --map (the whole map).'],
  ])('%j is refused before any drawing', async (options, message) => {
    const result = await run('export', project, ...options);
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe(message);
  });

  it('says how to name a browser when it cannot find one', async () => {
    const result = await run('export', project, '--png', '--map', '--json');
    expect(result.code).toBe(2);
    expect(JSON.parse(result.out)).toEqual({
      ok: false,
      error: { message: `LOOPWEFT_CHROME names ${missing}, which is not there.`, exitCode: 2 },
    });
  });

  it('never writes a picture over the project, even with --force', async () => {
    const result = await run('export', project, '--png', '--map', '-o', project, '--force');
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe('The picture would replace the project; name another with -o.');
  });

  it('refuses a story with no steps to draw', async () => {
    const bare = join(dir, 'bare.loopweft');
    expect((await run('new', bare, '--title', 'Bare')).code).toBe(0);
    const result = await run('export', bare, '--png', '--all-steps');
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe('The story has no steps to draw yet; draw the whole map instead.');
  });
});
