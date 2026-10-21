// Video, in this computer's Chrome or Edge: steps played frame by frame by the export page and encoded by the
// browser, from the command line and the Studio. Each file is played back in the browser: its length and size,
// and its last frame against the picture of the step it ends on. The same frames make the same WebM, byte for
// byte, on every system; Chrome's H.264 encoder (MP4) does on some computers and not on others (GitHub's Linux
// and Windows servers), so there the MP4 made twice is checked frame by frame instead. With LOOPWEFT_REVIEW set
// to a folder, the videos are saved there for the review.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '@loopweft/cli';
import type { FileEvent, VideoEndEvent, VideoJob } from '@loopweft/export';
import { exportInBrowser } from '@loopweft/export/node';
import { expect, type Page, test } from '@playwright/test';
import { difference, pictures, review, text } from './pictures.ts';
import { choose } from './story.ts';

const STEM = 'global-polycrisis-the-connections-that-change-everything';

/** A video job's whole file, put together from its pieces as the command line writes it. */
async function video(job: VideoJob): Promise<{ bytes: Uint8Array; end: VideoEndEvent }> {
  const parts: Uint8Array[] = [];
  let end: VideoEndEvent | null = null;
  await exportInBrowser(text, job, (event) => {
    if (event.type === 'data') parts.push(event.bytes);
    else end = event;
  });
  const made = end as VideoEndEvent | null;
  if (!made) throw new Error('No end to the video.');
  const bytes = new Uint8Array(Buffer.concat(parts));
  bytes.set(made.head, 0);
  expect(bytes.length).toBe(made.size);
  return { bytes, end: made };
}

/** Which frames of two MP4s of the same frames differ: their sizes and bytes, from each file's own tables. */
function framesApart(a: Uint8Array, b: Uint8Array): string {
  const table = (file: Uint8Array) => {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    const at = (type: string) => Buffer.from(file).lastIndexOf(type);
    const sizes = at('stsz');
    const offsets = at('stco');
    const keys = at('stss');
    const n = view.getUint32(sizes + 12);
    return {
      frames: Array.from({ length: n }, (_, i) => {
        const size = view.getUint32(sizes + 16 + 4 * i);
        const offset = view.getUint32(offsets + 12 + 4 * i);
        return Buffer.from(file.subarray(offset, offset + size));
      }),
      keys: Array.from({ length: view.getUint32(keys + 8) }, (_, i) => view.getUint32(keys + 12 + 4 * i) - 1),
    };
  };
  const [x, y] = [table(a), table(b)];
  const apart = x.frames.flatMap((f, i) => (y.frames[i] && f.equals(y.frames[i] as Buffer) ? [] : [i]));
  return `${x.frames.length} and ${y.frames.length} frames, key frames at ${x.keys.join(' ')} and ${y.keys.join(' ')}; ${apart.length} differ, from ${apart.slice(0, 8).join(' ')}`;
}

/** A video as the browser plays it: its length, its size, and the frames shown at `times` (as PNGs). */
async function played(
  page: Page,
  bytes: Uint8Array,
  type: string,
  times: number[],
): Promise<{ duration: number; width: number; height: number; frames: Uint8Array[] }> {
  const result = await page.evaluate(
    async ([base64, kind, at]) => {
      const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([data], { type: kind }));
      await new Promise<void>((ok, no) => {
        v.onloadeddata = () => ok();
        v.onerror = () =>
          no(new Error(`The browser could not play it: ${v.error?.message ?? 'no reason given'}`));
      });
      const frames: string[] = [];
      for (const t of at) {
        // The seek, then the frame painted for it: on a slow machine the seek can end before the frame is there
        // to draw (a frame callback, with a second's grace for a browser that never calls it while paused).
        const painted = new Promise<void>((ok) => {
          v.requestVideoFrameCallback(() => ok());
          setTimeout(ok, 1000);
        });
        v.currentTime = Math.max(0, t);
        await new Promise<void>((ok) => {
          v.onseeked = () => ok();
        });
        await painted;
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d')?.drawImage(v, 0, 0);
        frames.push(canvas.toDataURL('image/png').split(',')[1] as string);
      }
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, frames };
    },
    [Buffer.from(bytes).toString('base64'), type, times] as const,
  );
  return { ...result, frames: result.frames.map((f) => new Uint8Array(Buffer.from(f, 'base64'))) };
}

