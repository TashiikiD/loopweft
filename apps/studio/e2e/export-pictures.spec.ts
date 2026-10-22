// Pictures (PNG), in this computer's Chrome or Edge: drawn by the export page, they match what the audience
// window shows at the same steps; the same project gives the same bytes, from the command line and from the
// Studio alike; the sizes, the trimmed map and categories in words are what they say; `loopweft export --png`
// writes a step, every step into a new folder (never over anything without --force) and the whole map. With
// LOOPWEFT_REVIEW set to a folder, the pictures and the player's screens are saved there for the review.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main } from '@loopweft/cli';
import type { FileEvent } from '@loopweft/export';
import { readProject, serializeProject, stepKey } from '@loopweft/model';
import { exportHtml } from '@loopweft/player';
import { playerTemplate } from '@loopweft/player/build';
import { chromium, expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { findBrowser } from '../../../tools/chrome.ts';
import { difference, pictures, pngSize, review, text } from './pictures.ts';
import { choose } from './story.ts';

const STEM = 'global-polycrisis-the-connections-that-change-everything';

/** Steps with each kind of overlay: a statement, the legend, a caption alone, the figure, cards. */
const COMPARED = ['S01.3', 'S03.1', 'S04.2a', 'S05.6b', 'S07.2', 'S10.3'];

let folder = '';
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'loopweft-pictures-'));
});
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

test('pictures of steps match what the audience window shows, and come out the same every time', async () => {
  test.setTimeout(240_000);
  const read = readProject(text);
  if (!read.ok) throw new Error('The example does not open.');
  const made = await pictures({ format: 'png', target: { kind: 'steps' }, scale: 1, categoryWords: false });
  // Every step, in story order, named by its key, at the stage's size.
  const keys = read.project.story.scenes.flatMap((s) => s.steps.map((t) => stepKey(s.id, t.id)));
  expect(made.map((m) => m.key)).toEqual(keys);
  expect(made.map((m) => m.name)).toEqual(keys.map((k) => `${k}.png`));
  for (const m of made) expect(pngSize(m.bytes)).toEqual({ width: 1920, height: 1080 });

  // The same project gives the same bytes: a second run, of a few steps.
  for (const key of ['S00.1', 'S05.6b', 'S10.4']) {
    const [again] = await pictures({
      format: 'png',
      target: { kind: 'step', step: key },
      scale: 1,
      categoryWords: false,
    });
    expect(
      Buffer.from((again as FileEvent).bytes).equals(Buffer.from(made[keys.indexOf(key)]?.bytes ?? [])),
    ).toBe(true);
  }

  // The audience window itself, from the one-file HTML, at the same steps, reached through the story in
  // order as in a talk (and as the export reaches them), once the fonts are in.
  const html = join(folder, 'example.html');
  writeFileSync(html, exportHtml(read.project, await playerTemplate(), { notes: true }).html);
  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`${pathToFileURL(html).href}?view=audience&capture#S00.1`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    for (const key of keys.slice(1)) {
      // The page shows the step on hashchange, before this listener (registered later) hears it.
      await page.evaluate(
        (k) =>
          new Promise<void>((done) => {
            addEventListener('hashchange', () => done(), { once: true });
            location.hash = k;
          }),
        key,
      );
      if (!COMPARED.includes(key)) continue;
      await page.evaluate(() =>
        Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))),
      );
      await page.waitForTimeout(300);
      const screen = new Uint8Array(await page.screenshot());
      const picture = made[keys.indexOf(key)]?.bytes as Uint8Array;
      review(`png-${key}.png`, picture);
      review(`player-${key}.png`, screen);
      const { far, mean } = await difference(page, picture, screen);
      test.info().annotations.push({
        type: key,
        description: `far ${(far * 100).toFixed(3)}%, mean ${mean.toFixed(3)}`,
      });
      // Within the drawing's own rounding (Chrome lays text out a pixel apart here and there inside a drawn
      // frame), with nothing missing or moved.
      expect(
        far,
        `${key}: share of 16 × 16 blocks more than 12 levels from the audience window`,
      ).toBeLessThan(0.01);
      expect(mean, `${key}: mean difference from the audience window`).toBeLessThan(0.6);
    }
  } finally {
    await browser.close();
  }
});

