// SVG drawings, in this computer's Chrome or Edge: every step of the example and the whole map, as true SVG
// (no HTML inside, nothing fetched, every reference defined), drawn back to pixels by the browser within a
// close match of the PNG of the same step; the same project gives the same bytes, a step drawn alone the same
// as in every step; `loopweft export --svg` and the Studio's Export tab make them, with their notes. With
// LOOPWEFT_REVIEW set to a folder, a few drawings are saved there for the review.
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '@loopweft/cli';
import { type FileEvent, SVG_NOTES as NOTES } from '@loopweft/export';
import { readProject, stepKey } from '@loopweft/model';
import { chromium, expect, type Page, test } from '@playwright/test';
import { findBrowser } from '../../../tools/chrome.ts';
import { difference, pictures, review, text } from './pictures.ts';
import { choose } from './story.ts';

const STEM = 'global-polycrisis-the-connections-that-change-everything';
const decoder = new TextDecoder();

/** How far a drawing drawn back may be from its PNG: 1% of blocks (the furthest on GitHub's machines: 0.22%). */
const FAR = 0.01;

/** The drawings whose fingerprints are printed on each system, and kept for the review. */
const FINGERPRINTED = /^(S00\.1|S05\.6b|S07\.2|map)\./;

/** Checks a drawing as an SVG reader would, in the page: well formed, nothing outside it, nothing undefined. */
async function inspect(page: Page, svg: string) {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const error = doc.querySelector('parsererror')?.textContent ?? null;
    const ids = new Set([...doc.querySelectorAll('[id]')].map((e) => e.id));
    const refs = [...source.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1] as string);
    return {
      error,
      root: doc.documentElement.localName,
      foreign: doc.getElementsByTagName('foreignObject').length,
      missing: [...new Set(refs.filter((r) => !ids.has(r)))],
      outside: [...source.matchAll(/(?:href|src)="(?!data:|#)([^"]*)"/g)].map((m) => m[1]),
      texts: doc.getElementsByTagName('text').length,
      images: doc.getElementsByTagName('image').length,
    };
  }, svg);
}

/** The SVG drawn back to pixels by the browser, as a PNG. */
async function rasterize(page: Page, svg: string): Promise<Uint8Array> {
  const base64 = await page.evaluate(async (source) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1] as string;
  }, svg);
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

let folder = '';
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'loopweft-svg-'));
});
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

