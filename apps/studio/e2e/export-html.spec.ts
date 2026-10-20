// The one-file HTML, opened from disk (file://) in this computer's Chrome and in its Edge: the start page and
// its sources, the presenter console, the audience window it opens kept in step both ways (the file has no
// server, so the windows talk directly), a reloaded audience window finding the show again, the slides alone,
// and the rehearsal notes with the keyboard. With LOOPWEFT_REVIEW set to a folder, screens are saved there for
// the review.
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

      // The slides alone, in a tab the console did not open: it has no join token, so it stays apart from the
      // show (the channel the file's tabs share carries nothing it can prove), and its rehearsal notes open.
      const slides = await context.newPage();
      await slides.goto(`${pathToFileURL(file).href}?view=audience&rehearse`);
      await expect(slides.locator('.lw-stage')).toHaveCount(1);
      const alone = await hashOf(slides);
      await page.keyboard.press('PageDown');
      await expect.poll(() => hashOf(audience)).toBe('#S04.2c');
      await page.waitForTimeout(1500);
      expect(await hashOf(slides)).toBe(alone);
      await expect(page.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected');
      await slides.keyboard.press('n');
      await expect(slides.locator('.lp-rehearsal')).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}

test('the rehearsal notes, from disk: the keyboard stays in them as the show moves', async ({ page }) => {
  const read = readProject(readFileSync(resolve('examples/polycrisis.loopweft'), 'utf8'));
  if (!read.ok) throw new Error('The example does not open.');
  // The example's notes have no links: scene 01's gets one here.
  const scenes = read.project.story.scenes.map((s, i) =>
    i === 1 ? { ...s, notes: `${s.notes ?? ''}\n\nFrom [the report](https://example.org/report).` } : s,
  );
  const story = { ...read.project, story: { ...read.project.story, scenes } };
  const linked = join(folder, 'Linked notes.html');
  writeFileSync(linked, exportHtml(story, await playerTemplate(), { notes: true }).html);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${pathToFileURL(linked).href}?view=audience&rehearse#S01.1`);
  await expect(page.locator('.lw-stage')).toHaveCount(1);

  // A control of the page has the focus when the notes open (the test adds one: the slides have none).
  await page.evaluate(() => {
    const before = document.createElement('button');
    before.id = 'before';
    before.textContent = 'Before';
    document.body.append(before);
    before.focus();
  });
  await page.keyboard.press('n');
  const notes = page.locator('.lp-rehearsal');
  await expect(notes).toBeFocused();
  await expect(notes.locator('h2')).toHaveText('Scene 01 · step 1 of 4');
  const link = notes.getByRole('link', { name: 'the report' });
  // From the link, the slide keys move the show (Space too: a link opens on Enter), and the notes, drawn
  // again for the next step, keep the keyboard's focus.
  for (const [key, step] of [
    ['PageDown', 2],
    ['ArrowRight', 3],
    ['Space', 4],
  ] as const) {
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await page.keyboard.press(key);
    await expect(notes.locator('h2')).toHaveText(`Scene 01 · step ${step} of 4`);
    await expect(notes).toBeFocused();
  }
  // N closes them and gives the focus back.
  await page.keyboard.press('n');
  await expect(notes).toBeHidden();
  await expect(page.locator('#before')).toBeFocused();
  expect(errors).toEqual([]);
});