const job = (over: Partial<VideoJob>): VideoJob => ({
  format: 'mp4',
  target: { kind: 'steps', from: 'S04.2a', to: 'S04.2b' },
  timing: { kind: 'hold', seconds: 1 },
  height: 1080,
  fps: 30,
  categoryWords: false,
  ...over,
});

test.beforeEach(async ({ page }) => {
  // A page of this origin to play the videos in (a video drawn from another origin cannot be read back).
  await page.goto('/');
});

test('an MP4 of steps: a file the browser plays, ending on the step settled, and the same frames made again', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const first = await video(job({}));
  const { end } = first;
  expect(end).toMatchObject({ name: 'S04.2a-to-S04.2b.mp4', width: 1920, height: 1080, fps: 30 });
  expect(end.codec).toMatch(/^avc1\./);
  // Each step's motion and a second's hold: more than the two seconds of holds, and a whole number of frames.
  expect(end.seconds).toBeGreaterThan(2);
  expect(end.frames).toBe(Math.round(end.seconds * 30));
  console.log(
    `MP4 (${process.platform}): ${end.codec}, ${end.frames} frames, ${end.size} bytes, notes ${JSON.stringify(end.notes)}`,
  );
  const second = await video(job({}));
  const same = Buffer.from(second.bytes).equals(Buffer.from(first.bytes));
  console.log(
    `MP4 twice (${process.platform}): ${same ? 'the same bytes' : framesApart(first.bytes, second.bytes)}`,
  );
  expect(second.end.frames).toBe(end.frames);
  review('video/S04.2a-to-S04.2b.mp4', first.bytes);

  const last = end.seconds - 0.5 / 30;
  const shown = await played(page, first.bytes, 'video/mp4', [last]);
  // Made again: the same frames, though not always the same bytes (above); its last frame as the first's.
  const again = await played(page, second.bytes, 'video/mp4', [last]);
  const twice = await difference(page, shown.frames[0] as Uint8Array, again.frames[0] as Uint8Array);
  expect(twice.far).toBe(0);
  expect(twice.mean).toBeLessThan(0.5);
  expect(shown.duration).toBeCloseTo(end.seconds, 2);
  expect([shown.width, shown.height]).toEqual([1920, 1080]);
  // The last frame is S04.2b held: its picture, but for what the encoding leaves soft.
  const [png] = await pictures({
    format: 'png',
    target: { kind: 'step', step: 'S04.2b' },
    scale: 1,
    categoryWords: false,
  });
  const apart = await difference(page, shown.frames[0] as Uint8Array, (png as FileEvent).bytes);
  console.log(`Last frame against S04.2b's picture (${process.platform}): ${JSON.stringify(apart)}`);
  expect(apart.far).toBeLessThan(0.01);
  expect(apart.mean).toBeLessThan(2);
  review('video/S04.2a-to-S04.2b-last.png', shown.frames[0] as Uint8Array);
});

test('a WebM at 720p and 60 frames a second, in the talk’s timing: as long as the talk gives the steps, the same bytes twice', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // S04.2a is due 7 s into its scene, S04.2b at 14 s and S04.2c at 20 s: 13 s in all.
  const webm = job({ format: 'webm', timing: { kind: 'talk' }, height: 720, fps: 60 });
  const { bytes, end } = await video(webm);
  // VP9 gives the same bytes for the same frames on every system: this checks the frames, and the file around
  // them, byte for byte.
  const second = await video(webm);
  expect(Buffer.from(second.bytes).equals(Buffer.from(bytes))).toBe(true);
  expect(end).toMatchObject({
    name: 'S04.2a-to-S04.2b.webm',
    width: 1280,
    height: 720,
    fps: 60,
    frames: 780,
  });
  expect(end.codec).toMatch(/^vp09\./);
  review('video/S04.2a-to-S04.2b-talk-720p60.webm', bytes);
  const shown = await played(page, bytes, 'video/webm', [6.9, 12.9]);
  expect(shown.duration).toBeCloseTo(13, 1);
  expect([shown.width, shown.height]).toEqual([1280, 720]);
});