test('double size, the trimmed whole map and categories in words', async () => {
  test.setTimeout(120_000);
  const [big] = await pictures({
    format: 'png',
    target: { kind: 'step', step: 'S04.2a' },
    scale: 2,
    categoryWords: false,
  });
  expect(pngSize((big as FileEvent).bytes)).toEqual({ width: 3840, height: 2160 });

  const [whole] = await pictures({ format: 'png', target: { kind: 'map' }, scale: 1, categoryWords: false });
  expect(pngSize((whole as FileEvent).bytes)).toEqual({ width: 1920, height: 1080 });
  expect((whole as FileEvent).name).toBe('map.png');
  const [trimmed] = await pictures({
    format: 'png',
    target: { kind: 'map', trim: true },
    scale: 1,
    categoryWords: false,
  });
  const size = pngSize((trimmed as FileEvent).bytes);
  expect(size.width).toBeLessThanOrEqual(1920);
  expect(size.height).toBeLessThan(1080);
  expect(size.width * size.height).toBeLessThan(1920 * 1080);
  review('png-map-trimmed.png', (trimmed as FileEvent).bytes);

  const [words] = await pictures({
    format: 'png',
    target: { kind: 'step', step: 'S04.2a' },
    scale: 1,
    categoryWords: true,
  });
  const [plain] = await pictures({
    format: 'png',
    target: { kind: 'step', step: 'S04.2a' },
    scale: 1,
    categoryWords: false,
  });
  expect(Buffer.from((words as FileEvent).bytes).equals(Buffer.from((plain as FileEvent).bytes))).toBe(false);
  review('png-S04.2a-category-words.png', (words as FileEvent).bytes);
});