test('every step as an SVG drawing: true SVG, close to the PNG, the same every time', async () => {
  test.setTimeout(480_000);
  const read = readProject(text);
  if (!read.ok) throw new Error('The example does not open.');
  const keys = read.project.story.scenes.flatMap((s) => s.steps.map((t) => stepKey(s.id, t.id)));
  const svgs = await pictures({ format: 'svg', target: { kind: 'steps' }, scale: 1, categoryWords: false });
  const pngs = await pictures({ format: 'png', target: { kind: 'steps' }, scale: 1, categoryWords: false });
  const [map] = await pictures({ format: 'svg', target: { kind: 'map' }, scale: 1, categoryWords: false });
  const [mapPng] = await pictures({ format: 'png', target: { kind: 'map' }, scale: 1, categoryWords: false });
  expect(svgs.map((s) => s.name)).toEqual(keys.map((k) => `${k}.svg`));

  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const fingerprints: string[] = [];
    let worst = { name: '', far: 0, mean: 0 };
    const pairs = [...svgs.map((s, k) => [s, pngs[k]] as const), [map, mapPng] as const];
    for (const [svgEvent, pngEvent] of pairs) {
      const svg = decoder.decode((svgEvent as FileEvent).bytes);
      const name = (svgEvent as FileEvent).name;
      const report = await inspect(page, svg);
      expect(report, name).toMatchObject({ error: null, root: 'svg', foreign: 0, missing: [], outside: [] });
      expect(report.texts, `${name}: text stays text`).toBeGreaterThan(0);
      expect(svg).toContain('<metadata>Made with Loopweft');
      const drawnBack = await rasterize(page, svg);
      const { far, mean } = await difference(page, drawnBack, (pngEvent as FileEvent).bytes);
      // For the review (and CI's artifact, to compare the systems): the drawings fingerprinted below, and any
      // far from its PNG, each with its PNG and the drawing drawn back.
      const stem = name.replace(/\.svg$/, '');
      if (FINGERPRINTED.test(name) || far >= 0.005) {
        review(`svg/${name}`, (svgEvent as FileEvent).bytes);
        review(`svg/${stem}.png`, (pngEvent as FileEvent).bytes);
        review(`svg/${stem}-drawn.png`, drawnBack);
      }
      test.info().annotations.push({
        type: name,
        description: `far ${(far * 100).toFixed(3)}%, mean ${mean.toFixed(3)}`,
      });
      // The figure's photograph is resampled a little differently in an SVG; everything else is closer.
      expect(far, `${name}: share of 16 × 16 blocks more than 12 levels from the PNG`).toBeLessThan(FAR);
      expect(mean, `${name}: mean difference from the PNG`).toBeLessThan(1.5);
      fingerprints.push(`${name} ${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`);
      if (far > worst.far) worst = { name, far, mean };
    }
    console.log(
      `SVG furthest from its PNG (${process.platform}): ${worst.name}, ${(worst.far * 100).toFixed(2)}% of blocks, mean ${worst.mean.toFixed(2)}`,
    );
    // Recorded on each system, to show whether drawings come out the same everywhere.
    test.info().annotations.push({ type: 'fingerprints', description: fingerprints.slice(0, 6).join(', ') });
    console.log(
      `SVG fingerprints (${process.platform}): ${fingerprints.filter((f) => FINGERPRINTED.test(f)).join(', ')}`,
    );

    // Notes: the example's drawings use filters (glows) and, behind its card columns, a mask.
    const notes = new Set(svgs.flatMap((s) => s.notes ?? []));
    expect([...notes].some((n) => n.startsWith('Text is real text'))).toBe(true);
    expect([...notes].some((n) => n.startsWith('Glows and soft shadows are SVG filters'))).toBe(true);
    expect([...notes].some((n) => n.includes('SVG mask'))).toBe(true);
    expect([...notes].filter((n) => n.startsWith('Drawn approximately'))).toEqual([]);

    // Categories in words: each name after a dot of its category's colour (a decoration the drawing places).
    const words = {
      format: 'svg',
      target: { kind: 'step', step: 'S04.2a' },
      scale: 1,
      categoryWords: true,
    } as const;
    const [wordsSvg] = await pictures(words);
    const [wordsPng] = await pictures({ ...words, format: 'png' });
    const named = decoder.decode((wordsSvg as FileEvent).bytes);
    expect(named).toContain('>ENERGY AND MATERIAL SYSTEMS</text>');
    const apart = await difference(page, await rasterize(page, named), (wordsPng as FileEvent).bytes);
    expect(apart.far).toBeLessThan(FAR);
    expect(apart.mean).toBeLessThan(1.5);
    expect((wordsSvg as FileEvent).notes?.filter((n) => n.startsWith('Drawn approximately'))).toEqual([]);

    for (const key of ['S05.6b', 'S07.2'])
      review(`svg-${key}.svg`, svgs[keys.indexOf(key)]?.bytes as Uint8Array);
    review('svg-map.svg', (map as FileEvent).bytes);
  } finally {
    await browser.close();
  }

  // The same bytes again, and a step drawn alone the same as in every step.
  for (const key of ['S00.1', 'S07.2']) {
    const [alone] = await pictures({
      format: 'svg',
      target: { kind: 'step', step: key },
      scale: 1,
      categoryWords: false,
    });
    expect(
      Buffer.from((alone as FileEvent).bytes).equals(Buffer.from(svgs[keys.indexOf(key)]?.bytes ?? [])),
      key,
    ).toBe(true);
  }
});

/**
 * How two pictures of the same size differ in small places: the mean colour of each 4 × 4 block, the largest
 * difference between two blocks, and the share of blocks more than 12 levels apart (of 255).
 */
