// The PDFs, in this computer's Chrome or Edge. The speaker notes and references from the Studio's Export tab:
// the Studio loads its own copies of the fonts and makes, in the page, exactly the file `loopweft export --pdf`
// makes in Node. The slides, from the command line and the Studio: a 16:9 page per step, each the picture of its
// step. With LOOPWEFT_REVIEW set to a folder, the PDFs are saved there for the review.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '@loopweft/cli';
import { type JobEvent, notesPdf, referencesPdf } from '@loopweft/export';
import { nodeFonts } from '@loopweft/export/node';
import { readProject } from '@loopweft/model';
import { chromium, expect, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, type PDFRawStream } from 'pdf-lib';
import { findBrowser } from '../../../tools/chrome.ts';
import { difference, pictures, review, text } from './pictures.ts';

const STEM = 'global-polycrisis-the-connections-that-change-everything';

/** The picture of each page of a slides PDF: its one image, as the JPEG it holds. */
async function slideImages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    const [ref] = xobjects?.values() ?? [];
    const image = doc.context.lookup(ref) as PDFRawStream;
    expect(image.dict.get(PDFName.of('Filter'))?.toString()).toBe('/DCTDecode');
    return image.contents;
  });
}

test('loopweft export --pdf slides: a 16:9 page per step, each the picture of its step', async () => {
  test.setTimeout(240_000);
  const folder = mkdtempSync(join(tmpdir(), 'loopweft-slides-'));
  try {
    const project = join(folder, 'talk.loopweft');
    writeFileSync(project, text);
    let out = '';
    const code = await main(['export', project, '--pdf', 'slides'], {
      out: (t) => (out += t),
      err: () => undefined,
    });
    expect(code).toBe(0);
    expect(out).toMatch(/^Wrote .*talk-slides\.pdf \(slides: 70 pages, 16:9, \d+\.\d MB\)\.\n$/);
    const bytes = readFileSync(join(folder, 'talk-slides.pdf'));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(70);
    expect(doc.getPage(36).getSize()).toEqual({ width: 1440, height: 810 });
    review('slides.pdf', bytes);
    // Slide 37 is S05.6b: the picture on its page is that step's, as a PNG export draws it.
    const images = await slideImages(bytes);
    const [png] = await pictures({
      format: 'png',
      target: { kind: 'step', step: 'S05.6b' },
      scale: 1,
      categoryWords: false,
    });
    const browser = await chromium.launch({ executablePath: findBrowser() });
    try {
      const page = await browser.newPage();
      const apart = await difference(page, images[36] as Uint8Array, (png as JobEvent).bytes);
      expect(apart.far, 'blocks of slide 37 apart from S05.6b').toBeLessThan(0.002);
      expect(apart.mean).toBeLessThan(1.5);
      const other = await difference(page, images[35] as Uint8Array, (png as JobEvent).bytes);
      expect(other.far, 'slide 36 is another step').toBeGreaterThan(0.05);
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

// Saving goes through a download: the browser's own save dialog (File System Access) cannot be driven.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
});

test('the Export tab makes the speaker notes and the references, the same files as the command line', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const read = readProject(text);
  if (!read.ok) throw new Error('The example does not open.');
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Export' }).click();
  const card = page.locator('.mantine-Card-root', {
    has: page.getByRole('heading', { name: 'PDF documents' }),
  });

  const save = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: 'Export PDF…' }).click(),
    ]);
    return { name: download.suggestedFilename(), bytes: readFileSync((await download.path()) as string) };
  };

  const notes = await save();
  expect(notes.name).toBe(`${STEM}-speaker-notes.pdf`);
  await expect(card.getByText(/^Last export: .*-speaker-notes\.pdf, 18 pages \(Letter\)/)).toBeVisible();
  const direct = await notesPdf(read.project, { paper: 'letter', fonts: nodeFonts });
  expect(notes.bytes.equals(Buffer.from(direct.bytes))).toBe(true);
  review('notes.pdf', notes.bytes);

  await card.getByLabel('References').check();
  await card.getByLabel('A4').check();
  const references = await save();
  expect(references.name).toBe(`${STEM}-references.pdf`);
  const refs = await referencesPdf(read.project, { paper: 'a4', fonts: nodeFonts });
  expect(references.bytes.equals(Buffer.from(refs.bytes))).toBe(true);
  review('references-a4.pdf', references.bytes);
});

test('the Export tab makes the slides, a page per step, with progress', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Export' }).click();
  const card = page.locator('.mantine-Card-root', {
    has: page.getByRole('heading', { name: 'PDF documents' }),
  });
  await card.getByLabel('Slides (70 pages)').check();
  await expect(card.getByLabel('Letter')).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    card.getByRole('button', { name: 'Export PDF…' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${STEM}-slides.pdf`);
  const doc = await PDFDocument.load(readFileSync((await download.path()) as string));
  expect(doc.getPageCount()).toBe(70);
  await expect(card.getByText(/^Last export: .*-slides\.pdf, 70 pages \(16:9\)/)).toBeVisible();
});
