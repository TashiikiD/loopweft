// The one-file HTML, opened from disk (file://) in this computer's Chrome and in its Edge: the start page and
// its sources, the presenter console, the audience window it opens kept in step both ways (the file has no
// server, so the windows talk directly), a reloaded audience window finding the show again, and the slides
// alone. With LOOPWEFT_REVIEW set to a folder, screens are saved there for the review.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProject, referenceList } from '@loopweft/model';
import { exportHtml } from '@loopweft/player';
import { playerTemplate } from '@loopweft/player/build';
import { chromium, expect, type Page, test } from '@playwright/test';
import { findBrowserNamed } from '../../../tools/chrome.ts';

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

let folder = '';
let file = '';
/** The works the example cites, supplements aside (they sit under their work). */
let works = 0;
test.beforeAll(async () => {
  const read = readProject(readFileSync(resolve('examples/polycrisis.loopweft'), 'utf8'));
  if (!read.ok) throw new Error('The example does not open.');
  const made = exportHtml(read.project, await playerTemplate(), { notes: true });
  works = referenceList(read.project).length;
  folder = mkdtempSync(join(tmpdir(), 'loopweft-html-'));
  file = join(folder, 'Global Polycrisis.html');
  writeFileSync(file, made.html);
});
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

for (const name of ['chrome', 'edge'] as const) {
  test(`the exported HTML, opened from disk in ${name === 'edge' ? 'Edge' : 'Chrome'}`, async () => {
    const executablePath = findBrowserNamed(name);
    test.skip(!executablePath, `${name} is not installed on this computer`);
    test.setTimeout(120_000);
    const browser = await chromium.launch({ executablePath: executablePath as string });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(pathToFileURL(file).href);

      // The start page: the title, what the file holds, and every source.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Global Polycrisis/);
      await expect(page.getByText('11 scenes · 70 steps · 14:00 in all')).toBeVisible();
      await expect(
        page.getByText(/This copy includes the speaker notes and each step’s cue\./),
      ).toBeVisible();
      await expect(page.locator('.lp-ref-list > li')).toHaveCount(works);
      await shot(page, `${name}-1-start`);

      // The console, and the audience window it opens.
      await page.getByRole('button', { name: /Presenter console/ }).click();
      await expect(page).toHaveURL(/\?view=presenter/);
      await expect(page.locator('.lp-scene-sub')).toHaveText(/^Step 1 of 1 · S00\.1/);
      const [audience] = await Promise.all([
        context.waitForEvent('page'),
        page.getByRole('button', { name: 'Open audience window' }).click(),
      ]);
      audience.on('pageerror', (e) => errors.push(`audience: ${e.message}`));
      await audience.waitForLoadState();
      await expect(page.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
        timeout: 10_000,
      });

      // Keys in the console move the audience window, and keys in the audience window move the console.
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('PageDown');
      await expect.poll(() => hashOf(audience)).toBe('#S01.1');
      await audience.keyboard.press('PageDown');
      await expect.poll(() => hashOf(page)).toBe('#S01.2');
      await page.keyboard.press('4');
      await page.keyboard.press('Enter');
      await expect.poll(() => hashOf(audience)).toBe('#S04.1');
      await page.keyboard.press('c');
      await expect(audience.locator('.lw-stage.category-words')).toHaveCount(1);
      await page.waitForTimeout(1500);
      await shot(page, `${name}-2-console`);
      await shot(audience, `${name}-3-audience`);

      // A reloaded audience window finds the show again.
      await page.keyboard.press('PageDown');
      await expect.poll(() => hashOf(audience)).toBe('#S04.2a');
      await audience.reload();
      await expect.poll(() => hashOf(audience)).toBe('#S04.2a');
      await page.keyboard.press('PageDown');
      await expect.poll(() => hashOf(audience)).toBe('#S04.2b');

      // The slides alone, from the start page.
      const slides = await context.newPage();
      await slides.goto(`${pathToFileURL(file).href}?view=audience&rehearse`);
      await expect(slides.locator('.lw-stage')).toHaveCount(1);
      await slides.keyboard.press('n');
      await expect(slides.locator('.lp-rehearsal')).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}