async function nearby(page: Page, a: Uint8Array, b: Uint8Array): Promise<{ largest: number; over: number }> {
  return page.evaluate(
    async ([x, y]) => {
      const BLOCK = 4;
      const pixels = async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [p, q] = [await pixels(x), await pixels(y)];
      let largest = 0;
      let over = 0;
      let blocks = 0;
      for (let by = 0; by + BLOCK <= p.height; by += BLOCK) {
        for (let bx = 0; bx + BLOCK <= p.width; bx += BLOCK) {
          blocks++;
          let worst = 0;
          for (let k = 0; k < 3; k++) {
            let sum = 0;
            for (let yy = by; yy < by + BLOCK; yy++) {
              for (let xx = bx; xx < bx + BLOCK; xx++) {
                const i = (yy * p.width + xx) * 4 + k;
                sum += (p.data[i] ?? 0) - (q.data[i] ?? 0);
              }
            }
            worst = Math.max(worst, Math.abs(sum) / (BLOCK * BLOCK));
          }
          largest = Math.max(largest, worst);
          if (worst > 12) over++;
        }
      }
      return { largest, over: over / blocks };
    },
    [Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64')] as const,
  );
}

test('for PowerPoint and Word: no radial gradients, glows as rings, close to the plain drawing, the same every time', async () => {
  test.setTimeout(420_000);
  // A plain step, the title (its shading reaches past the stage), a statement on its backdrop, two steps whose
  // map is faded (S03.2, with responses' rings and dots; S08.3a, with lit halos in it), and the map.
  const keys = ['S04.2a', 'S00.1', 'S01.3', 'S03.2', 'S08.3a'];
  const job = (step: string) =>
    ({
      format: 'svg',
      target: { kind: 'step', step },
      scale: 1,
      categoryWords: false,
      office: true,
    }) as const;
  const browser = await chromium.launch({ executablePath: findBrowser() });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    for (const key of [...keys, 'map']) {
      const target = key === 'map' ? ({ kind: 'map' } as const) : ({ kind: 'step', step: key } as const);
      const [office] = await pictures({ ...job(key), target });
      const [plain] = await pictures({ ...job(key), target, office: false });
      const [png] = await pictures({ format: 'png', target, scale: 1, categoryWords: false });
      const svg = decoder.decode((office as FileEvent).bytes);
      const report = await inspect(page, svg);
      expect(report, key).toMatchObject({ error: null, root: 'svg', foreign: 0, missing: [], outside: [] });
      expect(report.texts, `${key}: text stays text`).toBeGreaterThan(0);
      expect(svg, key).not.toContain('radialGradient');
      // The halos: rings of flat see-through colour, their opacity solved for every faded group around them.
      expect(svg, key).toMatch(/<circle [^>]*fill="#[0-9a-f]{6}" fill-opacity="0\.\d+"\/>/);
      // No group opacity, which Convert to Shape drops: each shape carries its own.
      expect(svg, key).not.toMatch(/<(g|svg) [^>]*\sopacity=/);
      const notes = (office as FileEvent).notes ?? [];
      expect(notes, key).toContain(NOTES.office);
      expect(notes, key).toContain(NOTES.shading);
      expect(
        notes.filter((n) => n.startsWith('Drawn approximately')),
        key,
      ).toEqual([]);
      const drawnBack = await rasterize(page, svg);
      const plainBack = await rasterize(page, decoder.decode((plain as FileEvent).bytes));
      // Only the stage's darkened edges are left out: everything else stays close to the PNG ...
      const { far, mean } = await difference(page, drawnBack, (png as FileEvent).bytes);
      // ... and, in small places, to the plain drawing: where rings meet, at a glyph over its halo, at a
      // response's ring and dot, where a link meets its head, drawn by a browser with a graphics card or without
      // (as on CI's machines, which round faint rings' colours the other way). Only shapes that overlap in a
      // faded group differ by more than 12 levels, in a few blocks: in S08.3a, the heads of two links meeting at
      // a variable (about 27 levels, on every system).
      const local = await nearby(page, drawnBack, plainBack);
      const measured = `PNG: far ${(far * 100).toFixed(3)}%, mean ${mean.toFixed(3)}; plain: largest ${local.largest.toFixed(1)}, over 12 ${(local.over * 100).toFixed(4)}%`;
      test.info().annotations.push({ type: `office ${key}`, description: measured });
      console.log(`Office ${key} (${process.platform}): ${measured}`);
      // Kept for the review (and CI's artifact) before the checks, so a difference can be seen.
      review(`svg-office/${key}.svg`, (office as FileEvent).bytes);
      review(`svg-office/${key}-drawn.png`, drawnBack);
      review(`svg-office/${key}-plain-drawn.png`, plainBack);
      expect.soft(mean, `${key}: mean difference from the PNG`).toBeLessThan(4);
      expect
        .soft(local.largest, `${key}: largest 4 × 4 difference from the plain drawing`)
        .toBeLessThan(key === 'S08.3a' ? 32 : 16);
      expect
        .soft(local.over, `${key}: share of 4 × 4 blocks over 12 levels from the plain drawing`)
        .toBeLessThan(0.0002);
    }
  } finally {
    await browser.close();
  }
  // The same bytes again; and the drawing without the option is the plain one, with its radial gradients.
  const [a] = await pictures(job('S04.2a'));
  const [b] = await pictures(job('S04.2a'));
  expect(Buffer.from((a as FileEvent).bytes).equals(Buffer.from((b as FileEvent).bytes))).toBe(true);
  const [plain] = await pictures({ ...job('S04.2a'), office: false });
  expect(decoder.decode((plain as FileEvent).bytes)).toContain('<radialGradient');
  expect((plain as FileEvent).notes).not.toContain(NOTES.office);
});

