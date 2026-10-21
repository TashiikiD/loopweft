// `loopweft export --mp4` and `--webm`: every mistake in the options is named before a browser is started (the
// video itself is made end to end, apps/studio/e2e/export-video.spec.ts). LOOPWEFT_CHROME names a browser that
// isn't there, so a test that got as far as starting one would say so.
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'loopweft-video-'));
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

describe('loopweft export --mp4 and --webm', () => {
  it.each([
    [['--mp4', '--webm'], 'Export one format at a time (--mp4, --webm given).'],
    [
      ['--mp4', '--step', 'S04.2a'],
      '--step is for pictures (--png or --svg); a video of one step is --from S04.2a --to S04.2a.',
    ],
    [['--mp4', '--all-steps'], '--all-steps is for pictures (--png or --svg).'],
    [['--mp4', '--scale', '2'], '--scale is for pictures (--png or --svg).'],
    [['--mp4', '--no-notes'], '--no-notes is for the HTML file (--html).'],
    [['--mp4', '--paper', 'a4'], '--paper is for the PDFs (--pdf).'],
    [
      ['--mp4', '--scene', 'S04', '--from', 'S04.2a', '--to', 'S04.3'],
      'Play a scene (--scene) or steps (--from and --to), not both.',
    ],
    [
      ['--mp4', '--from', 'S04.2a'],
      'Steps run --from one --to another (e.g. --from S04.2a --to S04.6; the same step twice for one).',
    ],
    [
      ['--mp4', '--hold', '2', '--talk-timing'],
      'Hold each step (--hold) or keep the talk’s timing (--talk-timing), not both.',
    ],
    [['--mp4', '--hold', 'long'], '--hold is a number of seconds, not "long".'],
    [['--mp4', '--hold', '90'], 'The hold after each step is 0 to 60 seconds, not 90.'],
    [['--mp4', '--height', '480'], '--height is 1080 or 720 (1920 × 1080 or 1280 × 720 pixels), not "480".'],
    [['--webm', '--fps', '24'], '--fps is 30 or 60 (frames a second), not "24".'],
    [['--mp4', '--scene', 'S99'], 'No scene "S99" (did you mean "S09"?).'],
    [
      ['--mp4', '--from', 'S05.1', '--to', 'S04.2a'],
      'S04.2a comes before S05.1 in the story; name the first step of the video first.',
    ],
    [['--png', '--map', '--scene', 'S04'], '--scene is for video (--mp4 or --webm).'],
    [['--html', '--talk-timing'], '--talk-timing is for video (--mp4 or --webm).'],
    [['--pdf', 'slides', '--fps', '60'], '--fps is for video (--mp4 or --webm).'],
  ])('%j is refused before any drawing', async (options, message) => {
    const result = await run('export', project, ...options);
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe(message);
  });

  it('says how to name a browser when it cannot find one', async () => {
    const result = await run('export', project, '--mp4', '--scene', 'S01', '--json');
    expect(result.code).toBe(2);
    expect(JSON.parse(result.out)).toEqual({
      ok: false,
      error: { message: `LOOPWEFT_CHROME names ${missing}, which is not there.`, exitCode: 2 },
    });
  });

  it('never writes a video over the project or another file without --force', async () => {
    const over = await run('export', project, '--mp4', '-o', project, '--force');
    expect(over.err.trim()).toBe('The video would replace the project; name another with -o.');
    const taken = join(dir, 'talk-story.mp4');
    writeFileSync(taken, 'not a video');
    const again = await run('export', project, '--mp4');
    expect(again.code).toBe(2);
    expect(again.err.trim()).toBe(
      `${taken} already exists; choose another name, or replace it with --force.`,
    );
  });

  it('refuses a story with no steps to play', async () => {
    const bare = join(dir, 'bare.loopweft');
    expect((await run('new', bare, '--title', 'Bare')).code).toBe(0);
    const result = await run('export', bare, '--webm');
    expect(result.code).toBe(2);
    expect(result.err.trim()).toBe('The story has no steps yet, so there is nothing to play.');
    expect(existsSync(join(dir, 'bare-story.webm'))).toBe(false);
  });
});