/** A GIF as the browser decodes it: its size, its frames and their time, how often it plays, its last frame. */
async function decoded(
  page: Page,
  bytes: Uint8Array,
): Promise<{
  width: number;
  height: number;
  frames: number;
  seconds: number;
  loops: number;
  last: Uint8Array;
}> {
  const result = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const decoder = new ImageDecoder({ data, type: 'image/gif' });
    await decoder.tracks.ready;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack as ImageTrack;
    let micro = 0;
    let last = '';
    let size = { width: 0, height: 0 };
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      micro += image.duration ?? 0;
      if (i === track.frameCount - 1) {
        const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
        canvas.getContext('2d')?.drawImage(image, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        last = await new Promise<string>((done) => {
          const r = new FileReader();
          r.onload = () => done(String(r.result).split(',')[1] as string);
          r.readAsDataURL(blob);
        });
        size = { width: image.displayWidth, height: image.displayHeight };
      }
      image.close();
    }
    return { ...size, frames: track.frameCount, seconds: micro / 1e6, loops: track.repetitionCount, last };
  }, Buffer.from(bytes).toString('base64'));
  return { ...result, last: new Uint8Array(Buffer.from(result.last, 'base64')) };
}

/** A picture at half its size, as the browser scales it, to set beside a GIF's frame. */
async function halved(page: Page, png: Uint8Array): Promise<Uint8Array> {
  const base64 = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: 960,
      resizeHeight: 540,
      resizeQuality: 'high',
    });
    const canvas = new OffscreenCanvas(960, 540);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const out = await canvas.convertToBlob({ type: 'image/png' });
    return await new Promise<string>((done) => {
      const r = new FileReader();
      r.onload = () => done(String(r.result).split(',')[1] as string);
      r.readAsDataURL(out);
    });
  }, Buffer.from(png).toString('base64'));
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

test('a GIF of steps: it loops, 960 × 540, as long as its video, a held frame once, the same bytes twice', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const gifJob = job({ format: 'gif', height: 540, fps: 15 });
  const first = await video(gifJob);
  const { end } = first;
  expect(end).toMatchObject({ name: 'S04.2a-to-S04.2b.gif', width: 960, height: 540, fps: 15, codec: 'gif' });
  expect(end.warnings).toEqual([]);
  const second = await video(gifJob);
  expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  review('video/S04.2a-to-S04.2b.gif', first.bytes);

  const shown = await decoded(page, first.bytes);
  expect([shown.width, shown.height]).toEqual([960, 540]);
  expect(shown.loops).toBe(Number.POSITIVE_INFINITY);
  // Its time, in hundredths, adds up to the video's; the held seconds are one frame each.
  expect(shown.seconds).toBeCloseTo(end.seconds, 1);
  expect(shown.frames).toBeLessThan(end.frames);
  console.log(
    `GIF (${process.platform}): ${end.frames} frames played, ${shown.frames} in the file, ${end.size} bytes`,
  );
  // The last frame is S04.2b held, at half size, in 256 colours.
  const [png] = await pictures({
    format: 'png',
    target: { kind: 'step', step: 'S04.2b' },
    scale: 1,
    categoryWords: false,
  });
  const apart = await difference(page, shown.last, await halved(page, (png as FileEvent).bytes));
  console.log(`GIF's last frame against S04.2b's picture (${process.platform}): ${JSON.stringify(apart)}`);
  expect(apart.far).toBeLessThan(0.02);
  expect(apart.mean).toBeLessThan(3);
  review('video/S04.2a-to-S04.2b-gif-last.png', shown.last);
});