test('loopweft export --svg: a step, every step into a new folder, the whole map, with the notes', async () => {
  test.setTimeout(240_000);
  const project = join(folder, 'talk.loopweft');
  writeFileSync(project, text);
  const run = async (...args: string[]) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => (out += t), err: (t) => (err += t) });
    return { code, out, err };
  };
  const one = await run('export', project, '--svg', '--step', 'S07.2');
  expect(one.code).toBe(0);
  expect(one.out).toMatch(/^Wrote .*talk-S07\.2\.svg \(1920 × 1080, 0\.\d MB\)\.\n/);
  expect(one.out).toContain('note: Glows and soft shadows are SVG filters');
  expect(readFileSync(join(folder, 'talk-S07.2.svg'), 'utf8')).toMatch(
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /,
  );

  const all = await run('export', project, '--svg', '--all-steps', '--json');
  expect(all.code).toBe(0);
  const report = JSON.parse(all.out);
  expect(report).toMatchObject({
    ok: true,
    format: 'svg',
    what: 'all-steps',
    out: join(folder, 'talk-steps-svg'),
  });
  expect(report.scale).toBeUndefined();
  expect(report.notes.length).toBeGreaterThan(0);
  expect(readdirSync(join(folder, 'talk-steps-svg'))).toHaveLength(70);

  const map = await run('export', project, '--svg', '--map', '--trim');
  expect(map.code).toBe(0);
  const drawn = readFileSync(join(folder, 'talk-map.svg'), 'utf8');
  const [, w, h] = /<svg [^>]*width="([\d.]+)" height="([\d.]+)"/.exec(drawn) ?? [];
  expect(Number(w)).toBeLessThanOrEqual(1920);
  expect(Number(h)).toBeLessThan(1080);

  const office = await run('export', project, '--svg', '--step', 'S04.2a', '--for-office', '--json');
  expect(office.code).toBe(0);
  expect(JSON.parse(office.out)).toMatchObject({ ok: true, format: 'svg', forOffice: true });
  expect(JSON.parse(office.out).notes).toContain(NOTES.office);
  expect(readFileSync(join(folder, 'talk-S04.2a.svg'), 'utf8')).not.toContain('radialGradient');
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

  test('the Export tab draws a step as SVG and says what to know about it', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/?example');
    await page.getByRole('tab', { name: 'Export' }).click();
    const card = page.locator('.mantine-Card-root', {
      has: page.getByRole('heading', { name: 'Pictures (PNG or SVG)' }),
    });
    await card.getByLabel(/^SVG: a drawing/).check();
    await expect(card.getByText('3840 × 2160 (for print and posters)')).toHaveCount(0);
    await choose(page, card.getByRole('combobox', { name: 'Step' }), 'S07.2 · Conservation');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: 'Export SVG…' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${STEM}-S07.2.svg`);
    const svg = readFileSync((await download.path()) as string, 'utf8');
    const [cli] = await pictures({
      format: 'svg',
      target: { kind: 'step', step: 'S07.2' },
      scale: 1,
      categoryWords: false,
    });
    // The same drawing as the command line's, for the drawing is read from the page, not drawn by the card.
    expect(svg).toBe(decoder.decode((cli as FileEvent).bytes));
    const notes = card.getByRole('alert').filter({ hasText: 'To know about this drawing' });
    await expect(notes).toContainText('Glows and soft shadows are SVG filters');
    await expect(notes).toContainText('SVG mask');
    review('studio-export-svg.png', new Uint8Array(await page.screenshot()));
  });

  test('the Export tab draws a step for PowerPoint and Word, and says what that changes', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/?example');
    await page.getByRole('tab', { name: 'Export' }).click();
    const card = page.locator('.mantine-Card-root', {
      has: page.getByRole('heading', { name: 'Pictures (PNG or SVG)' }),
    });
    const office = card.getByRole('switch', { name: /^For PowerPoint and Word/ });
    await expect(office).toHaveCount(0);
    await card.getByLabel(/^SVG: a drawing/).check();
    await expect(card.getByText(/Convert to Shape keeps/)).toBeVisible();
    await expect(
      card.getByText(/In Word, keep the SVG as a picture; Convert to Shape breaks its text/),
    ).toBeVisible();
    await office.check();
    await choose(page, card.getByRole('combobox', { name: 'Step' }), 'S04.2a · Conflict → energy prices');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: 'Export SVG…' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${STEM}-S04.2a.svg`);
    const svg = readFileSync((await download.path()) as string, 'utf8');
    const [cli] = await pictures({
      format: 'svg',
      target: { kind: 'step', step: 'S04.2a' },
      scale: 1,
      categoryWords: false,
      office: true,
    });
    expect(svg).toBe(decoder.decode((cli as FileEvent).bytes));
    expect(svg).not.toContain('radialGradient');
    const notes = card.getByRole('alert').filter({ hasText: 'To know about this drawing' });
    await expect(notes).toContainText('In Word, keep it as a picture');
    review('studio-export-svg-office.png', new Uint8Array(await page.screenshot()));
  });
});
