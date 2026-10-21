// The speaker notes and references PDFs from the Studio's Export tab, in this computer's Chrome or Edge: the
// Studio fetches its own copies of the fonts and makes, in the page, exactly the file `loopweft export --pdf`
// makes in Node. With LOOPWEFT_REVIEW set to a folder, the two PDFs are saved there for the review.
import { readFileSync } from 'node:fs';
import { notesPdf, referencesPdf } from '@loopweft/export';
import { nodeFonts } from '@loopweft/export/node';
import { readProject } from '@loopweft/model';
import { expect, test } from '@playwright/test';
import { review, text } from './pictures.ts';

const STEM = 'global-polycrisis-the-connections-that-change-everything';

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
