// The Studio's Present and Export workspaces: the presenter console over the Studio and the audience window
// it opens (a second page that gets the map from the console), kept in step both ways and rejoining after a
// reload; the rehearsal in one window; and the one-file HTML downloaded with or without the notes. With
// LOOPWEFT_REVIEW set to a folder, screens are saved there for the review.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const REVIEW = process.env.LOOPWEFT_REVIEW ? resolve(process.env.LOOPWEFT_REVIEW) : null;

async function shot(page: Page, name: string) {
  if (!REVIEW) return;
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: join(REVIEW, `${name}.png`) });
}

const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

// Saving goes through a download: the browser's own save dialog (File System Access) cannot be driven.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
});

test('present the example from the Studio: the console, the audience window, a rehearsal', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await expect(page.getByText('11 scenes · 70 steps · 14:00 in all')).toBeVisible();
  await shot(page, 'present-1-workspace');

  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 1 of 1 · S00\.1/);
  const [audience] = await Promise.all([
    context.waitForEvent('page'),
    console_.getByRole('button', { name: 'Open audience window' }).click(),
  ]);
  await expect(audience).toHaveURL(/audience\.html\?show=[0-9a-f]{8}/);
  // The audience window has no map of its own: it asks the console, then plays it.
  await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
  await expect(console_.locator('.lp-status .lp-chip.ok')).toHaveText('Audience connected', {
    timeout: 10_000,
  });

  await page.keyboard.press('PageDown');
  await expect.poll(() => hashOf(audience)).toBe('#S01.1');
  await audience.keyboard.press('PageDown');
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/^Step 2 of 4 · S01\.2/);
  await audience.reload();
  await expect(audience.locator('.lw-stage')).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => hashOf(audience)).toBe('#S01.2');
  await page.keyboard.press('PageDown');
  await expect.poll(() => hashOf(audience)).toBe('#S01.3');
  await page.waitForTimeout(1200);
  await shot(page, 'present-2-console');
  await shot(audience, 'present-3-audience');

  await console_.getByRole('button', { name: 'Back to the Studio' }).click();
  await expect(console_).toHaveCount(0);
  // The place stays saved, with a way back to the start.
  await expect(page.getByText('This browser saved a place from an earlier run')).toBeVisible();
  await audience.close();

  await page.getByRole('button', { name: 'Rehearse', exact: true }).click();
  const rehearsal = page.getByRole('dialog', { name: 'Rehearsal' });
  await expect(rehearsal.locator('.lw-stage')).toHaveCount(1);
  await page.keyboard.press('n');
  await expect(rehearsal.locator('.lp-rehearsal')).toBeVisible();
  await expect(rehearsal.locator('.lp-rehearsal h2')).toHaveText('Scene 01 · step 3 of 4');
  await shot(page, 'present-4-rehearsal');
  await page.keyboard.press('Escape');
  await expect(rehearsal).toHaveCount(0);
  await page.getByRole('button', { name: 'Start again from the first step' }).click();
  await expect(page.getByText('This browser saved a place from an earlier run')).toHaveCount(0);
});

test('export the example as one HTML file, with the notes and without', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Export' }).click();
  await expect(
    page.getByText('This copy includes the speaker notes and each step’s cue.', { exact: false }),
  ).toBeVisible();
  await shot(page, 'export-1-workspace');

  const html = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export HTML…' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(
      'global-polycrisis-the-connections-that-change-everything.html',
    );
    return readFileSync((await download.path()) as string, 'utf8');
  };
  const full = await html();
  expect(full).toContain('data-notes="included"');
  await expect(page.getByText(/^Last export: 1\.\d MB, speaker notes included\./)).toBeVisible();

  await page.getByLabel('Include the speaker notes, the script and the cues').uncheck();
  const bare = await html();
  expect(bare).toContain('data-notes="left-out"');
  expect(bare.length).toBeLessThan(full.length);
});

test('the console scrolls in a narrow window (or zoomed in), so every control and scene stays in reach', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  await expect(console_.locator('.lp-scene-sub')).toHaveText(/S00\.1/);
  const strip = console_.getByRole('navigation', { name: 'Scenes' });
  await expect(strip).not.toBeInViewport();
  // With the mouse wheel, as a person scrolls (a script could scroll even a box that hides its overflow).
  await page.mouse.move(400, 300);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 500);
  await expect(strip).toBeInViewport();
  await expect(console_.getByRole('button', { name: 'Open audience window' })).toBeInViewport();
  await shot(page, 'present-5-console-narrow');
});

test('the keyboard shortcuts on a short window: the keys scroll them, and move nothing behind them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: 'Present' }).click();
  await page.getByRole('button', { name: 'Open the console' }).click();
  const console_ = page.getByRole('dialog', { name: 'Presenter console' });
  const sub = console_.locator('.lp-scene-sub');
  await expect(sub).toHaveText(/^Step 1 of 1 · S00\.1/);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help.getByRole('button', { name: 'Close' })).toBeFocused();
  // Taller than the window, the card starts at its top, and the keys scroll it.
  expect(await help.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(help.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInViewport();
  const scrolled = () => help.evaluate((el) => el.scrollTop);
  await page.keyboard.press('ArrowDown');
  await expect.poll(scrolled).toBeGreaterThan(0);
  const down = await scrolled();
  await page.keyboard.press('PageDown');
  await expect.poll(scrolled).toBeGreaterThan(down);
  await page.keyboard.press('End');
  await expect(help.getByText('Esc or ? closes this')).toBeInViewport();
  await shot(page, 'present-6-help-short');
  // Behind it, the show has not moved.
  await expect(sub).toHaveText(/^Step 1 of 1 · S00\.1/);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('PageDown');
  await expect(sub).toHaveText(/S01\.1/);
});