test('loopweft export --mp4: a scene’s steps, never over a file without --force', async ({ page }) => {
  test.setTimeout(240_000);
  const folder = mkdtempSync(join(tmpdir(), 'loopweft-video-'));
  try {
    const project = join(folder, 'talk.loopweft');
    writeFileSync(project, text);
    const run = async (...args: string[]) => {
      let out = '';
      let err = '';
      const code = await main(args, { out: (t) => (out += t), err: (t) => (err += t) });
      return { code, out, err };
    };
    const made = await run('export', project, '--mp4', '--from', 'S04.3', '--to', 'S04.3', '--hold', '0.5');
    expect(made.err).toBe('');
    expect(made.code).toBe(0);
    expect(made.out).toMatch(
      /^Wrote .*talk-S04\.3\.mp4 \(0:0\d, 1920 × 1080 at 30 fps, 1 step, each step held 0\.5 seconds, \d+\.\d MB\)\.\n$/,
    );
    const bytes = new Uint8Array(readFileSync(join(folder, 'talk-S04.3.mp4')));
    const shown = await played(page, bytes, 'video/mp4', [0]);
    expect([shown.width, shown.height]).toEqual([1920, 1080]);
    expect(shown.duration).toBeGreaterThan(0.5);
    const again = await run('export', project, '--mp4', '--from', 'S04.3', '--to', 'S04.3');
    expect(again.code).toBe(2);
    expect(again.err).toContain('already exists');
    const gif = await run('export', project, '--gif', '--from', 'S04.3', '--to', 'S04.3', '--hold', '0.5');
    expect(gif.code).toBe(0);
    expect(gif.out).toMatch(
      /^Wrote .*talk-S04\.3\.gif \(0:0\d, 960 × 540 at 15 fps, 1 step, each step held 0\.5 seconds, \d+\.\d MB\)\.\n$/,
    );
    const looped = await decoded(page, new Uint8Array(readFileSync(join(folder, 'talk-S04.3.gif'))));
    expect([looped.width, looped.height, looped.loops]).toEqual([960, 540, Number.POSITIVE_INFINITY]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

// Saving goes through a download: the browser's own save dialog (File System Access) cannot be driven.
test.describe('in the Studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.showSaveFilePicker;
      delete w.showOpenFilePicker;
    });
  });

  test('the Export tab plays steps as a video, as the command line does', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?example');
    await page.getByRole('tab', { name: 'Export' }).click();
    const card = page.locator('.mantine-Card-root', {
      has: page.getByRole('heading', { name: 'Video (MP4, WebM or GIF)' }),
    });
    await expect(card).toBeVisible();
    await card.getByLabel('Steps, from one to another').check();
    await choose(page, card.getByRole('combobox', { name: 'From' }), 'S04.2a · Conflict → energy prices');
    await choose(page, card.getByRole('combobox', { name: 'To' }), 'S04.2b · Energy → farm input costs');
    await card.getByLabel('Hold (seconds)').fill('1');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      card.getByRole('button', { name: 'Export MP4…' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${STEM}-S04.2a-to-S04.2b.mp4`);
    const bytes = new Uint8Array(readFileSync((await download.path()) as string));
    await expect(card.getByText(`Last export: ${STEM}-S04.2a-to-S04.2b.mp4`, { exact: false })).toBeVisible();
    review('studio-video.png', new Uint8Array(await page.screenshot()));
    // The command line's video of the same steps: the same length, and the same last frame but for the
    // drawing's rounding (the tests' browser has switches of its own).
    const cli = await video(job({}));
    const [studio, line] = [
      await played(page, bytes, 'video/mp4', [cli.end.seconds - 0.5 / 30]),
      await played(page, cli.bytes, 'video/mp4', [cli.end.seconds - 0.5 / 30]),
    ];
    expect(studio.duration).toBeCloseTo(line.duration, 2);
    review('video/studio-last.png', studio.frames[0] as Uint8Array);
    review('video/command-line-last.png', line.frames[0] as Uint8Array);
    const apart = await difference(page, studio.frames[0] as Uint8Array, line.frames[0] as Uint8Array);
    console.log(
      `Studio's last frame against the command line's (${process.platform}): ${JSON.stringify(apart)}`,
    );
    expect(apart.far).toBeLessThan(0.01);
    expect(apart.mean).toBeLessThan(1);
  });
});