test('loopweft export --png: a step, every step into a new folder, and the whole map', async () => {
  test.setTimeout(240_000);
  const project = join(folder, 'talk.loopweft');
  writeFileSync(project, text);
  const run = async (...args: string[]) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => (out += t), err: (t) => (err += t) });
    return { code, out, err };
  };

  const step = await run('export', project, '--png', '--step', 'S05.6b', '--json');
  expect(step.code).toBe(0);
  const result = JSON.parse(step.out);
  expect(result).toMatchObject({
    ok: true,
    format: 'png',
    what: 'step',
    scale: 1,
    out: join(folder, 'talk-S05.6b.png'),
  });
  expect(pngSize(readFileSync(join(folder, 'talk-S05.6b.png')))).toEqual({ width: 1920, height: 1080 });
  // Never over a file without --force.
  const again = await run('export', project, '--png', '--step', 'S05.6b');
  expect(again.code).toBe(2);
  expect(again.err).toContain('already exists');

  const all = await run('export', project, '--png', '--all-steps');
  expect(all.code).toBe(0);
  expect(all.out).toMatch(/^Wrote 70 pictures to .*talk-steps \(1920 × 1080 each, \d+\.\d MB in all\)\.\n$/);
  const files = readdirSync(join(folder, 'talk-steps')).sort();
  expect(files).toHaveLength(70);
  expect(files).toContain('S04.2a.png');
  // The folder must be new without --force; with it, the pictures are replaced.
  const twice = await run('export', project, '--png', '--all-steps');
  expect(twice.code).toBe(2);
  expect(twice.err).toContain('already exists');
  writeFileSync(join(folder, 'talk-steps', 'S04.2a.png'), 'old');
  expect((await run('export', project, '--png', '--all-steps', '--force')).code).toBe(0);
  expect(pngSize(readFileSync(join(folder, 'talk-steps', 'S04.2a.png')))).toEqual({
    width: 1920,
    height: 1080,
  });

  const map = await run(
    'export',
    project,
    '--png',
    '--map',
    '--trim',
    '--scale',
    '2',
    '-o',
    join(folder, 'whole.png'),
  );
  expect(map.code).toBe(0);
  expect(pngSize(readFileSync(join(folder, 'whole.png'))).width).toBeLessThanOrEqual(3840);

  // The same bytes as the export page drew above for that step, by another road.
  const [direct] = await pictures({
    format: 'png',
    target: { kind: 'step', step: 'S05.6b' },
    scale: 1,
    categoryWords: false,
  });
  // TEMPORARY diagnostic: both pictures' fingerprints every time, and both pictures when they differ.
  {
    const { createHash } = await import('node:crypto');
    const fp = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16);
    console.log(
      `S05.6b fingerprints (${process.platform}): cli ${fp(readFileSync(join(folder, 'talk-S05.6b.png')))}, direct ${fp((direct as FileEvent).bytes)}, all-steps ${fp(readFileSync(join(folder, 'talk-steps', 'S05.6b.png')))}`,
    );
  }

  if (!readFileSync(join(folder, 'talk-S05.6b.png')).equals(Buffer.from((direct as FileEvent).bytes))) {
    const n = Date.now();
    review(`mismatch-${n}-cli.png`, new Uint8Array(readFileSync(join(folder, 'talk-S05.6b.png'))));
    review(`mismatch-${n}-direct.png`, (direct as FileEvent).bytes);
    review(
      `mismatch-${n}-all-steps.png`,
      new Uint8Array(readFileSync(join(folder, 'talk-steps', 'S05.6b.png'))),
    );
    console.log(`MISMATCH ${n}`);
  }
  expect(readFileSync(join(folder, 'talk-S05.6b.png')).equals(Buffer.from((direct as FileEvent).bytes))).toBe(
    true,
  );
  // A project without the story still draws its map.
  const read = readProject(text);
  if (!read.ok) throw new Error('The example does not open.');
  const bare = join(folder, 'no-story.loopweft');
  writeFileSync(bare, serializeProject({ ...read.project, story: { scenes: [] } }));
  expect((await run('export', bare, '--png', '--all-steps')).err).toContain('no steps');
  expect((await run('export', bare, '--png', '--map')).code).toBe(0);
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

  test('the Export tab draws a step, every step as one zip, and the whole map', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?example');
    await page.getByRole('tab', { name: 'Export' }).click();
    const card = page.locator('.mantine-Card-root', {
      has: page.getByRole('heading', { name: 'Pictures (PNG or SVG)' }),
    });
    await expect(card).toBeVisible();

    const save = async (button: string) => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        card.getByRole('button', { name: button }).click(),
      ]);
      return {
        name: download.suggestedFilename(),
        bytes: new Uint8Array(readFileSync((await download.path()) as string)),
      };
    };

    await choose(page, card.getByRole('combobox', { name: 'Step' }), 'S05.6b · Richards et al. cameo');
    const one = await save('Export PNG…');
    expect(one.name).toBe(`${STEM}-S05.6b.png`);
    expect(pngSize(one.bytes)).toEqual({ width: 1920, height: 1080 });
    await expect(
      card.getByText(`Last export: ${STEM}-S05.6b.png, 1920 × 1080`, { exact: false }),
    ).toBeVisible();
    // The Studio draws what the command line draws: the same page in the same browser, started another way
    // (the tests' browser has switches of its own), so within the drawing's rounding.
    const [cli] = await pictures({
      format: 'png',
      target: { kind: 'step', step: 'S05.6b' },
      scale: 1,
      categoryWords: false,
    });
    const apart = await difference(page, one.bytes, (cli as FileEvent).bytes);
    expect(apart.far).toBeLessThan(0.01);
    expect(apart.mean).toBeLessThan(0.6);
    review('studio-export.png', new Uint8Array(await page.screenshot()));
    // Drawn again the same way, it is the same file.
    const twice = await save('Export PNG…');
    expect(Buffer.from(twice.bytes).equals(Buffer.from(one.bytes))).toBe(true);

    await card.getByLabel(/^Every step/).check();
    const zip = await save('Export pictures…');
    expect(zip.name).toBe(`${STEM}-steps.zip`);
    const entries = unzipSync(zip.bytes);
    expect(Object.keys(entries)).toHaveLength(70);
    expect(Object.keys(entries)[0]).toBe('S00.1.png');
    // The same picture as the one drawn alone: the browser's drawing (on the graphics card) may leave a few
    // pixels a level apart (of 255) when other pictures were drawn first.
    const inZip = await difference(page, entries['S05.6b.png'] as Uint8Array, one.bytes);
    expect(inZip.far).toBe(0);
    expect(inZip.mean).toBeLessThan(0.01);

    await card.getByLabel('The whole map, without the story').check();
    await card.getByLabel('Trim to the map').check();
    await card.getByLabel(/^3840 × 2160/).check();
    const map = await save('Export PNG…');
    expect(map.name).toBe(`${STEM}-map.png`);
    expect(pngSize(map.bytes).width).toBeLessThanOrEqual(3840);
    expect(pngSize(map.bytes).height).toBeLessThan(2160);
  });
});
